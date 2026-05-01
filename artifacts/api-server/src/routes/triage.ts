import { Router, type IRouter } from "express";
import { db, ticketsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  TriageTicketBody,
  GetTicketParams,
  TriageTicketResponse,
  ListTicketsResponse,
  GetTicketResponse,
  GetTriageStatsResponse,
} from "@workspace/api-zod";
import { triageTicket, classifyDomain, evaluateRisk, retrieveDocs } from "../lib/triage";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/triage", async (req, res): Promise<void> => {
  const parsed = TriageTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ticketText } = parsed.data;

  req.log.info({ ticketLength: ticketText.length }, "Processing triage request");

  const result = await triageTicket(ticketText);

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      ticketText,
      domain: result.domain,
      domainConfidence: result.domainConfidence,
      escalated: result.escalated,
      escalationReason: result.escalationReason,
      escalationCategories: result.escalationCategories,
      retrievedDocs: result.retrievedDocs,
      response: result.response,
    })
    .returning();

  req.log.info({ ticketId: ticket.id, domain: ticket.domain, escalated: ticket.escalated }, "Ticket triaged");

  res.status(200).json(
    TriageTicketResponse.parse({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
    }),
  );
});

router.post("/triage/stream", async (req, res): Promise<void> => {
  const parsed = TriageTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ticketText } = parsed.data;

  const { domain, confidence } = classifyDomain(ticketText);
  const { escalated, escalationReason, escalationCategories } = evaluateRisk(ticketText);
  const retrievedDocs = retrieveDocs(ticketText, domain);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "meta", domain, domainConfidence: confidence, escalated, escalationReason, escalationCategories, retrievedDocs });

  let fullResponse = "";

  if (escalated) {
    fullResponse = `Thank you for reaching out to our support team. Your ticket has been flagged for priority review by a human specialist (${escalationReason.toLowerCase()}). A member of our team will contact you within 2-4 business hours. Please do not reply to automated messages — wait for a specialist to follow up directly.`;
  } else {
    const context = retrievedDocs.length > 0 ? retrievedDocs.join("\n\n---\n\n") : "No specific documentation matched.";
    const domainLabel =
      domain === "hackerrank" ? "HackerRank"
      : domain === "claude" ? "Claude (Anthropic)"
      : domain === "visa" ? "Visa"
      : "a technology company";

    const systemPrompt = `You are a helpful support agent for ${domainLabel}. Use the provided documentation context to answer the customer's question accurately and concisely. If you cannot confidently answer from the context, say so and suggest they contact support. Keep responses under 200 words. Be professional and empathetic.`;
    const userMessage = `Customer question: ${ticketText}\n\nDocumentation context:\n${context}\n\nPlease provide a helpful response to the customer.`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        send({ type: "chunk", text: event.delta.text });
      }
    }
  }

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      ticketText,
      domain,
      domainConfidence: confidence,
      escalated,
      escalationReason,
      escalationCategories,
      retrievedDocs,
      response: fullResponse,
    })
    .returning();

  req.log.info({ ticketId: ticket.id, domain: ticket.domain, escalated: ticket.escalated }, "Ticket streamed and saved");

  send({ type: "done", id: ticket.id });
  res.end();
});

router.get("/tickets", async (req, res): Promise<void> => {
  const tickets = await db
    .select()
    .from(ticketsTable)
    .orderBy(desc(ticketsTable.createdAt))
    .limit(50);

  res.json(
    ListTicketsResponse.parse(
      tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
    ),
  );
});

router.get("/tickets/:id", async (req, res): Promise<void> => {
  const params = GetTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id));

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(GetTicketResponse.parse({ ...ticket, createdAt: ticket.createdAt.toISOString() }));
});

router.get("/triage/stats", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      domain: ticketsTable.domain,
      escalated: ticketsTable.escalated,
      total: count(),
    })
    .from(ticketsTable)
    .groupBy(ticketsTable.domain, ticketsTable.escalated);

  let total = 0;
  let escalated = 0;
  const byDomain: Record<string, number> = { hackerrank: 0, claude: 0, visa: 0, unknown: 0 };

  for (const row of rows) {
    total += Number(row.total);
    if (row.escalated) escalated += Number(row.total);
    const domain = row.domain as string;
    if (domain in byDomain) {
      byDomain[domain] = (byDomain[domain] || 0) + Number(row.total);
    } else {
      byDomain["unknown"] = (byDomain["unknown"] || 0) + Number(row.total);
    }
  }

  const autoResponded = total - escalated;

  res.json(
    GetTriageStatsResponse.parse({
      total,
      autoResponded,
      escalated,
      byDomain: {
        hackerrank: byDomain["hackerrank"] || 0,
        claude: byDomain["claude"] || 0,
        visa: byDomain["visa"] || 0,
        unknown: byDomain["unknown"] || 0,
      },
    }),
  );
});

export default router;
