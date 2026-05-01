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
 */
import { db, ticketsTable } from "@workspace/db";
import type { RetrievedDoc } from "@workspace/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_HELP_URL: Record<string, string> = {
  hackerrank: "https://support.hackerrank.com",
  claude: "https://support.anthropic.com",
  visa: "https://usa.visa.com/support",
};

const KNOWN_DOMAINS = ["hackerrank", "claude", "visa"];

function extractDocTitle(chunk: string): string {
  const match = chunk.match(/^Q:\s*(.+)/m);
  if (match) return match[1].trim();
  const sectionMatch = chunk.match(/===\s*(.+?)\s*===/);
  if (sectionMatch) return sectionMatch[1].trim();
  return chunk.slice(0, 60) + (chunk.length > 60 ? "…" : "");
}

let corpusCache: Record<string, string[]> | null = null;

function loadCorpus(): Record<string, string[]> {
  if (corpusCache) return corpusCache;

  const corpusDir = join(process.cwd(), "../../support-triage/corpus");
  const corpus: Record<string, string[]> = {};

  for (const domain of KNOWN_DOMAINS) {
    try {
      const text = readFileSync(join(corpusDir, `${domain}.txt`), "utf-8");
      const chunks = text
        .split(/\n\n+/)
        .map((c) => c.trim())
        .filter((c) => c.length > 30);
      corpus[domain] = chunks;
    } catch {
      corpus[domain] = [];
    }
  }

  corpusCache = corpus;
  return corpus;
}

function matchDomainByContent(content: string): string | null {
  const corpus = loadCorpus();
  const lower = content.toLowerCase();

  let bestDomain: string | null = null;
  let bestOverlap = 0;

  for (const domain of KNOWN_DOMAINS) {
    const chunks = corpus[domain] ?? [];
    for (const chunk of chunks) {
      if (chunk.toLowerCase() === lower || chunk.toLowerCase().includes(lower.slice(0, 80))) {
        return domain;
      }
    }
    const words = lower.split(/\s+/).filter((w) => w.length > 4);
    let overlap = 0;
    for (const chunk of chunks) {
      const chunkLower = chunk.toLowerCase();
      for (const word of words) {
        if (chunkLower.includes(word)) overlap++;
      }
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestDomain = domain;
    }
  }

  return bestOverlap > 0 ? bestDomain : null;
}

function normalizeDoc(
  doc: unknown,
  ticketDomain: string,
): { doc: RetrievedDoc; changed: boolean } {
  const url = DOMAIN_HELP_URL[ticketDomain] ?? null;

  if (typeof doc === "string") {
    const resolvedUrl =
      url ?? (matchDomainByContent(doc) ? DOMAIN_HELP_URL[matchDomainByContent(doc)!] : undefined);
    return {
      doc: resolvedUrl
        ? { title: extractDocTitle(doc), content: doc, url: resolvedUrl }
        : { title: extractDocTitle(doc), content: doc },
      changed: true,
    };
  }

  if (doc !== null && typeof doc === "object") {
    const obj = doc as Record<string, unknown>;
    const content = typeof obj.content === "string" ? obj.content : "";
    const title =
      typeof obj.title === "string" && obj.title ? obj.title : extractDocTitle(content);
    const existingUrl = typeof obj.url === "string" ? obj.url : undefined;

    if (existingUrl) {
      const changed = obj.title !== title;
      return { doc: { title, content, url: existingUrl }, changed };
    }

    const inferredDomain =
      ticketDomain !== "unknown" ? ticketDomain : matchDomainByContent(content);
    const resolvedUrl = inferredDomain ? DOMAIN_HELP_URL[inferredDomain] : undefined;

    return {
      doc: resolvedUrl ? { title, content, url: resolvedUrl } : { title, content },
      changed: !!resolvedUrl || obj.title !== title,
    };
  }

  return { doc: { title: "", content: String(doc) }, changed: true };
}

async function run() {
  console.log("Starting KB URL migration…");

  const tickets = await db.select().from(ticketsTable);
  console.log(`Found ${tickets.length} tickets to inspect.`);

  let updated = 0;
  let skipped = 0;

  for (const ticket of tickets) {
    const rawDocs = ticket.retrievedDocs as unknown;

    if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
      skipped++;
      continue;
    }

    let anyChanged = false;
    const normalizedDocs: RetrievedDoc[] = rawDocs.map((d) => {
      const { doc, changed } = normalizeDoc(d, ticket.domain);
      if (changed) anyChanged = true;
      return doc;
    });

    if (!anyChanged) {
      skipped++;
      continue;
    }

    await db
      .update(ticketsTable)
      .set({ retrievedDocs: normalizedDocs })
      .where(eq(ticketsTable.id, ticket.id));

    console.log(
      `  Updated ticket #${ticket.id} (domain: ${ticket.domain}) — ${normalizedDocs.length} doc(s) patched.`,
    );
    updated++;
  }

  console.log(`\nMigration complete. Updated: ${updated}, Skipped: ${skipped}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
