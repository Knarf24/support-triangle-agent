#!/usr/bin/env python3
"""
Submission batch runner.
Reads support_issues/support_issues.csv, runs every ticket through the
full triage pipeline, and writes support_issues/output.csv with columns:
  ticket_id, domain, issue_type, action, confidence, response
Also appends a full reasoning trace to log.txt.
"""
from __future__ import annotations

import csv
import os
import sys
import re

sys.path.insert(0, os.path.dirname(__file__))

from classifier import classify_domain
from retriever import retrieve_with_scores
from risk_evaluator import evaluate_risk
from generator import generate_response
from logger_util import (
    log_classification, log_escalation, log_response,
    log_retrieval, log_risk, log_session_end, log_session_start, log_ticket,
)

ROOT = os.path.join(os.path.dirname(__file__), "..")
INPUT_CSV = os.path.join(ROOT, "support_issues", "support_issues.csv")
OUTPUT_CSV = os.path.join(ROOT, "support_issues", "output.csv")

OUTPUT_FIELDS = ["ticket_id", "domain", "issue_type", "action", "confidence", "response"]


def classify_issue_type(ticket_text: str, escalation_categories: list[str]) -> str:
    """Derive a human-readable issue_type from content and escalation flags."""
    cats = set(escalation_categories)
    if "fraud" in cats:
        return "Fraud"
    if "account_access" in cats:
        return "Account Security"
    if "billing_dispute" in cats:
        return "Billing Dispute"
    if "bug_or_platform_issue" in cats:
        return "Platform Bug"
    if "legal_compliance" in cats:
        return "Legal / Compliance"
    if "safety_critical" in cats:
        return "Safety"

    text = ticket_text.lower()

    billing_kw = r"charg|billed|bill|invoice|refund|subscription|payment|duplicate charge|overcharg"
    account_kw = r"login|log in|password|account|session|delete|gdpr|access|suspend|ban|profile|certif"
    fraud_kw   = r"fraud|stolen|unauthori|skimmed|phish|scam|compromise"
    technical_kw = r"error|timeout|compil|submission|api|limit|500|429|crash|bug|fail|crash|broken|slow|latency|timeout"
    general_kw = r"\bhow\b|\bcan i\b|\bwhat\b|\bpolicy\b|\bcommercial\b|\bstreaming\b|\badd.*card\b|\bgoogle pay\b|\bapple pay\b|clarif"

    if re.search(fraud_kw, text):
        return "Fraud"
    if re.search(billing_kw, text):
        return "Billing"
    if re.search(account_kw, text):
        return "Account"
    if re.search(technical_kw, text):
        return "Technical"
    if re.search(general_kw, text):
        return "General Inquiry"
    return "General Inquiry"


def process(ticket_id: int, text: str) -> dict:
    log_ticket(ticket_id, text)

    domain, confidence, scores = classify_domain(text)
    log_classification(domain, confidence, scores)

    scored_chunks = retrieve_with_scores(text, domain)
    context_chunks = [c for c, *_ in scored_chunks]
    has_sem = any(s > 0 for _, _, s, _ in scored_chunks) if scored_chunks else False
    log_retrieval(context_chunks, method="hybrid (semantic 65% + tfidf 35%)" if has_sem else "tfidf-only")

    escalate, reason, cats = evaluate_risk(text, domain)
    log_risk(escalate, reason, cats)

    if escalate:
        response = (
            f"[ESCALATED TO HUMAN AGENT] Reason: {reason}\n\n"
            "This ticket has been flagged for human review due to its sensitive nature. "
            "A support specialist will contact you shortly."
        )
        log_escalation(reason)
    else:
        response = generate_response(text, domain, context_chunks)
        log_response(response)

    issue_type = classify_issue_type(text, cats)
    action = "ESCALATE" if escalate else "REPLY"

    print(f"  #{ticket_id:02d} | {domain.upper():10s} | {issue_type:20s} | {action:8s} | {confidence:.0%}")

    return {
        "ticket_id": ticket_id,
        "domain": domain,
        "issue_type": issue_type,
        "action": action,
        "confidence": f"{confidence:.3f}",
        "response": response.strip().replace("\n", " "),
    }


def main() -> None:
    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        tickets = [r["ticket_text"] for r in csv.DictReader(f) if r.get("ticket_text")]

    print(f"Loaded {len(tickets)} tickets from {INPUT_CSV}")
    print(f"{'#':>4}  {'Domain':10s}  {'Issue Type':20s}  {'Action':8s}  Conf")
    print("-" * 60)

    log_session_start()

    # Resume support: detect already-done ticket IDs
    done_ids: set[int] = set()
    if os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    done_ids.add(int(row["ticket_id"]))
                except (KeyError, ValueError):
                    pass
        if done_ids:
            print(f"Resuming — already done: {sorted(done_ids)}")

    # Open for append (or create with header)
    write_header = not os.path.exists(OUTPUT_CSV) or not done_ids
    out_f = open(OUTPUT_CSV, "a" if done_ids else "w", newline="", encoding="utf-8")
    writer = csv.DictWriter(out_f, fieldnames=OUTPUT_FIELDS)
    if write_header:
        writer.writeheader()

    auto_n = escalate_n = 0

    for i, text in enumerate(tickets, 1):
        if i in done_ids:
            auto_n += (1 if "REPLY" else 0)   # approximate for summary
            continue
        row = process(i, text)
        writer.writerow(row)
        out_f.flush()
        if row["action"] == "ESCALATE":
            escalate_n += 1
        else:
            auto_n += 1

    out_f.close()

    log_session_end(len(tickets), auto_n, escalate_n)

    print("-" * 60)
    print(f"Done: {len(tickets)} tickets | {auto_n} REPLY | {escalate_n} ESCALATE")
    print(f"Output: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
