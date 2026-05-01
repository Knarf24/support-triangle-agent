import { Router, type IRouter } from "express";
import { db, ticketsTable } from "@workspace/db";
import { classifyDomain, evaluateRisk, retrieveDocs } from "../lib/triage";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function parseAgentBody(
  body: unknown,
): { messages: ChatMessage[]; inputMethod?: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const m of b.messages) {
    if (!m || typeof m !== "object") return null;
    const msg = m as Record<string, unknown>;
    if (msg.role !== "user" && msg.role !== "assistant") return null;
    if (typeof msg.content !== "string" || !msg.content.trim()) return null;
    messages.push({ role: msg.role, content: msg.content });
  }
  const inputMethod =
    typeof b.inputMethod === "string" ? b.inputMethod : undefined;
  return { messages, inputMethod };
}

const DOMAIN_LABEL: Record<string, string> = {
  hackerrank: "HackerRank",
  claude: "Claude (Anthropic)",
  visa: "Visa",
};

router.post("/agent/stream", async (req, res): Promise<void> => {
  const parsed = parseAgentBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid request: messages array required" });
    return;
  }

  const { messages, inputMethod = "typed" } = parsed;

  const userMessages = messages.filter((m) => m.role === "user");
  const allUserText = userMessages.map((m) => m.content).join(" ");
  const lastUserContent = userMessages.at(-1)?.content ?? "";

  const { domain, confidence } = classifyDomain(allUserText);
  const { escalated, escalationReason, escalationCategories } =
    evaluateRisk(lastUserContent);

  const retrievedDocs = retrieveDocs(lastUserContent, domain);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({
    type: "meta",
    domain,
    domainConfidence: confidence,
    escalated,
    escalationReason,
    escalationCategories,
    retrievedDocs,
  });

  let clientAborted = false;
  res.on("close", () => {
    clientAborted = true;
  });

  const kbContext =
    retrievedDocs.length > 0
      ? retrievedDocs.map((d) => d.content).join("\n\n---\n\n")
      : "No specific documentation found for this query.";

  const domainLabel = DOMAIN_LABEL[domain] ?? "a technology company";

  const systemPrompt = escalated
    ? `You are a senior support specialist for ${domainLabel}. This message has been flagged for escalation because: ${escalationReason}. Respond with empathy and professionalism. Acknowledge the issue clearly, confirm that a human specialist will follow up within 2–4 business hours, and offer any safe, general guidance you can provide right now. Do not make promises about specific outcomes.`
    : `You are a helpful, knowledgeable support agent for ${domainLabel}. Use the KB documentation below to answer accurately and concisely. If the question falls outside your knowledge, say so transparently and direct the user to the official support channel. Be professional, empathetic, and conversational — this is a multi-turn support chat so remember context from earlier in the conversation.

KB Documentation:
${kbContext}`;

  const anthropicMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let fullResponse = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    for await (const chunk of stream) {
      if (clientAborted) break;
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        const text = chunk.delta.text;
        fullResponse += text;
        send({ type: "chunk", text });
      }
    }
  } catch (err) {
    req.log.error({ err }, "Agent stream error");
    send({ type: "error", message: "Failed to generate a response. Please try again." });
    res.end();
    return;
  }

  if (clientAborted) {
    req.log.info({ domain }, "Client aborted agent stream — not saving to DB");
    res.end();
    return;
  }

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      ticketText: lastUserContent,
      domain,
      domainConfidence: confidence,
      escalated,
      escalationReason,
      escalationCategories,
      retrievedDocs,
      response: fullResponse,
      inputMethod,
    })
    .returning();

  req.log.info(
    { ticketId: ticket.id, domain, escalated },
    "Agent turn saved to DB",
  );

  send({ type: "done", ticketId: ticket.id });
  res.end();
});

export default router;
