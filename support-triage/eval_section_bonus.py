"""
Evaluate the optimal SECTION_BONUS value by measuring retrieval accuracy
against a manually-labelled sample of tickets with known correct KB sections.

Run with:
    python3 support-triage/eval_section_bonus.py
"""

from __future__ import annotations

import os
import re
import sys

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")

DOMAIN_FILE_MAP = {
    "hackerrank": "hackerrank.txt",
    "claude": "claude.txt",
    "visa": "visa.txt",
}

SEMANTIC_WEIGHT = 0.65
TFIDF_WEIGHT = 0.35

# ---------------------------------------------------------------------------
# Labelled evaluation set
# Each entry: (ticket_text, domain, expected_section)
# Derived from the 20 tickets in output.csv with correct-section labels.
# ---------------------------------------------------------------------------
LABELLED_TICKETS: list[tuple[str, str, str]] = [
    (
        "My HackerRank submission is returning Wrong Answer on test case 4 but my code "
        "handles all edge cases I can think of. It passes the sample cases fine. Could "
        "the judge be using a different input format than what's shown?",
        "hackerrank",
        "CODING CHALLENGES & SUBMISSIONS",
    ),
    (
        "I completed the HackerRank Python Developer certification track last week but "
        "the certificate still hasn't appeared on my profile. I can see the badge in my "
        "achievements but the shareable certificate link is missing.",
        "hackerrank",
        "CERTIFICATES & ASSESSMENTS",
    ),
    (
        "HackerRank sent me a skills test invitation for a job application but the link "
        "expired before I could open it. The role closes tomorrow — can you resend the "
        "invitation or extend the deadline?",
        "hackerrank",
        "HIRING & JOBS",
    ),
    (
        "During a live HackerRank interview session my browser crashed and when I "
        "reconnected all my code was gone and the timer had continued running. I lost "
        "about 20 minutes of work. This is really affecting my assessment.",
        "hackerrank",
        "TECHNICAL ISSUES",
    ),
    (
        "I've been suspended from HackerRank competitions after a plagiarism flag but I "
        "wrote every line myself. How do I appeal this decision?",
        "hackerrank",
        "CONTESTS & COMPETITIONS",
    ),
    (
        "My HackerRank account shows I'm logged in on devices I don't recognise. I "
        "changed my password but I'm worried someone still has access.",
        "hackerrank",
        "ACCOUNT & REGISTRATION",
    ),
    (
        "I'm preparing for technical interviews. What types of problems should I focus "
        "on to improve my HackerRank ranking?",
        "hackerrank",
        "CODING CHALLENGES & SUBMISSIONS",
    ),
    (
        "I've been getting HTTP 429 Too Many Requests errors from the Claude API even "
        "though I'm well below my rate limit tier. The errors happen randomly.",
        "claude",
        "CLAUDE API",
    ),
    (
        "How do I pass a system prompt to Claude when using the Messages API? I want to "
        "set a persona for my chatbot application.",
        "claude",
        "CLAUDE API",
    ),
    (
        "What is the maximum context window for Claude Sonnet and does it differ between "
        "the web interface and the API?",
        "claude",
        "CLAUDE API",
    ),
    (
        "My Claude Pro subscription was billed twice in the same billing cycle. I can "
        "see two identical charges on my credit card statement.",
        "claude",
        "ACCOUNT & BILLING",
    ),
    (
        "My Anthropic API key was accidentally pushed to a public GitHub repository. "
        "I've already deleted the commit but the key may have been exposed. What should "
        "I do?",
        "claude",
        "SAFETY & PRIVACY",
    ),
    (
        "Claude produced a response that contained detailed instructions for something "
        "dangerous. I'm concerned about this and want to report it.",
        "claude",
        "SAFETY & PRIVACY",
    ),
    (
        "I'm building a retrieval-augmented generation system and want to know how to "
        "structure prompts to Claude so it uses the retrieved context faithfully without "
        "hallucinating.",
        "claude",
        "CAPABILITIES & LIMITATIONS",
    ),
    (
        "My Visa debit card keeps getting declined at contactless terminals even though "
        "I have sufficient funds and the card works fine in chip-and-PIN mode.",
        "visa",
        "ACTIVATING & USING YOUR CARD",
    ),
    (
        "There is a charge of $287 on my Visa credit card from a merchant called "
        "INTL PURCHASES that I don't recognise. I want to dispute this charge.",
        "visa",
        "DISPUTES & CHARGEBACKS",
    ),
    (
        "I'm travelling to Japan next month and want to know if my Visa card will work "
        "there and if I'll be charged foreign transaction fees.",
        "visa",
        "CARD BASICS",
    ),
    (
        "Someone has been using my Visa card number to make small test purchases online. "
        "I need to report this fraud and get a replacement card immediately.",
        "visa",
        "CARD SECURITY",
    ),
    (
        "My Visa card was reported lost two weeks ago and I received a replacement, but "
        "I noticed the old card number was still charged by a subscription service.",
        "visa",
        "CARD BASICS",
    ),
    (
        "How do I set up automatic payments for my Visa credit card bill so I never "
        "miss a due date?",
        "visa",
        "PAYMENTS & BILLING",
    ),
]


