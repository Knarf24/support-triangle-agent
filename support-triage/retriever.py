"""
Corpus Retriever — fetches the most relevant support documentation snippets
for a given ticket using TF-IDF similarity.
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


def retrieve(ticket: str, domain: str, top_k: int = TOP_K) -> list[str]:
    """
    Retrieve the most relevant corpus chunks for a ticket in the given domain.

    Args:
        ticket: The support ticket text.
        domain: One of 'hackerrank', 'claude', 'visa', or 'unknown'.
        top_k: Number of chunks to return.

    Returns:
        List of relevant corpus text chunks, most relevant first.
    """
    if domain == "unknown":
        all_chunks: list[str] = []
        for d in DOMAIN_FILE_MAP:
            all_chunks.extend(_load_corpus(d))
    else:
        all_chunks = _load_corpus(domain)

    if not all_chunks:
        return []

    documents = all_chunks + [ticket]
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        max_features=5000,
        sublinear_tf=True,
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(documents)
    except ValueError:
        return all_chunks[:top_k]

    ticket_vec = tfidf_matrix[-1]
    corpus_vecs = tfidf_matrix[:-1]

    similarities = cosine_similarity(ticket_vec, corpus_vecs).flatten()

    top_indices = np.argsort(similarities)[::-1][:top_k]
    results = [all_chunks[i] for i in top_indices if similarities[i] > 0.0]

    return results if results else all_chunks[:top_k]
