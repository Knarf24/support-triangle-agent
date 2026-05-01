interface RetrievedDoc {
  title: string;
  content: string;
  url?: string;
  section?: string;
}

export function extractDocTitle(chunk: string): string {
  const match = chunk.match(/^Q:\s*(.+)/m);
  if (match) return match[1].trim();
  const sectionMatch = chunk.match(/===\s*(.+?)\s*===/);
  if (sectionMatch) return sectionMatch[1].trim();
  return chunk.slice(0, 60) + (chunk.length > 60 ? "…" : "");
}

export function normalizeRetrievedDocs(docs: unknown): RetrievedDoc[] {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => {
    if (d === null || typeof d !== "object") {
      console.warn("[normalizeRetrievedDocs] Unexpected non-object entry in retrieved_docs:", d);
      throw new Error(`Retrieved doc entry must be an object, got: ${typeof d}`);
    }
    const obj = d as Record<string, unknown>;
    const content = typeof obj.content === "string" ? obj.content : "";
    const title = typeof obj.title === "string" && obj.title ? obj.title : extractDocTitle(content);
    const url = typeof obj.url === "string" ? obj.url : undefined;
    return url ? { title, content, url } : { title, content };
  });
}
