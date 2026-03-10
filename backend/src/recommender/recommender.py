import argparse
import json
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from train_recommender import train


class ContentRecommender:
    def __init__(self, bundle_path: str):
        self.bundle = self._load_or_rebuild_bundle(bundle_path)
        self.meta: pd.DataFrame = self.bundle["meta"]
        self.vectorizer = self.bundle["vectorizer"]
        self.tfidf_matrix = self.bundle["tfidf_matrix"]
        self.sim_matrix = self.bundle["sim_matrix"]
        self.title_to_index = self.bundle["title_to_index"]
        self.accession_to_indices = self._build_accession_index()

    @staticmethod
    def _load_or_rebuild_bundle(bundle_path: str):
        try:
            return joblib.load(bundle_path)
        except Exception as first_error:
            bundle_file = Path(bundle_path).resolve()
            csv_path = bundle_file.with_name("catalog.csv")

            if not csv_path.exists():
                raise RuntimeError(
                    f"Failed to load recommender bundle '{bundle_file}' and no catalog.csv was found for rebuild. "
                    f"Original error: {first_error}"
                ) from first_error

            # Rebuild the model bundle to match the current Python/pandas runtime.
            train(str(csv_path), str(bundle_file))

            try:
                return joblib.load(bundle_file)
            except Exception as second_error:
                raise RuntimeError(
                    f"Failed to rebuild and load recommender bundle at '{bundle_file}'. "
                    f"Rebuild source CSV: '{csv_path}'. "
                    f"Load error after rebuild: {second_error}"
                ) from second_error

    def _build_accession_index(self) -> dict[str, list[int]]:
        mapping: dict[str, list[int]] = {}
        if "accession_no" not in self.meta.columns:
            return mapping

        values = self.meta["accession_no"].fillna("").astype(str).str.strip().tolist()
        for idx, accession in enumerate(values):
            if not accession:
                continue
            mapping.setdefault(accession, []).append(idx)
        return mapping

    @staticmethod
    def _safe_float_array(values: np.ndarray) -> np.ndarray:
        arr = np.asarray(values, dtype=float)
        arr[np.isnan(arr)] = 0.0
        return arr

    def _format_results(self, indices, scores):
        rows = []
        for idx, score in zip(indices, scores):
            item = self.meta.iloc[int(idx)]
            rows.append({
                "score": float(score),
                "title_of_material": str(item.get("title_of_material", "")),
                "program": str(item.get("program", "")),
                "collection": str(item.get("collection", "")),
                "description": str(item.get("description", "")),
                "accession_no": str(item.get("accession_no", "")),
                "row_index": int(idx),
            })
        return rows

    def recommend_similar_to_title(self, title: str, top_k: int = 10, same_program_boost: bool = False):
        """
        Recommend items most similar to a given item title.
        Optionally boost items in the same program slightly.
        """
        if not title:
            return []

        key = title.strip().lower()
        if key not in self.title_to_index:
            # If not found, fall back to query-based recommendation
            return self.recommend_from_query(title, top_k=top_k)

        idx = self.title_to_index[key]
        scores = self.sim_matrix[idx].copy()

        # Do not recommend itself
        scores[idx] = -1.0

        if same_program_boost:
            seed_program = str(self.meta.iloc[idx].get("program", "")).strip().lower()
            if seed_program:
                prog = self.meta["program"].fillna("").astype(str).str.strip().str.lower().values
                boost_mask = (prog == seed_program)
                # small additive boost; tune as you like
                scores = scores + (0.05 * boost_mask.astype(float))
                scores[idx] = -1.0

        top_idx = np.argsort(scores)[::-1][:top_k]
        top_scores = scores[top_idx]
        return self._format_results(top_idx, top_scores)

    def recommend_from_query(self, query: str, top_k: int = 10, program_filter: str | None = None):
        """
        Recommend items similar to a free-text query (e.g., user search).
        Optional program_filter to restrict results.
        """
        if not query:
            return []

        q_vec = self.vectorizer.transform([query])
        scores = cosine_similarity(q_vec, self.tfidf_matrix).ravel()

        if program_filter:
            pf = program_filter.strip().lower()
            prog = self.meta["program"].fillna("").astype(str).str.strip().str.lower().values
            mask = (prog == pf)
            # Zero-out items not matching the filter
            scores = scores * mask.astype(float)

        top_idx = np.argsort(scores)[::-1][:top_k]
        top_scores = scores[top_idx]
        return self._format_results(top_idx, top_scores)

    def keyword_search(self, keyword: str, limit: int = 20):
        """
        Simple contains-based search on title/program/collection/description (not semantic).
        """
        if not keyword:
            return []

        k = keyword.strip().lower()
        df = self.meta.fillna("").astype(str)
        mask = (
            df["title_of_material"].str.lower().str.contains(k, na=False) |
            df["program"].str.lower().str.contains(k, na=False) |
            df["collection"].str.lower().str.contains(k, na=False) |
            df["description"].str.lower().str.contains(k, na=False)
        )
        results = self.meta[mask].head(limit).copy()
        out = []
        for i, row in results.iterrows():
            out.append({
                "title_of_material": str(row.get("title_of_material", "")),
                "program": str(row.get("program", "")),
                "collection": str(row.get("collection", "")),
                "description": str(row.get("description", "")),
                "row_index": int(i),
            })
        return out

    def recommend_for_user_profile(
        self,
        saved_accessions: list[str],
        recent_queries: list[str],
        top_k: int = 10,
        saved_weight: float = 0.7,
        query_weight: float = 0.3,
    ):
        """
        Hybrid recommendation from:
        1) Items the user already saved (content-similarity expansion)
        2) Most recent search queries (query-to-item similarity)

        Returns top items excluding already-saved resources.
        """
        total_items = len(self.meta)
        if total_items == 0:
            return []

        saved_accessions = [str(a).strip() for a in saved_accessions if str(a).strip()]
        recent_queries = [str(q).strip() for q in recent_queries if str(q).strip()]

        if not saved_accessions and not recent_queries:
            return []

        combined_scores = np.zeros(total_items, dtype=float)
        saved_indices: set[int] = set()

        if saved_accessions:
            per_item_weight = saved_weight / max(len(saved_accessions), 1)
            for accession in saved_accessions:
                indices = self.accession_to_indices.get(accession, [])
                for idx in indices:
                    saved_indices.add(idx)
                    combined_scores += per_item_weight * self._safe_float_array(self.sim_matrix[idx])

        if recent_queries:
            # Higher weight to more recent queries (first in list = most recent)
            recency_weights = np.linspace(1.0, 0.4, num=len(recent_queries), endpoint=True)
            recency_weights = recency_weights / recency_weights.sum()

            for query_text, recency in zip(recent_queries, recency_weights):
                q_vec = self.vectorizer.transform([query_text])
                query_scores = cosine_similarity(q_vec, self.tfidf_matrix).ravel()
                combined_scores += query_weight * float(recency) * self._safe_float_array(query_scores)

        if saved_indices:
            for idx in saved_indices:
                combined_scores[idx] = -1.0

        top_idx = np.argsort(combined_scores)[::-1][:top_k]
        top_scores = combined_scores[top_idx]

        valid_pairs = [(int(i), float(s)) for i, s in zip(top_idx, top_scores) if s > 0]
        if not valid_pairs:
            return []

        final_idx = [i for i, _ in valid_pairs]
        final_scores = [s for _, s in valid_pairs]
        return self._format_results(final_idx, final_scores)

    @staticmethod
    def _get_firestore_client(service_account_path: Optional[str] = None):
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as exc:
            raise RuntimeError(
                "firebase-admin is required for user-based recommendations. "
                "Install it with: pip install firebase-admin"
            ) from exc

        if not firebase_admin._apps:
            if service_account_path:
                key_path = Path(service_account_path).resolve()
            else:
                key_path = (Path(__file__).resolve().parents[2] / "serviceAccountKey.json").resolve()

            if not key_path.exists():
                raise FileNotFoundError(f"Service account key not found: {key_path}")

            cred = credentials.Certificate(str(key_path))
            firebase_admin.initialize_app(cred)

        return firestore.client(), firestore

    @staticmethod
    def _extract_datetime(value: Any):
        if value is None:
            return None
        if hasattr(value, "to_pydatetime"):
            try:
                return value.to_pydatetime()
            except Exception:
                return None
        return value

    def load_user_signals(
        self,
        user_id: str,
        saved_limit: int = 100,
        search_limit: int = 10,
        service_account_path: Optional[str] = None,
    ):
        db, firestore = self._get_firestore_client(service_account_path)

        saved_accessions: list[str] = []
        saved_stream = (
            db.collection("saved_resources")
            .where("user_id", "==", user_id)
            .limit(saved_limit)
            .stream()
        )
        for doc in saved_stream:
            data = doc.to_dict() or {}
            accession = str(data.get("accession_no", "")).strip()
            if accession:
                saved_accessions.append(accession)

        recent_queries: list[str] = []
        rows: list[dict[str, Any]] = []
        try:
            search_stream = (
                db.collection("search_history")
                .where("user_id", "==", user_id)
                .order_by("search_date", direction=firestore.Query.DESCENDING)
                .limit(search_limit)
                .stream()
            )
            for doc in search_stream:
                data = doc.to_dict() or {}
                rows.append(
                    {
                        "search_query": str(data.get("search_query", "")).strip(),
                        "search_date": data.get("search_date"),
                    }
                )
        except Exception:
            # Fallback if composite index/order-by constraints are not ready yet.
            fallback_stream = (
                db.collection("search_history")
                .where("user_id", "==", user_id)
                .limit(max(search_limit * 5, search_limit))
                .stream()
            )
            for doc in fallback_stream:
                data = doc.to_dict() or {}
                rows.append(
                    {
                        "search_query": str(data.get("search_query", "")).strip(),
                        "search_date": data.get("search_date"),
                    }
                )

            rows.sort(
                key=lambda row: self._extract_datetime(row.get("search_date")) or 0,
                reverse=True,
            )
            rows = rows[:search_limit]

        for row in rows:
            query_text = str(row.get("search_query", "")).strip()
            if query_text:
                recent_queries.append(query_text)

        return saved_accessions, recent_queries

    def recommend_for_user(
        self,
        user_id: str,
        top_k: int = 10,
        saved_limit: int = 100,
        search_limit: int = 10,
        service_account_path: Optional[str] = None,
        saved_weight: float = 0.7,
        query_weight: float = 0.3,
    ):
        if not user_id or not str(user_id).strip():
            return []

        saved_accessions, recent_queries = self.load_user_signals(
            user_id=str(user_id).strip(),
            saved_limit=saved_limit,
            search_limit=search_limit,
            service_account_path=service_account_path,
        )

        return self.recommend_for_user_profile(
            saved_accessions=saved_accessions,
            recent_queries=recent_queries,
            top_k=top_k,
            saved_weight=saved_weight,
            query_weight=query_weight,
        )


def main():
    parser = argparse.ArgumentParser(description="Run SmartLib hybrid recommender for a user.")
    parser.add_argument("--bundle", required=True, help="Path to recommender.joblib")
    parser.add_argument("--user_id", required=True, help="User UID from Firebase Auth")
    parser.add_argument("--top_k", type=int, default=10, help="Number of recommendations")
    parser.add_argument("--saved_limit", type=int, default=100, help="Max saved resources to read")
    parser.add_argument("--search_limit", type=int, default=10, help="Max recent searches to read")
    parser.add_argument(
        "--service_account",
        default=None,
        help="Optional path to Firebase serviceAccountKey.json",
    )
    parser.add_argument("--saved_weight", type=float, default=0.7, help="Weight of saved-resources signal")
    parser.add_argument("--query_weight", type=float, default=0.3, help="Weight of search-query signal")

    args = parser.parse_args()

    recommender = ContentRecommender(args.bundle)
    results = recommender.recommend_for_user(
        user_id=args.user_id,
        top_k=args.top_k,
        saved_limit=args.saved_limit,
        search_limit=args.search_limit,
        service_account_path=args.service_account,
        saved_weight=args.saved_weight,
        query_weight=args.query_weight,
    )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
