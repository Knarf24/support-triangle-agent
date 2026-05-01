#!/usr/bin/env python3
"""Resume batch processing from where it left off — appends to output.csv without overwriting."""
import csv, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from classifier import classify_domain
from csv_writer import write_row, OUTPUT_FILE
from retriever import retrieve_with_scores
from risk_evaluator import evaluate_risk
from generator import generate_response
from logger_util import log_ticket, log_classification, log_retrieval, log_risk, log_response, log_escalation

INPUT = "../support_issues/support_issues.csv"

with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
    done_ids = {int(r["ticket_id"]) for r in csv.DictReader(f)}

print(f"Already done: {sorted(done_ids)}")

with open(INPUT, "r", encoding="utf-8") as f:
    all_tickets = [r["ticket_text"] for r in csv.DictReader(f) if r.get("ticket_text")]

for i, text in enumerate(all_tickets, 1):
    if i in done_ids:
        continue
    print(f"\n[Ticket #{i}] processing...")
    log_ticket(i, text)
    domain, confidence, scores = classify_domain(text)
    log_classification(domain, confidence, scores)
    print(f"  Domain: {domain.upper()} ({confidence:.0%})")

    scored_chunks = retrieve_with_scores(text, domain)
    context_chunks = [c for c, *_ in scored_chunks]
    has_sem = any(s > 0 for _, _, s, _ in scored_chunks) if scored_chunks else False
    log_retrieval(context_chunks, method="hybrid" if has_sem else "tfidf-only")
    print(f"  Retrieved: {len(context_chunks)} docs")

    escalate, reason, cats = evaluate_risk(text, domain)
    log_risk(escalate, reason, cats)
    print(f"  Risk: {'ESCALATE' if escalate else 'AUTO-RESPOND'}")

    if escalate:
        response = (f"[ESCALATED TO HUMAN AGENT]\nReason: {reason}\n\n"
                    "This ticket has been flagged for human review due to its sensitive nature. "
                    "A support specialist will contact you shortly.")
        log_escalation(reason)
    else:
        print("  Generating via Claude API...")
        response = generate_response(text, domain, context_chunks)
        log_response(response)

    write_row(ticket_id=i, ticket_text=text, domain=domain, domain_confidence=confidence,
              escalated=escalate, escalation_reason=reason, escalation_categories=cats, response=response)
    print(f"  ✓ Written to output.csv")

print("\nDone. All remaining tickets processed.")
