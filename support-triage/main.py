#!/usr/bin/env python3
"""
Multi-Domain Support Triage Agent
----------------------------------
Terminal-based AI agent that automatically triages customer support tickets
across HackerRank, Claude Help Center, and Visa using RAG + Claude API.

Usage:
    python main.py                      # Interactive terminal mode
    python main.py --batch tickets.csv  # Batch mode from CSV file
    python main.py --demo               # Run built-in demo tickets

Output:
    output.csv  — predictions and responses for all processed tickets
    log.txt     — full reasoning trace per ticket
"""

from __future__ import annotations

import argparse
import csv
import sys
import textwrap

from classifier import classify_domain
from csv_writer import init_csv, write_row
from generator import generate_response
from logger_util import (
    log_classification,
    log_error,
    log_escalation,
    log_response,
    log_retrieval,
    log_risk,
    log_session_end,
    log_session_start,
    log_ticket,
)
from retriever import retrieve, retrieve_with_scores
from risk_evaluator import evaluate_risk

SEPARATOR = "=" * 65

DEMO_TICKETS = [
    "My HackerRank submission keeps showing Wrong Answer even though my code works perfectly on my local machine. I tested all the examples and they pass. What could be wrong?",
    "I'm trying to use the Claude API but getting a 429 error every few minutes. I have a Pro subscription. How do I fix rate limiting?",
    "Someone made an unauthorized purchase on my Visa credit card for $340. I never gave anyone my card details. What do I do?",
    "I can't log in to my HackerRank account. I tried resetting the password but the email never arrived.",
    "My Claude.ai subscription was charged twice this month. I want a full refund for the duplicate charge.",
    "How do I use contactless payment with my Visa debit card?",
    "I joined a HackerRank contest but can't see any problems even though the contest already started.",
    "Does Claude support streaming responses through the API?",
]


def print_banner() -> None:
    print("\n" + SEPARATOR)
    print(" Multi-Domain Support Triage Agent")
    print(" Domains: HackerRank | Claude | Visa")
    print(" Powered by Claude API + RAG")
    print(SEPARATOR)


def process_ticket(
    ticket_id: int,
    ticket_text: str,
    verbose: bool = True,
    show_scores: bool = False,
) -> dict:
    """
    Full pipeline for a single support ticket.
    Returns a result dict with all outputs.
    """
    log_ticket(ticket_id, ticket_text)

    if verbose:
        print(f"\n[Ticket #{ticket_id}]")
        wrapped = textwrap.fill(ticket_text.strip(), width=60, initial_indent="  ", subsequent_indent="  ")
        print(wrapped)
        print()

    domain, confidence, scores = classify_domain(ticket_text)
    log_classification(domain, confidence, scores)

    if verbose:
        domain_display = domain.upper() if domain != "unknown" else "UNKNOWN"
        print(f"  Domain      : {domain_display} (confidence: {confidence:.0%})")

    scored_chunks = retrieve_with_scores(ticket_text, domain)
    context_chunks = [chunk for chunk, *_ in scored_chunks]

    has_semantic = any(sem > 0 for _, _, sem, _ in scored_chunks) if scored_chunks else False
    retrieval_method = f"hybrid (semantic 65% + tfidf 35%)" if has_semantic else "tfidf-only"
    log_retrieval(context_chunks, method=retrieval_method)

    if verbose:
        print(f"  Retrieved   : {len(context_chunks)} doc(s)  [{retrieval_method}]")
        if show_scores and scored_chunks:
            print()
            print("  Score breakdown (hybrid | semantic | tfidf):")
            for i, (chunk, hybrid, sem, tfidf_s) in enumerate(scored_chunks, 1):
                preview = chunk[:60].replace("\n", " ")
                print(f"    [{i}] {hybrid:.3f} | {sem:.3f} | {tfidf_s:.3f}  — {preview}...")
            print()

    should_escalate, risk_reason, risk_categories = evaluate_risk(ticket_text, domain)
    log_risk(should_escalate, risk_reason, risk_categories)

    if verbose:
        status = "ESCALATE ⚠" if should_escalate else "AUTO-RESPOND ✓"
        print(f"  Risk Status : {status}")
        if risk_categories:
            print(f"  Risk Flags  : {', '.join(risk_categories)}")

    if should_escalate:
        response = (
            f"[ESCALATED TO HUMAN AGENT]\n"
            f"Reason: {risk_reason}\n\n"
            f"This ticket has been flagged for human review due to its sensitive nature. "
            f"A support specialist will contact you shortly."
        )
        log_escalation(risk_reason)
    else:
        if verbose:
            print("  Generating response via Claude API...")
        response = generate_response(ticket_text, domain, context_chunks)
        log_response(response)

    if verbose:
        print("\n" + "-" * 50)
        print("RESPONSE:")
        print("-" * 50)
        formatted = textwrap.fill(response, width=60, initial_indent="  ", subsequent_indent="  ")
        print(formatted)
        print("-" * 50)

    write_row(
        ticket_id=ticket_id,
        ticket_text=ticket_text,
        domain=domain,
        domain_confidence=confidence,
        escalated=should_escalate,
        escalation_reason=risk_reason,
        escalation_categories=risk_categories,
        response=response,
    )

    return {
        "ticket_id": ticket_id,
        "domain": domain,
        "escalated": should_escalate,
        "response": response,
    }


