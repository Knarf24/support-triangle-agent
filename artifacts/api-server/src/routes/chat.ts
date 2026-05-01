import { Router, type IRouter } from "express";
import { classifyDomain, retrieveDocs } from "../lib/triage";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function parseChatBody(body: unknown): { messages: ChatMessage[]; domain?: string } | null {
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
  const domain = typeof b.domain === "string" ? b.domain : undefined;
  return { messages, domain };
}

const DOMAIN_LABEL: Record<string, string> = {
  hackerrank: "HackerRank",
  claude: "Claude (Anthropic)",
  visa: "Visa",
};

const DOMAIN_PERSONA: Record<string, string> = {
  hackerrank: `You are a knowledgeable, friendly support agent for HackerRank. Your role is to help developers and test-takers resolve issues with assessments, submissions, certificates, contests, and account management. Use the provided KB context when relevant. If you are unsure, say so and advise contacting HackerRank support directly. Maintain context across the conversation — remember what the user told you earlier.`,
  claude: `You are a helpful support agent for Claude (Anthropic). Your role is to help users and developers with questions about the Claude API, Claude.ai, billing, rate limits, usage policies, and general product questions. Use the provided KB context when relevant. Maintain context across the conversation — remember what the user told you earlier.`,
  visa: `You are a professional, calm support agent for Visa. Your role is to help cardholders with questions about transactions, disputes, card management, fraud reporting, travel, and contactless payments. Use the provided KB context when relevant. Always stress the importance of contacting the card-issuing bank for account-specific actions. Maintain context across the conversation — remember what the user told you earlier.`,
  unknown: `You are a helpful multi-domain support agent covering HackerRank, Claude (Anthropic), and Visa. Help the user resolve their issue. Ask clarifying questions if the domain is unclear.`,
};

router.post("/chat/stream", async (req, res): Promise<void> => {
  const parsed = parseChatBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid request body: messages array required" });
    return;
  }

  const { messages, domain: clientDomain } = parsed;

  const firstUserMessage = messages.find((m) => m.role === "user")?.content ?? "";

  let domain = clientDomain ?? "unknown";
  let detectedDomain = false;

  if (!clientDomain || clientDomain === "unknown") {
    const classification = classifyDomain(firstUserMessage);
    domain = classification.domain;
    detectedDomain = true;
  }

  const retrievedDocs = retrieveDocs(firstUserMessage, domain);
  const kbContext =
    retrievedDocs.length > 0
      ? retrievedDocs.map((d) => d.content).join("\n\n---\n\n")
      : "No specific documentation matched for this query.";

  const systemPrompt = `${DOMAIN_PERSONA[domain] ?? DOMAIN_PERSONA.unknown}

${retrievedDocs.length > 0 ? `Here is relevant KB documentation to help you answer:\n\n${kbContext}` : "No specific KB documentation matched this query — rely on your general knowledge and be transparent about uncertainty."}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let clientAborted = false;
  res.on("close", () => {
    clientAborted = true;
  });

  if (detectedDomain || messages.length === 1) {
    send({
      type: "meta",
      domain,
      retrievedDocs: retrievedDocs.map((d) => ({ title: d.title, url: d.url })),
    });
  }

  req.log.info(
    { domain, messageCount: messages.length, detectedDomain },
    "Chat stream started",
  );

  try {
    const anthropicMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    let fullResponse = "";

    for await (const event of stream) {
      if (clientAborted) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        const text = event.delta.text;
        fullResponse += text;
        send({ type: "chunk", text });
      }
    }

    if (!clientAborted) {
      req.log.info(
        { domain, messageCount: messages.length, responseLength: fullResponse.length },
        "Chat stream completed",
      );
      send({ type: "done" });
    }
  } catch (err) {
    req.log.error({ err }, "Chat stream error");
    if (!clientAborted) {
      send({ type: "error", message: "Failed to generate response. Please try again." });
    }
  }

  res.end();
});

export default router;
