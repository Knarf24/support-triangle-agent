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
from typing import TypedDict

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")

DOMAIN_FILE_MAP = {
    "hackerrank": "hackerrank.txt",
    "claude": "claude.txt",
    "visa": "visa.txt",
}

DOMAIN_HELP_URL = {
    "hackerrank": "https://support.hackerrank.com",
    "claude": "https://support.anthropic.com",
    "visa": "https://usa.visa.com/support",
}

TOP_K = 3

SEMANTIC_WEIGHT = 0.65
TFIDF_WEIGHT = 0.35


class RetrievedDoc(TypedDict, total=False):
    title: str
    content: str
    url: str
    section: str


def _extract_title(chunk: str) -> str:
    """Extract a human-readable title from a Q&A chunk."""
    match = re.search(r"^Q:\s*(.+)", chunk, re.MULTILINE)
    if match:
        return match.group(1).strip()
    section_match = re.search(r"===\s*(.+?)\s*===", chunk)
    if section_match:
        return section_match.group(1).strip()
    return chunk[:60] + ("…" if len(chunk) > 60 else "")


def _load_corpus(domain: str) -> list[str]:
    """Load and split corpus file into individual Q&A chunks."""
    return [chunk for chunk, _ in _load_corpus_with_sections(domain)]


def _load_corpus_with_sections(domain: str) -> list[tuple[str, str]]:
    """Load and split corpus file, returning (chunk, section) pairs."""
    filename = DOMAIN_FILE_MAP.get(domain)
    if not filename:
        return []

    filepath = os.path.join(CORPUS_DIR, filename)
    if not os.path.exists(filepath):
        return []

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    current_section = ""
    current_lines: list[str] = []
    results: list[tuple[str, str]] = []

    def _flush() -> None:
        chunk = "\n".join(current_lines).strip()
        if chunk and len(chunk) > 50:
            results.append((chunk, current_section))
        current_lines.clear()

    for line in content.split("\n"):
        section_match = re.match(r"^===\s*(.+?)\s*===$", line.strip())
        if section_match:
            _flush()
            current_section = section_match.group(1)
        elif re.match(r"^Q:", line) and current_lines:
            _flush()
            current_lines.append(line)
        else:
            current_lines.append(line)

    _flush()
    return results


def _load_corpus_with_domain(domain: str) -> list[tuple[str, str]]:
    """Load and split corpus file, returning (chunk, domain) pairs."""
    return [(chunk, domain) for chunk, _ in _load_corpus_with_sections(domain)]


def _load_corpus_with_domain_and_section(domain: str) -> list[tuple[str, str, str]]:
    """Load and split corpus file, returning (chunk, domain, section) triples."""
    return [(chunk, domain, section) for chunk, section in _load_corpus_with_sections(domain)]


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
) -> list[RetrievedDoc]:
    """
    Retrieve the most relevant corpus chunks using hybrid semantic + TF-IDF.

    Args:
        ticket: The support ticket text.
        domain: One of 'hackerrank', 'claude', 'visa', or 'unknown'.
        top_k: Number of chunks to return.
        verbose: If True, print retrieval method used.

    Returns:
        List of RetrievedDoc dicts with title, content, and url, most relevant first.
    """
    if domain == "unknown":
        tagged3: list[tuple[str, str, str]] = []
        for d in DOMAIN_FILE_MAP:
            tagged3.extend(_load_corpus_with_domain_and_section(d))
        cache_key = "all"
    else:
        tagged3 = _load_corpus_with_domain_and_section(domain)
        cache_key = domain

    if not tagged3:
        return []

    all_chunks = [chunk for chunk, _, _ in tagged3]
    all_domains = [d for _, d, _ in tagged3]
    all_sections = [s for _, _, s in tagged3]

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
    valid = [i for i in top_indices if hybrid[i] > 0.0]
    indices = valid if valid else list(range(min(top_k, len(all_chunks))))

    results: list[RetrievedDoc] = []
    for i in indices:
        chunk = all_chunks[i]
        chunk_domain = all_domains[i]
        chunk_section = all_sections[i]
        doc: RetrievedDoc = {
            "title": _extract_title(chunk),
            "content": chunk,
        }
        url = DOMAIN_HELP_URL.get(chunk_domain)
        if url:
            doc["url"] = url
        if chunk_section:
            doc["section"] = chunk_section
        results.append(doc)
    return results


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
