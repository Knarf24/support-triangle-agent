import { anthropic } from "@workspace/integrations-anthropic-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RetrievedDoc } from "@workspace/db";

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  hackerrank: [
    "hackerrank", "coding challenge", "test case", "submission", "wrong answer",
    "time limit", "tle", "contest", "leaderboard", "assessment", "certificate",
    "hiring", "code editor", "compile", "algorithm", "data structure",
    "programming test", "hackathon", "rank", "score", "problem set",
    "online judge", "competitive programming", "interview", "recruiter",
    "plagiarism", "disqualified", "language", "runtime error", "segfault",
  ],
  claude: [
    "claude", "anthropic", "ai assistant", "chatbot", "language model", "llm",
    "context window", "api key", "api error", "rate limit", "tokens",
    "hallucination", "prompt", "conversation", "ai response", "model",
    "claude.ai", "pro plan", "anthropic api", "claude 3", "opus", "sonnet",
    "haiku", "streaming", "memory", "system prompt", "max tokens",
    "overloaded", "subscription", "ai chat", "generated content",
  ],
  visa: [
    "visa", "credit card", "debit card", "card", "payment", "transaction",
    "declined", "fraud", "dispute", "chargeback", "atm", "pin", "cvv",
    "contactless", "tap to pay", "statement", "balance", "rewards",
    "cashback", "foreign transaction", "travel", "card number", "chip",
    "merchant", "refund", "unauthorized", "lost card", "stolen card",
    "zero liability", "bank", "billing", "interest", "credit limit",
    "prepaid", "autopay", "late fee", "cash advance",
  ],
};

const CONFIDENCE_THRESHOLD = 0.25;

const ESCALATION_PATTERNS: Record<string, string[]> = {
  fraud: [
    "fraud", "fraudulent", "scam", "stolen", "unauthorized transaction",
    "unauthorized purchase", "unauthorized charge", "unauthorized use",
    "identity theft", "phishing", "compromised", "hacked account",
    "suspicious activity", "someone used my card", "fake charge",
    "not me", "i didn't make this", "i never made",
  ],
  billing_dispute: [
    "billing dispute", "overcharged", "wrong amount", "double charge",
    "incorrect charge", "dispute charge", "refund request", "chargeback",
    "didn't receive refund", "unauthorized charge", "payment failed",
    "subscription charge", "unexpected charge",
  ],
  account_access: [
    "can't log in", "cannot login", "account locked", "locked out",
    "account disabled", "banned account", "suspended account",
    "account compromised", "lost access", "forgot email", "account hacked",
    "password reset not working", "verification failed", "account blocked",
  ],
  bug_or_platform_issue: [
    "bug", "glitch", "not working", "broken", "error", "crash",
    "data loss", "lost my work", "missing data", "platform down",
    "system error", "service unavailable", "outage", "lost submission",
    "timer stopped", "exam crashed", "corrupted",
  ],
  legal_compliance: [
    "legal", "lawsuit", "attorney", "lawyer", "sue", "court",
    "gdpr", "privacy violation", "data breach", "regulation",
    "compliance", "law enforcement", "subpoena",
  ],
  safety_critical: [
    "threatening", "harassment", "abuse", "discrimination",
    "hate speech", "violent", "emergency", "urgent safety",
  ],
};

const DOMAIN_HELP_URL: Record<string, string> = {
  hackerrank: "https://support.hackerrank.com",
  claude: "https://support.anthropic.com",
  visa: "https://usa.visa.com/support",
};

