"""
Corpus Retriever — fetches the most relevant support documentation snippets
for a given ticket using a hybrid approach:
  1. Semantic embeddings (sentence-transformers all-MiniLM-L6-v2) — primary
  2. TF-IDF keyword matching — secondary / fallback
  3. Hybrid score: 65% semantic + 35% TF-IDF for best of both worlds

Falls back to TF-IDF-only if the embedding model fails to load.
"""

from __future__ import annotations

import os
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")

DOMAIN_FILE_MAP = {
    "hackerrank": "hackerrank.txt",
    "claude": "claude.txt",
    "visa": "visa.txt",
}

TOP_K = 3

SEMANTIC_WEIGHT = 0.65
TFIDF_WEIGHT = 0.35


def _load_corpus(domain: str) -> list[str]:
    """Load and split corpus file into individual Q&A chunks."""
    filename = DOMAIN_FILE_MAP.get(domain)
    if not filename:
        return []

    filepath = os.path.join(CORPUS_DIR, filename)
    if not os.path.exists(filepath):
        return []

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    chunks = re.split(r"\n(?=Q:)", content)
    chunks = [c.strip() for c in chunks if c.strip() and len(c.strip()) > 50]
    return chunks


def _tfidf_scores(ticket: str, chunks: list[str]) -> np.ndarray:
    """Compute normalized TF-IDF cosine similarity scores for each chunk."""
    documents = chunks + [ticket]
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        max_features=5000,
        sublinear_tf=True,
    )
    try:
        tfidf_matrix = vectorizer.fit_transform(documents)
        ticket_vec = tfidf_matrix[-1]
        corpus_vecs = tfidf_matrix[:-1]
        scores = cosine_similarity(ticket_vec, corpus_vecs).flatten()
    except ValueError:
        scores = np.zeros(len(chunks))

    max_s = scores.max()
    if max_s > 0:
        scores = scores / max_s
    return scores


def _semantic_scores(ticket: str, chunks: list[str], cache_key: str) -> np.ndarray | None:
    """
    Compute semantic embedding similarity scores.
    Returns None if embedding model is unavailable.
    """
    try:
        from embedder import retrieve_semantic
        scored = retrieve_semantic(ticket, chunks, cache_key=cache_key, top_k=len(chunks))
        score_map = {text: score for text, score in scored}
        raw = np.array([score_map.get(c, 0.0) for c in chunks])
        shifted = raw - raw.min()
        max_s = shifted.max()
        return shifted / max_s if max_s > 0 else shifted
    except Exception:
        return None


def retrieve(
    ticket: str,
    domain: str,
    top_k: int = TOP_K,
    verbose: bool = False,
) -> list[str]:
    """
    Retrieve the most relevant corpus chunks using hybrid semantic + TF-IDF.

    Args:
        ticket: The support ticket text.
        domain: One of 'hackerrank', 'claude', 'visa', or 'unknown'.
        top_k: Number of chunks to return.
        verbose: If True, print retrieval method used.

    Returns:
        List of relevant corpus text chunks, most relevant first.
    """
    if domain == "unknown":
        all_chunks: list[str] = []
        for d in DOMAIN_FILE_MAP:
            all_chunks.extend(_load_corpus(d))
        cache_key = "all"
    else:
        all_chunks = _load_corpus(domain)
        cache_key = domain

    if not all_chunks:
        return []

    tfidf = _tfidf_scores(ticket, all_chunks)
    semantic = _semantic_scores(ticket, all_chunks, cache_key)

    if semantic is not None:
        hybrid = SEMANTIC_WEIGHT * semantic + TFIDF_WEIGHT * tfidf
        method = f"hybrid (semantic {int(SEMANTIC_WEIGHT*100)}% + tfidf {int(TFIDF_WEIGHT*100)}%)"
    else:
        hybrid = tfidf
        method = "tfidf-only (semantic unavailable)"

    if verbose:
        print(f"  Retrieval   : {method}")

    top_indices = np.argsort(hybrid)[::-1][:top_k]
    results = [all_chunks[i] for i in top_indices if hybrid[i] > 0.0]
    return results if results else all_chunks[:top_k]


def retrieve_with_scores(
    ticket: str,
    domain: str,
    top_k: int = TOP_K,
) -> list[tuple[str, float, float, float]]:
    """
    Retrieve chunks with detailed scoring breakdown.

    Returns:
        List of (chunk, hybrid_score, semantic_score, tfidf_score) tuples.
    """
    if domain == "unknown":
        all_chunks: list[str] = []
        for d in DOMAIN_FILE_MAP:
            all_chunks.extend(_load_corpus(d))
        cache_key = "all"
    else:
        all_chunks = _load_corpus(domain)
        cache_key = domain

    if not all_chunks:
        return []

    tfidf = _tfidf_scores(ticket, all_chunks)
    semantic = _semantic_scores(ticket, all_chunks, cache_key)

    if semantic is not None:
        hybrid = SEMANTIC_WEIGHT * semantic + TFIDF_WEIGHT * tfidf
    else:
        semantic = np.zeros(len(all_chunks))
        hybrid = tfidf

    top_indices = np.argsort(hybrid)[::-1][:top_k]
    return [
        (all_chunks[i], float(hybrid[i]), float(semantic[i]), float(tfidf[i]))
        for i in top_indices
    ]
