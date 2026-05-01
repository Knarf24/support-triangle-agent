import { pgTable, text, serial, timestamp, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface RetrievedDoc {
  title: string;
  content: string;
  url?: string;
  section?: string;
}

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketText: text("ticket_text").notNull(),
  domain: text("domain").notNull(),
  domainConfidence: real("domain_confidence").notNull().default(0),
  escalated: boolean("escalated").notNull().default(false),
  escalationReason: text("escalation_reason").notNull().default(""),
  escalationCategories: jsonb("escalation_categories").$type<string[]>().notNull().default([]),
  retrievedDocs: jsonb("retrieved_docs").$type<RetrievedDoc[]>().notNull().default([]),
  response: text("response").notNull().default(""),
  inputMethod: text("input_method").notNull().default("typed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
