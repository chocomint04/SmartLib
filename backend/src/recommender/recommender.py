import joblib
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


class ContentRecommender:
    def __init__(self, bundle_path: str):
        self.bundle = joblib.load(bundle_path)
        self.meta: pd.DataFrame = self.bundle["meta"]
        self.vectorizer = self.bundle["vectorizer"]
        self.tfidf_matrix = self.bundle["tfidf_matrix"]
        self.sim_matrix = self.bundle["sim_matrix"]
        self.title_to_index = self.bundle["title_to_index"]

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
