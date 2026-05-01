import { useState, useRef, useEffect, useCallback } from "react";
import { Send, RotateCcw, Bot, User, Loader2, Zap, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DomainBadge } from "@/components/domain-badge";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface RetrievedDocMeta {
  title: string;
  url?: string;
}

interface ChatDomainMeta {
  domain: string;
  retrievedDocs: RetrievedDocMeta[];
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ChatMode() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [domainMeta, setDomainMeta] = useState<ChatDomainMeta | null>(null);
  const [currentDomain, setCurrentDomain] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter = useRef(0);

  const nextId = () => String(++msgIdCounter.current);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const assistantId = nextId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const historyForApi = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }));
    historyForApi.push({ role: "user", content: text });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          domain: currentDomain,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.startsWith("data: ") ? part.slice(6) : part;
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === "meta") {
              setDomainMeta({
                domain: event.domain,
                retrievedDocs: event.retrievedDocs ?? [],
              });
              setCurrentDomain(event.domain);
            } else if (event.type === "chunk") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m,
                ),
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: event.message, isStreaming: false }
                    : m,
                ),
              );
            }
          } catch {
            // ignore malformed SSE frames
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "Connection error. Please try again.",
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isStreaming, messages, currentDomain]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setDomainMeta(null);
    setCurrentDomain(undefined);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[520px]">
      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col glass-card rounded-xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-mono font-bold tracking-[0.18em] text-primary uppercase">
              Conversation
            </span>
            {domainMeta && (
              <DomainBadge domain={domainMeta.domain} />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="h-7 gap-1.5 text-[10px] font-mono tracking-[0.12em] text-muted-foreground hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            <RotateCcw className="w-3 h-3" />
            NEW CONVERSATION
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-sans font-medium text-white/70">
                  Start a conversation
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  Ask about HackerRank, Claude, or Visa — follow-up questions welcome.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "My submission shows Wrong Answer",
                  "Claude API returning 429 errors",
                  "Unauthorized charge on my Visa",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-[10px] font-mono px-2.5 py-1 rounded border border-white/10 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-white/10 shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
              disabled={isStreaming}
              className="resize-none min-h-[52px] max-h-[120px] bg-black/40 border-white/10 text-sm font-sans text-white placeholder:text-muted-foreground focus:border-primary/50 focus:ring-0 rounded-lg"
              rows={2}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="h-[52px] w-[52px] shrink-0 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary rounded-lg"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
            Context is remembered throughout this session ·{" "}
            <span className="text-primary/60">Press Enter to send</span>
          </p>
        </div>
      </div>

      {/* ── Context panel ── */}
      <div className="w-full md:w-64 flex flex-col gap-4 shrink-0">
        {/* Session info */}
        <div className="glass-card rounded-xl border border-white/10 p-4">
          <p className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground uppercase mb-3">
            Session Context
          </p>
          {domainMeta ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground mb-1">
                  Detected Domain
                </p>
                <DomainBadge domain={domainMeta.domain} />
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground mb-1">
                  Messages
                </p>
                <p className="text-sm font-mono text-white">
                  {messages.filter((m) => !m.isStreaming).length}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs font-mono text-muted-foreground">
              Send a message to start
            </p>
          )}
        </div>

        {/* KB Sources */}
        {domainMeta && domainMeta.retrievedDocs.length > 0 && (
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground uppercase">
                KB Sources
              </p>
            </div>
            <ul className="space-y-2">
              {domainMeta.retrievedDocs.slice(0, 3).map((doc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[9px] font-mono text-primary/60 mt-0.5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground leading-tight line-clamp-2">
                    {doc.title || "KB Article"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tips */}
        <div className="glass-card rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-3.5 h-3.5 text-primary/70" />
            <p className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground uppercase">
              Tips
            </p>
          </div>
          <ul className="space-y-1.5 text-[10px] font-mono text-muted-foreground">
            <li>· Ask follow-up questions naturally</li>
            <li>· Context is kept for the whole session</li>
            <li>· Switch to Triage Mode for formal tickets</li>
            <li>· Hit New Conversation to start fresh</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border ${
          isUser
            ? "bg-primary/10 border-primary/30"
            : "bg-white/5 border-white/10"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-white/60" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-xl px-4 py-2.5 text-sm font-sans leading-relaxed ${
          isUser
            ? "bg-primary/10 border border-primary/20 text-white rounded-tr-sm"
            : "bg-white/5 border border-white/10 text-white/90 rounded-tl-sm"
        }`}
      >
        {message.content ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : message.isStreaming ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
          </span>
        ) : null}
        {message.isStreaming && message.content && (
          <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
