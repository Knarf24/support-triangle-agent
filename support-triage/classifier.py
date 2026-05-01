"""
Domain Classifier — identifies which platform a support ticket belongs to.
Uses keyword scoring across HackerRank, Claude, and Visa domains.
"""

from __future__ import annotations

DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "hackerrank": [
        "hackerrank", "coding challenge", "test case", "submission", "wrong answer",
        "time limit", "tle", "contest", "leaderboard", "assessment", "certificate",
        "hiring", "code editor", "compile", "algorithm", "data structure",
        "programming test", "hackathon", "rank", "score", "problem set",
        "online judge", "competitive programming", "interview", "recruiter",
        "plagiarism", "disqualified", "language", "runtime error", "segfault",
    ],
    "claude": [
        "claude", "anthropic", "ai assistant", "chatbot", "language model", "llm",
        "context window", "api key", "api error", "rate limit", "tokens",
        "hallucination", "prompt", "conversation", "ai response", "model",
        "claude.ai", "pro plan", "anthropic api", "claude 3", "opus", "sonnet",
        "haiku", "streaming", "memory", "system prompt", "max tokens",
        "overloaded", "subscription", "ai chat", "generated content",
    ],
    "visa": [
        "visa", "credit card", "debit card", "card", "payment", "transaction",
        "declined", "fraud", "dispute", "chargeback", "atm", "pin", "cvv",
        "contactless", "tap to pay", "statement", "balance", "rewards",
        "cashback", "foreign transaction", "travel", "card number", "chip",
        "merchant", "refund", "unauthorized", "lost card", "stolen card",
        "zero liability", "bank", "billing", "interest", "credit limit",
        "prepaid", "autopay", "late fee", "cash advance",
    ],
}

CONFIDENCE_THRESHOLD = 0.25


def classify_domain(ticket: str) -> tuple[str, float, dict[str, float]]:
    """
    Classify a ticket into one of three domains.

    Returns:
        (domain, confidence, score_breakdown)
        domain is 'hackerrank', 'claude', 'visa', or 'unknown'
        confidence is a float 0-1
        score_breakdown shows raw keyword hit counts per domain
    """
    ticket_lower = ticket.lower()
    scores: dict[str, int] = {}

    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in ticket_lower:
                score += 1
        scores[domain] = score

    total = sum(scores.values())
    if total == 0:
        return "unknown", 0.0, {d: 0.0 for d in scores}

    normalized = {d: v / total for d, v in scores.items()}
    best_domain = max(normalized, key=normalized.__getitem__)
    best_score = normalized[best_domain]

    if best_score < CONFIDENCE_THRESHOLD:
        return "unknown", best_score, normalized

    return best_domain, best_score, normalized
