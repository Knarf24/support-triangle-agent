"""
CSV Writer — outputs all ticket predictions and classifications to output.csv.
"""

from __future__ import annotations

import csv
import os
from datetime import datetime, timezone

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "output.csv")

FIELDNAMES = [
    "ticket_id",
    "ticket_text",
    "domain",
    "domain_confidence",
    "escalated",
    "escalation_reason",
    "escalation_categories",
    "response",
    "timestamp",
]


def init_csv() -> None:
    """Create/overwrite output.csv with headers."""
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()


def write_row(
    ticket_id: int,
    ticket_text: str,
    domain: str,
    domain_confidence: float,
    escalated: bool,
    escalation_reason: str,
    escalation_categories: list[str],
    response: str,
) -> None:
    """Append a processed ticket result to output.csv."""
    with open(OUTPUT_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writerow({
            "ticket_id": ticket_id,
            "ticket_text": ticket_text.strip().replace("\n", " "),
            "domain": domain,
            "domain_confidence": f"{domain_confidence:.3f}",
            "escalated": "YES" if escalated else "NO",
            "escalation_reason": escalation_reason,
            "escalation_categories": "; ".join(escalation_categories),
            "response": response.strip().replace("\n", " "),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
