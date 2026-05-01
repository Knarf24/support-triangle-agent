# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Web App (`artifacts/triage-ui/`)

React + Vite frontend for the triage agent. Accessible at preview path `/`.
- Three pages: Triage Console (`/`), History (`/history`), Stats (`/stats`)
- Calls the Express API (`artifacts/api-server/`) for all data
- Built with Tailwind, shadcn/ui, Recharts, React Query

## KB Sources Config (`artifacts/api-server/kb-sources.json`)

Domain-to-URL mappings for the KB URL migration logic. Add a new entry here to support a new knowledge-base domain without touching any TypeScript source files:

```json
{ "domain": "newproduct", "url": "https://support.newproduct.com" }
```

The server reads this file at startup via `loadKbSources()` in `src/lib/kb-url-migration.ts`.

## API Server (`artifacts/api-server/`)

Express 5 backend serving:
- `POST /api/triage` — process a ticket (classify, retrieve, generate response)
- `GET /api/tickets` — list ticket history
- `GET /api/tickets/:id` — get single ticket
- `GET /api/triage/stats` — summary stats

Triage logic is in `artifacts/api-server/src/lib/triage.ts` — TypeScript port of the Python classifier and risk evaluator, using the Anthropic AI integration for response generation.

## Support Triage Agent (`support-triage/`)

Python CLI tool for automated multi-domain support ticket triage.

- **Language**: Python 3.11
- **AI**: Claude API via Replit AI Integrations (`claude-sonnet-4-6`)
- **Retrieval**: TF-IDF (scikit-learn) over domain corpus files
- **Domains**: HackerRank, Claude Help Center, Visa

### Run commands
```bash
cd support-triage
python main.py            # Interactive terminal mode
python main.py --demo     # Run 8 built-in sample tickets
python main.py --batch support_issues.csv  # Batch from CSV
```

### Outputs
- `support-triage/output.csv` — ticket predictions and responses
- `support-triage/log.txt` — full reasoning trace per ticket