# ---------------------------------------------------------------------------
# Corpus loading (inline, no import from retriever to allow bonus injection)
# ---------------------------------------------------------------------------
# Production chunk-length thresholds (must match production code exactly):
#   Python retriever  (retriever.py line 84):  len(chunk) > 50
#   TypeScript triage (triage.ts line 131):    chunk.length > 30
PYTHON_CHUNK_MIN = 50
TS_CHUNK_MIN = 30


def _load_corpus_with_sections(domain: str, chunk_min: int = PYTHON_CHUNK_MIN) -> list[tuple[str, str]]:
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
        if chunk and len(chunk) > chunk_min:
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


def _tfidf_scores(ticket: str, chunks: list[str]) -> np.ndarray:
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


def _section_boost_array(ticket_lower: str, sections: list[str], bonus: float) -> np.ndarray:
    boost = np.zeros(len(sections))
    for i, section in enumerate(sections):
        if not section:
            continue
        words = [w for w in re.split(r"[\s&]+", section.lower()) if len(w) > 2]
        if any(re.search(r"\b" + re.escape(w) + r"\b", ticket_lower) for w in words):
            boost[i] = bonus
    return boost


def _semantic_scores(ticket: str, chunks: list[str], cache_key: str) -> np.ndarray | None:
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from embedder import retrieve_semantic
        scored = retrieve_semantic(ticket, chunks, cache_key=cache_key, top_k=len(chunks))
        score_map = {text: score for text, score in scored}
        raw = np.array([score_map.get(c, 0.0) for c in chunks])
        shifted = raw - raw.min()
        max_s = shifted.max()
        return shifted / max_s if max_s > 0 else shifted
    except Exception:
        return None


def retrieve_with_bonus(
    ticket: str,
    domain: str,
    section_bonus: float,
    top_k: int = 3,
) -> list[str]:
    """Return list of retrieved section names (top_k) for a given SECTION_BONUS.

    Uses PYTHON_CHUNK_MIN (50) to match production retriever.py exactly.
    """
    corpus_with_sections = _load_corpus_with_sections(domain, chunk_min=PYTHON_CHUNK_MIN)
    if not corpus_with_sections:
        return []

    chunks = [c for c, _ in corpus_with_sections]
    sections = [s for _, s in corpus_with_sections]

    tfidf = _tfidf_scores(ticket, chunks)
    semantic = _semantic_scores(ticket, chunks, domain)
    boost = _section_boost_array(ticket.lower(), sections, section_bonus)

    if semantic is not None:
        hybrid = SEMANTIC_WEIGHT * semantic + TFIDF_WEIGHT * tfidf + boost
    else:
        hybrid = tfidf + boost

    top_indices = np.argsort(hybrid)[::-1][:top_k]
    return [sections[i] for i in top_indices]


# ---------------------------------------------------------------------------
# TypeScript-style retriever (keyword count + section bonus)
# ---------------------------------------------------------------------------

