import argparse
import re
import joblib
import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def normalize_text(x: str) -> str:
    """Basic cleanup to reduce noise in TF-IDF."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return ""
    x = str(x).strip().lower()
    x = re.sub(r"\s+", " ", x)  # collapse whitespace
    return x


def build_combined_text(df: pd.DataFrame) -> pd.Series:
    """
    Combine fields into one text per item.
    We add light 'field labels' so TF-IDF can learn importance.
    """
    # Make sure expected columns exist (fill missing with empty)
    for col in ["collection", "title_of_material", "program", "description"]:
        if col not in df.columns:
            df[col] = ""

    combined = (
        "title_of_material: " + df["title_of_material"].map(normalize_text)
        + " program: " + df["program"].map(normalize_text)
        + " collection: " + df["collection"].map(normalize_text)
        + " description: " + df["description"].map(normalize_text)
    )
    return combined


def train(csv_path: str, out_path: str, max_features: int = 30000, ngram_max: int = 2) -> None:
    df = pd.read_csv(csv_path)

    # Keep a clean copy of metadata for display
    meta = df.copy()

    # Handle NaNs safely
    for col in ["collection", "title_of_material", "program", "description"]:
        if col in df.columns:
            df[col] = df[col].fillna("")

    # Build text corpus
    combined = build_combined_text(df)

    # TF-IDF settings (good defaults for catalogs)
    vectorizer = TfidfVectorizer(
        stop_words="english",      # OK even for PH context; just reduces common English words
        max_features=max_features,
        ngram_range=(1, ngram_max),
        min_df=1
    )

    tfidf_matrix = vectorizer.fit_transform(combined)

    # For small datasets, precompute item-to-item cosine similarity matrix
    # (fast recommendations later)
    sim_matrix = cosine_similarity(tfidf_matrix, tfidf_matrix)

    # Build a title->index map (case-insensitive) for quick lookup
    # If duplicate titles exist, keep the first occurrence.
    title_to_index = {}
    for i, t in enumerate(meta["title_of_material"].fillna("").astype(str).tolist()):
        key = t.strip().lower()
        if key and key not in title_to_index:
            title_to_index[key] = i

    bundle = {
        "meta": meta,                      # original rows
        "vectorizer": vectorizer,          # TF-IDF vectorizer
        "tfidf_matrix": tfidf_matrix,      # sparse matrix
        "sim_matrix": sim_matrix,          # numpy array
        "title_to_index": title_to_index,  # dict
        "version": "1.0"
    }

    joblib.dump(bundle, out_path)
    print(f"Saved recommender bundle to: {out_path}")
    print(f"Items: {len(meta)} | TF-IDF shape: {tfidf_matrix.shape} | Sim matrix: {sim_matrix.shape}")


def main():
    parser = argparse.ArgumentParser(description="Train and export a content-based recommender from a CSV.")
    parser.add_argument("--csv", required=True, help="Path to resources.csv")
    parser.add_argument("--out", default="recommender.joblib", help="Output model bundle path")
    parser.add_argument("--max_features", type=int, default=30000, help="Max TF-IDF vocabulary size")
    parser.add_argument("--ngram_max", type=int, default=2, help="Max n-gram size (1 or 2 usually)")

    args = parser.parse_args()
    train(args.csv, args.out, args.max_features, args.ngram_max)


if __name__ == "__main__":
    main()
