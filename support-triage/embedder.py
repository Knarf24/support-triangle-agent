"""
Semantic Embedder — generates sentence embeddings using a lightweight
sentence-transformers model (all-MiniLM-L6-v2) for better corpus matching.

Model: all-MiniLM-L6-v2
  - 22MB on disk
  - ~80ms inference per query
  - Strong performance on semantic similarity tasks
"""

from __future__ import annotations

import os

import numpy as np

MODEL_NAME = "all-MiniLM-L6-v2"

_model = None
_corpus_embeddings: dict[str, tuple[list[str], np.ndarray]] = {}


def _get_model():
    """Lazy-load the sentence transformer model (loads torch on first call)."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(MODEL_NAME)
        except Exception as e:
            raise RuntimeError(
                f"Failed to load sentence-transformers model '{MODEL_NAME}': {e}"
            ) from e
    return _model


def embed(texts: list[str]) -> np.ndarray:
    """
    Embed a list of texts into dense vectors.

    Args:
        texts: List of strings to embed.

    Returns:
        numpy array of shape (len(texts), embedding_dim).
    """
    model = _get_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings


def embed_corpus(corpus_chunks: list[str], cache_key: str) -> np.ndarray:
    """
    Embed corpus chunks, using an in-memory cache keyed by cache_key.
    Re-embeds if the chunk list changes.

    Args:
        corpus_chunks: List of text chunks to embed.
        cache_key: Cache key (e.g., domain name).

    Returns:
        numpy array of embeddings for all chunks.
    """
    global _corpus_embeddings

    cached = _corpus_embeddings.get(cache_key)
    if cached is not None:
        cached_chunks, cached_embeds = cached
        if cached_chunks == corpus_chunks:
            return cached_embeds

    embeddings = embed(corpus_chunks)
    _corpus_embeddings[cache_key] = (corpus_chunks, embeddings)
    return embeddings


def cosine_similarity_matrix(query_vec: np.ndarray, corpus_vecs: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarities between one query vector and all corpus vectors.

    Args:
        query_vec: 1D array of shape (dim,).
        corpus_vecs: 2D array of shape (n, dim).

    Returns:
        1D array of shape (n,) with similarity scores in [-1, 1].
    """
    q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    c_norms = corpus_vecs / (np.linalg.norm(corpus_vecs, axis=1, keepdims=True) + 1e-10)
    return c_norms @ q_norm


def retrieve_semantic(
    ticket: str,
    corpus_chunks: list[str],
    cache_key: str,
    top_k: int = 3,
) -> list[tuple[str, float]]:
    """
    Retrieve the top-k most semantically similar corpus chunks for a ticket.

    Args:
        ticket: Support ticket text.
        corpus_chunks: List of candidate corpus chunks.
        cache_key: Cache identifier for corpus embeddings.
        top_k: Number of results to return.

    Returns:
        List of (chunk_text, similarity_score) tuples, most similar first.
    """
    if not corpus_chunks:
        return []

    corpus_embeds = embed_corpus(corpus_chunks, cache_key)
    ticket_embed = embed([ticket])[0]

    similarities = cosine_similarity_matrix(ticket_embed, corpus_embeds)
    top_indices = np.argsort(similarities)[::-1][:top_k]

    return [(corpus_chunks[i], float(similarities[i])) for i in top_indices]