def ts_retrieve_with_bonus(
    ticket: str,
    domain: str,
    section_bonus: float,
    top_k: int = 3,
) -> list[str]:
    """Simulate the TypeScript keyword-count retriever with configurable bonus.

    Uses TS_CHUNK_MIN (30) to match production triage.ts parseCorpusWithSections exactly.
    """
    corpus_with_sections = _load_corpus_with_sections(domain, chunk_min=TS_CHUNK_MIN)
    if not corpus_with_sections:
        return []

    lower = ticket.lower()
    ticket_words = [w for w in lower.split() if len(w) > 3]

    scored: list[tuple[int, float, str]] = []
    for chunk, section in corpus_with_sections:
        chunk_lower = chunk.lower()
        kw_score = sum(1 for w in ticket_words if w in chunk_lower)
        sec_bonus = 0.0
        if section:
            sec_words = [w for w in re.split(r"[\s&]+", section.lower()) if len(w) > 2]
            if any(re.search(r"\b" + re.escape(w) + r"\b", lower) for w in sec_words):
                sec_bonus = section_bonus
        total = kw_score + sec_bonus
        scored.append((total, kw_score, section))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [s[2] for s in scored[:top_k] if s[0] > 0]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(
    section_bonus: float,
    retriever: str = "python",
    top_k: int = 3,
) -> dict:
    """Compute Hit@top_k and MRR over the labelled set."""
    hits = 0
    reciprocal_ranks: list[float] = []
    misses: list[str] = []

    for ticket, domain, expected_section in LABELLED_TICKETS:
        if retriever == "python":
            retrieved_sections = retrieve_with_bonus(ticket, domain, section_bonus, top_k)
        else:
            retrieved_sections = ts_retrieve_with_bonus(ticket, domain, section_bonus, top_k)

        if expected_section in retrieved_sections:
            hits += 1
            rank = retrieved_sections.index(expected_section) + 1
            reciprocal_ranks.append(1.0 / rank)
        else:
            reciprocal_ranks.append(0.0)
            misses.append(f"  ticket='{ticket[:50]}...', expected='{expected_section}', got={retrieved_sections}")

    n = len(LABELLED_TICKETS)
    return {
        "hit_rate": hits / n,
        "mrr": sum(reciprocal_ranks) / n,
        "hits": hits,
        "n": n,
        "misses": misses,
    }


def run_grid_search(retriever: str) -> float:
    """Grid-search SECTION_BONUS and return the best value."""
    candidates = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60, 0.75, 1.0]
    print(f"\n{'='*60}")
    print(f"  Retriever: {retriever.upper()}")
    print(f"{'='*60}")
    print(f"{'SECTION_BONUS':>14}  {'Hit@3':>6}  {'MRR':>6}  {'Hits':>5}/{len(LABELLED_TICKETS)}")
    print("-" * 40)

    best_bonus = candidates[0]
    best_mrr = -1.0
    results_table: list[tuple[float, float, float, int]] = []

    for bonus in candidates:
        r = evaluate(bonus, retriever=retriever)
        results_table.append((bonus, r["hit_rate"], r["mrr"], r["hits"]))
        marker = ""
        if r["mrr"] > best_mrr:
            best_mrr = r["mrr"]
            best_bonus = bonus
            marker = " <-- best so far"
        print(f"  {bonus:>12.2f}  {r['hit_rate']:>6.3f}  {r['mrr']:>6.3f}  {r['hits']:>3}/{r['n']}{marker}")

    print()

    # Find the winning row
    best_result = evaluate(best_bonus, retriever=retriever)
    if best_result["misses"]:
        print(f"Remaining misses at SECTION_BONUS={best_bonus}:")
        for m in best_result["misses"]:
            print(m)

    print(f"\n  => Best SECTION_BONUS for {retriever}: {best_bonus}  "
          f"(Hit@3={best_result['hit_rate']:.3f}, MRR={best_result['mrr']:.3f})")
    return best_bonus


if __name__ == "__main__":
    print("Evaluating SECTION_BONUS values against 20 labelled support tickets")
    print("Metrics: Hit@3 (correct section in top-3) and MRR (mean reciprocal rank)")

    best_py = run_grid_search("python")
    best_ts = run_grid_search("typescript")

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"  Python  retriever  SECTION_BONUS: {best_py}  (current: 0.15)")
    print(f"  TypeScript retriever  SECTION_BONUS: {best_ts}  (current: 0.50)")
    print()
    print("Update retriever.py and triage.ts with these values.")
