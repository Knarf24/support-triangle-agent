# Multi-Domain Support Triage Agent

A terminal-based AI agent that automatically triages customer support tickets across **HackerRank**, **Claude Help Center**, and **Visa** using Retrieval-Augmented Generation (RAG) powered by the Claude API.

## Architecture

```
support-triage/
├── main.py              Entry point — CLI runner (interactive, demo, batch)
├── classifier.py        Domain classifier (keyword scoring)
├── retriever.py         TF-IDF corpus retriever
├── risk_evaluator.py    Escalation logic
├── generator.py         Claude API response generator
├── logger_util.py       Reasoning trace logger → log.txt
├── csv_writer.py        Results writer → output.csv
├── corpus/
│   ├── hackerrank.txt   HackerRank support documentation
│   ├── claude.txt       Claude/Anthropic support documentation
│   └── visa.txt         Visa cardholder support documentation
├── requirements.txt
└── README.md
```

## Pipeline (per ticket)

```
Ticket Input
    → Domain Classifier     (keyword scoring → HackerRank / Claude / Visa)
    → Corpus Retriever      (TF-IDF similarity → top-3 relevant docs)
    → Risk Evaluator        (escalation rules → fraud / billing / access / bugs)
    → Response Generator    (Claude API + RAG context → grounded reply)
    → Output                (output.csv + log.txt)
```

## Setup

Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Interactive mode (enter tickets manually)
```bash
python main.py
```
Type your ticket, press Enter twice to submit. Type `quit` to exit.

### Demo mode (8 built-in sample tickets)
```bash
python main.py --demo
```

### Batch mode (from CSV file)
```bash
python main.py --batch support_issues.csv
```
Your CSV must have a `ticket_text` column.

## Output Files

| File | Description |
|------|-------------|
| `output.csv` | All ticket predictions: domain, confidence, escalation status, response |
| `log.txt` | Full reasoning trace: classification scores, retrieved docs, risk flags, responses |

## Escalation Triggers

The agent escalates (routes to human agent) when it detects:

- **Fraud** — unauthorized transactions, suspicious activity, stolen card
- **Billing Dispute** — overcharges, double charges, dispute requests
- **Account Access** — locked out, account compromised, login failures
- **Platform Bug** — crashes, data loss, broken functionality
- **Legal/Compliance** — GDPR, lawsuits, law enforcement
- **Safety Critical** — harassment, threats, abuse

## Hackathon Deliverables

| File | Description |
|------|-------------|
| `code.zip` | Full agent codebase |
| `output.csv` | Predictions for all `support_issues.csv` tickets |
| `log.txt` | Full chat transcript from agent session |

To generate the submission files, run:
```bash
python main.py --batch support_issues.csv
zip -r code.zip . --exclude "*.csv" "log.txt" "__pycache__/*" "*.pyc" "corpus/*"
```
