"""
Logger — writes full agent reasoning trace and interactions to log.txt.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

LOG_FILE = os.path.join(os.path.dirname(__file__), "log.txt")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _write(text: str) -> None:
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(text + "\n")


def log_session_start() -> None:
    _write("\n" + "=" * 70)
    _write(f"SESSION START: {_now()}")
    _write("=" * 70)


def log_ticket(ticket_id: int, ticket_text: str) -> None:
    _write(f"\n[TICKET #{ticket_id}] {_now()}")
    _write(f"INPUT:\n{ticket_text.strip()}")


def log_classification(domain: str, confidence: float, scores: dict[str, float]) -> None:
    score_str = " | ".join(f"{d}: {s:.2f}" for d, s in scores.items())
    _write(f"CLASSIFICATION: domain={domain.upper()} confidence={confidence:.2f} [{score_str}]")


def log_retrieval(chunks: list[str], method: str = "hybrid") -> None:
    _write(f"RETRIEVAL [{method}]: {len(chunks)} chunk(s) retrieved")
    for i, chunk in enumerate(chunks, 1):
        preview = chunk[:120].replace("\n", " ")
        _write(f"  Chunk {i}: {preview}...")


def log_risk(should_escalate: bool, reason: str, categories: list[str]) -> None:
    status = "ESCALATE" if should_escalate else "AUTO-RESPOND"
    _write(f"RISK EVALUATION: {status}")
    _write(f"  Reason: {reason}")
    if categories:
        _write(f"  Categories: {', '.join(categories)}")


def log_response(response: str) -> None:
    _write(f"RESPONSE GENERATED:\n{response.strip()}")


def log_escalation(reason: str) -> None:
    _write(f"ESCALATION: Ticket routed to human agent. Reason: {reason}")


def log_error(error: str) -> None:
    _write(f"ERROR: {error}")


def log_session_end(total: int, auto_responded: int, escalated: int) -> None:
    _write("\n" + "-" * 70)
    _write(f"SESSION END: {_now()}")
    _write(f"SUMMARY: {total} tickets processed | {auto_responded} auto-responded | {escalated} escalated")
    _write("=" * 70 + "\n")