export function extractDocTitle(chunk: string): string {
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
  const domains = ["hackerrank", "claude", "visa"];
  const corpus: Record<string, string[]> = {};

  for (const domain of domains) {
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

export function classifyDomain(ticket: string): { domain: string; confidence: number } {
  const lower = ticket.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    scores[domain] = score;
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return { domain: "unknown", confidence: 0 };

  const normalized: Record<string, number> = {};
  for (const [d, v] of Object.entries(scores)) {
    normalized[d] = v / total;
  }

  const best = Object.entries(normalized).reduce((a, b) => (b[1] > a[1] ? b : a));
  if (best[1] < CONFIDENCE_THRESHOLD) return { domain: "unknown", confidence: best[1] };

  return { domain: best[0], confidence: best[1] };
}

export function evaluateRisk(ticket: string): {
  escalated: boolean;
  escalationReason: string;
  escalationCategories: string[];
} {
  const lower = ticket.toLowerCase();
  const triggered: string[] = [];

  for (const [category, patterns] of Object.entries(ESCALATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        if (!triggered.includes(category)) triggered.push(category);
        break;
      }
    }
  }

  if (triggered.length > 0) {
    const reasons = triggered.map((c) =>
      c
        .split("_")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" "),
    );
    return {
      escalated: true,
      escalationReason: "Escalation required: " + reasons.join(", "),
      escalationCategories: triggered,
    };
  }

  return { escalated: false, escalationReason: "Safe to auto-respond", escalationCategories: [] };
}

export function retrieveDocs(ticket: string, domain: string): RetrievedDoc[] {
  const corpus = loadCorpus();
  const lower = ticket.toLowerCase();
  const ticketWords = lower.split(/\s+/).filter((w) => w.length > 3);

  const domainsToSearch = domain === "unknown" ? ["hackerrank", "claude", "visa"] : [domain];
  const scored: Array<{ chunk: string; score: number; domain: string }> = [];

  for (const d of domainsToSearch) {
    const chunks = corpus[d] || [];
    for (const chunk of chunks) {
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      for (const word of ticketWords) {
        if (chunkLower.includes(word)) score += 1;
      }
      if (score > 0) scored.push({ chunk, score, domain: d });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => ({
    title: extractDocTitle(s.chunk),
    content: s.chunk,
    url: DOMAIN_HELP_URL[s.domain],
  }));
}

export async function generateResponse(
  ticket: string,
  domain: string,
  retrievedDocs: RetrievedDoc[],
  escalated: boolean,
  escalationReason: string,
): Promise<string> {
  if (escalated) {
    return `Thank you for reaching out to our support team. Your ticket has been flagged for priority review by a human specialist (${escalationReason.toLowerCase()}). A member of our team will contact you within 2-4 business hours. Please do not reply to automated messages — wait for a specialist to follow up directly.`;
  }

  const context = retrievedDocs.length > 0 ? retrievedDocs.map((d) => d.content).join("\n\n---\n\n") : "No specific documentation matched.";

  const systemPrompt = `You are a helpful support agent for ${domain === "unknown" ? "a technology company" : domain === "hackerrank" ? "HackerRank" : domain === "claude" ? "Claude (Anthropic)" : "Visa"}. 
Use the provided documentation context to answer the customer's question accurately and concisely. 
If you cannot confidently answer from the context, say so and suggest they contact support.
Keep responses under 200 words. Be professional and empathetic.`;

  const userMessage = `Customer question: ${ticket}

Documentation context:
${context}

Please provide a helpful response to the customer.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: userMessage }],
    system: systemPrompt,
  });

  const content = message.content[0];
  if (content.type !== "text") return "Unable to generate response.";
  return content.text;
}

export async function triageTicket(ticketText: string): Promise<{
  domain: string;
  domainConfidence: number;
  escalated: boolean;
  escalationReason: string;
  escalationCategories: string[];
  retrievedDocs: RetrievedDoc[];
  response: string;
}> {
  const { domain, confidence } = classifyDomain(ticketText);
  const { escalated, escalationReason, escalationCategories } = evaluateRisk(ticketText);
  const retrievedDocs = retrieveDocs(ticketText, domain);
  const response = await generateResponse(ticketText, domain, retrievedDocs, escalated, escalationReason);

  return {
    domain,
    domainConfidence: confidence,
    escalated,
    escalationReason,
    escalationCategories,
    retrievedDocs,
    response,
  };
}
