/**
 * One-time migration: backfill `url` on retrieved_docs for old tickets.
 *
 * Run from the workspace root:
 *   pnpm --filter @workspace/api-server run migrate:kb-urls
 *
 * Or from the api-server directory:
 *   pnpm run migrate:kb-urls
 *
 * The script is idempotent — re-running it skips tickets that already have
 * URLs on all their docs. Corpus files must be reachable at
 * ../../support-triage/corpus relative to the api-server package directory.
 *
 * This migration also runs automatically on server startup via src/index.ts.
 */
import { runKbUrlMigration } from "../lib/kb-url-migration";

runKbUrlMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
