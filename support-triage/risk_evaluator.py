"""
Risk Evaluator — decides whether a ticket should be auto-responded or escalated
to a human agent.
"""

from __future__ import annotations

ESCALATION_PATTERNS: dict[str, list[str]] = {
    "fraud": [
        "fraud", "fraudulent", "scam", "stolen", "unauthorized transaction",
        "unauthorized purchase", "unauthorized charge", "unauthorized use",
        "identity theft", "phishing", "compromised", "hacked account",
        "suspicious activity", "someone used my card", "fake charge",
        "not me", "i didn't make this", "i never made",
    ],
    "billing_dispute": [
        "billing dispute", "overcharged", "wrong amount", "double charge",
        "incorrect charge", "dispute charge", "refund request", "chargeback",
        "didn't receive refund", "unauthorized charge", "payment failed",
        "subscription charge", "unexpected charge",
    ],
    "account_access": [
        "can't log in", "cannot login", "account locked", "locked out",
        "account disabled", "banned account", "suspended account",
        "account compromised", "lost access", "forgot email", "account hacked",
        "password reset not working", "verification failed", "account blocked",
    ],
    "bug_or_platform_issue": [
        "bug", "glitch", "not working", "broken", "error", "crash",
        "data loss", "lost my work", "missing data", "platform down",
        "system error", "service unavailable", "outage", "lost submission",
        "timer stopped", "exam crashed", "corrupted",
    ],
    "legal_compliance": [
        "legal", "lawsuit", "attorney", "lawyer", "sue", "court",
        "gdpr", "privacy violation", "data breach", "regulation",
        "compliance", "law enforcement", "subpoena",
    ],
    "safety_critical": [
        "threatening", "harassment", "abuse", "discrimination",
        "hate speech", "violent", "emergency", "urgent safety",
    ],
}


def evaluate_risk(ticket: str, domain: str) -> tuple[bool, str, list[str]]:
    """
    Evaluate whether a ticket should be escalated.

    Returns:
        (should_escalate, reason, triggered_categories)
        should_escalate: True if ticket must go to human agent
        reason: Human-readable escalation reason or 'safe to auto-respond'
        triggered_categories: List of risk categories detected
    """
    ticket_lower = ticket.lower()
    triggered: list[str] = []

    for category, patterns in ESCALATION_PATTERNS.items():
        for pattern in patterns:
            if pattern in ticket_lower:
                if category not in triggered:
                    triggered.append(category)
                break

    if triggered:
        reasons = []
        for cat in triggered:
            readable = cat.replace("_", " ").title()
            reasons.append(readable)
        reason = "Escalation required: " + ", ".join(reasons)
        return True, reason, triggered

    return False, "Safe to auto-respond", []
