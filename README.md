# Triage360

An AI-assisted support triage system that classifies incoming customer tickets, evaluates escalation risk, retrieves relevant documentation, and generates a grounded response — or routes the ticket to a human when it shouldn't be automated.

## Problem

Support tickets for a multi-product organization arrive across unrelated domains (a coding-assessment platform, an AI assistant, a payment card issuer, in this build) and need different classification, documentation lookup, and escalation handling. Triaging that manually is slow and inconsistent; a single automated flow that ignores context gets both the routing and the response wrong.

## What it does

For each ticket:

1. **Classify** the domain (HackerRank, Claude/Anthropic, Visa, or unknown) using keyword scoring.
2. **Evaluate risk** — check for fraud, billing disputes, account access issues, platform bugs, legal/compliance concerns, or safety-critical language.
3. **Retrieve** relevant support documentation for that domain.
4. **Respond** — generate a grounded reply via the Claude API, or return an escalation message if the ticket was flagged for a human.
5. **Persist** the ticket, decision, and retrieved sources so it shows up in ticket history and aggregate stats.

## Architecture / request flow

This repository contains two related implementations built at different stages of the project.

### Full-stack web app (`artifacts/`)

React (Vite) frontend + Express 5 API + PostgreSQL (Drizzle ORM):

```
Incoming ticket
  → Domain classification   (keyword scoring against per-domain term lists)
  → Risk evaluation          (escalation-pattern matching across 6 categories)
  → Document retrieval       (keyword-overlap scoring against a per-domain corpus)
  → AI response generation   (Claude API, grounded in retrieved docs) — or an escalation message
  → Persisted to PostgreSQL
  → Ticket history / stats views
```

- `artifacts/triage-ui` — React app: triage console, ticket history, stats dashboard
- `artifacts/api-server` — Express API: `POST /api/triage`, `POST /api/triage/stream` (SSE), `GET /api/tickets`, `GET /api/tickets/:id`, `GET /api/triage/stats`
- `lib/db` — Drizzle ORM schema and PostgreSQL connection
- `lib/api-zod` / `lib/api-spec` — request/response contracts (Zod schemas generated from an OpenAPI spec via Orval)
- `lib/integrations-anthropic-ai` — Claude API client wrapper

The classification and risk-evaluation logic in `artifacts/api-server/src/lib/triage.ts` is a TypeScript port of the same logic in the Python CLI below. **Document retrieval in the web app is keyword-overlap scoring, not TF-IDF** — see the note below.

### Python CLI prototype (`support-triage/`)

A terminal-based agent covering the same three domains and escalation categories, with a more advanced retriever: a hybrid of semantic embeddings (`all-MiniLM-L6-v2`, 65%) and TF-IDF keyword matching (scikit-learn, 35%). Full detail in [`support-triage/README.md`](support-triage/README.md).

```bash
cd support-triage
python main.py            # interactive terminal mode
python main.py --demo     # 8 built-in sample tickets
python main.py --batch support_issues.csv
```

> **Retrieval note:** the Python CLI implements genuine TF-IDF + semantic hybrid retrieval. The full-stack web app's retriever is a simpler keyword-overlap scorer over the same corpus files — it does not use TF-IDF weighting. If you've seen "TF-IDF retrieval" attributed to the web app elsewhere, that describes the CLI prototype's retriever, not `artifacts/api-server`.

## Key capabilities

- Multi-domain ticket classification (HackerRank, Claude/Anthropic, Visa)
- Rule-based escalation across 6 risk categories: fraud, billing disputes, account access, platform bugs, legal/compliance, safety-critical
- Retrieval-augmented response generation grounded in per-domain documentation
- Streaming responses (Server-Sent Events) in the live triage console
- Ticket history and aggregate stats — auto-response rate, escalation rate, sources per ticket, trends over time
- Optional multimodal ticket input (PDF/image text extraction via `pdfjs-dist` / `tesseract.js`) in the UI

## Tech stack

**Web app:** TypeScript, React, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts, Express 5, Node.js, pino, PostgreSQL, Drizzle ORM, Zod, Orval, Anthropic Claude API, pnpm workspaces.

**CLI prototype:** Python 3.11, scikit-learn, sentence-transformers, Anthropic Claude API.

## Local development

Requires Node.js 24, [pnpm](https://pnpm.io), and a PostgreSQL database.

```bash
pnpm install
pnpm --filter @workspace/db run push                 # apply schema to your database
PORT=8081 pnpm --filter @workspace/api-server run dev
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/triage-ui run dev
```

For the Python CLI:

```bash
cd support-triage
pip install -r requirements.txt
python main.py --demo
```

## Environment / configuration

| Variable | Used by | Required |
|---|---|---|
| `DATABASE_URL` | `lib/db` (API server) | Yes — PostgreSQL connection string |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | `lib/integrations-anthropic-ai`, Python CLI | Yes — Claude API access |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `lib/integrations-anthropic-ai`, Python CLI | Yes — Anthropic-compatible API base URL |
| `PORT` | `artifacts/api-server`, `artifacts/triage-ui` (dev) | Yes |
| `BASE_PATH` | `artifacts/triage-ui` (dev) | Yes |
| `LOG_LEVEL` | `artifacts/api-server` | No — defaults to `info` |
| `NODE_ENV` | `artifacts/api-server` | No |

No `.env` file is committed to this repository.

## Project structure

```
artifacts/
  triage-ui/        React frontend
  api-server/        Express API
  mockup-sandbox/     early UI mockup workspace
lib/
  db/                 Drizzle schema + Postgres connection
  api-zod/            Zod request/response schemas (generated)
  api-spec/           OpenAPI spec + codegen config
  api-client-react/    generated React Query hooks
  integrations-anthropic-ai/  Claude API client
support-triage/       Python CLI prototype (see its own README)
support_issues/       sample ticket CSVs used by the CLI's batch mode
```

## Current status

The full-stack web app (`artifacts/`) is the primary web implementation — a working triage console with persistence, streaming responses, ticket history, and stats. The Python CLI in `support-triage/` is an earlier prototype kept for its retrieval approach and reference documentation, rather than the primary web implementation.

## Future improvements

- Bring TF-IDF/semantic hybrid retrieval from the Python prototype into the full-stack web app's retriever
- Automated tests for classification, risk evaluation, and retrieval scoring