def run_interactive(show_scores: bool = False) -> None:
    """Interactive terminal mode — process one ticket at a time."""
    print_banner()
    print("\nEnter your support ticket below.")
    print("Type 'quit' or 'exit' to stop. Type 'demo' to run demo tickets.\n")

    ticket_id = 1
    auto_responded = 0
    escalated = 0

    log_session_start()
    init_csv()

    while True:
        print(SEPARATOR)
        try:
            lines = []
            print("Ticket (press Enter twice to submit):")
            while True:
                line = input()
                if line.lower() in ("quit", "exit"):
                    print("\nExiting. Results saved to output.csv and log.txt")
                    log_session_end(ticket_id - 1, auto_responded, escalated)
                    return
                if line.lower() == "demo" and not lines:
                    run_demo(starting_id=ticket_id, show_scores=show_scores)
                    return
                if line == "" and lines:
                    break
                lines.append(line)

            ticket_text = "\n".join(lines).strip()
            if not ticket_text:
                print("No input detected. Please enter a ticket.")
                continue

            result = process_ticket(ticket_id, ticket_text, show_scores=show_scores)
            if result["escalated"]:
                escalated += 1
            else:
                auto_responded += 1
            ticket_id += 1

        except KeyboardInterrupt:
            print("\n\nInterrupted. Results saved to output.csv and log.txt")
            log_session_end(ticket_id - 1, auto_responded, escalated)
            break


def run_demo(starting_id: int = 1, show_scores: bool = False) -> None:
    """Run all built-in demo tickets automatically."""
    print_banner()
    print("\nRunning demo with 8 sample tickets...\n")

    log_session_start()
    init_csv()

    auto_responded = 0
    escalated = 0

    for i, ticket in enumerate(DEMO_TICKETS, starting_id):
        result = process_ticket(i, ticket, verbose=True, show_scores=show_scores)
        if result["escalated"]:
            escalated += 1
        else:
            auto_responded += 1
        print()

    total = len(DEMO_TICKETS)
    log_session_end(total, auto_responded, escalated)

    print(SEPARATOR)
    print(f"Demo complete: {total} tickets | {auto_responded} auto-responded | {escalated} escalated")
    print("Results saved to output.csv and log.txt")
    print(SEPARATOR)


def run_batch(filepath: str, show_scores: bool = False) -> None:
    """Process tickets from a CSV file (must have a 'ticket_text' column)."""
    print_banner()
    print(f"\nBatch mode: loading tickets from '{filepath}'...\n")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if "ticket_text" not in (reader.fieldnames or []):
                print("Error: CSV must have a 'ticket_text' column.")
                sys.exit(1)
            tickets = [row["ticket_text"] for row in reader if row.get("ticket_text")]
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)

    print(f"Loaded {len(tickets)} ticket(s).\n")

    log_session_start()
    init_csv()

    auto_responded = 0
    escalated = 0

    for i, ticket_text in enumerate(tickets, 1):
        result = process_ticket(i, ticket_text, verbose=True, show_scores=show_scores)
        if result["escalated"]:
            escalated += 1
        else:
            auto_responded += 1
        print()

    total = len(tickets)
    log_session_end(total, auto_responded, escalated)

    print(SEPARATOR)
    print(f"Batch complete: {total} tickets | {auto_responded} auto-responded | {escalated} escalated")
    print("Results saved to output.csv and log.txt")
    print(SEPARATOR)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Multi-Domain Support Triage Agent (HackerRank | Claude | Visa)"
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run demo with 8 sample support tickets",
    )
    parser.add_argument(
        "--batch",
        metavar="FILE",
        help="Batch mode: process tickets from a CSV file (needs 'ticket_text' column)",
    )
    parser.add_argument(
        "--scores",
        action="store_true",
        help="Show hybrid/semantic/TF-IDF score breakdown per retrieved doc",
    )
    args = parser.parse_args()

    if args.demo:
        run_demo(show_scores=args.scores)
    elif args.batch:
        run_batch(args.batch, show_scores=args.scores)
    else:
        run_interactive(show_scores=args.scores)


if __name__ == "__main__":
    main()
