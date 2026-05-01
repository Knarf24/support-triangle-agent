import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  RotateCcw,
  Bot,
  User,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomainBadge } from "@/components/domain-badge";
import { MultimodalInput } from "@/components/multimodal-input";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RetrievedDocMeta {
  title: string;
  url?: string;
}

interface TriageMeta {
  domain: string;
  domainConfidence: number;
  escalated: boolean;
  escalationReason: string;
  escalationCategories: string[];
  retrievedDocs: RetrievedDocMeta[];
  ticketId?: number;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  triage?: TriageMeta;
  inputMethod?: string;
}

const SUGGESTED_PROMPTS = [
  "My HackerRank test timed out mid-submission — can it be reset?",
  "Claude API is returning 429 errors on every request",
  "There's an unauthorized charge on my Visa card",
];

export function AgentChat() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdCounter = useRef(0);
  const queryClient = useQueryClient();

  const nextId = () => String(++msgIdCounter.current);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (textOverride?: string, method?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || isStreaming) return;

      setInput("");
      const inputMethod = method ?? "typed";

      const userMsg: AgentMessage = {
        id: nextId(),
        role: "user",
        content: text,
        inputMethod,
      };
      const assistantId = nextId();
      const assistantMsg: AgentMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const history = messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: "user", content: text });

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const resp = await fetch(`${API_BASE}/api/agent/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, inputMethod }),
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          triage: {
                            domain: event.domain,
                            domainConfidence: event.domainConfidence,
                            escalated: event.escalated,
                            escalationReason: event.escalationReason,
                            escalationCategories: event.escalationCategories ?? [],
                            retrievedDocs: event.retrievedDocs ?? [],
                          },
                        }
                      : m,
                  ),
                );
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
                    m.id === assistantId
                      ? {
                          ...m,
                          isStreaming: false,
                          triage: m.triage
                            ? { ...m.triage, ticketId: event.ticketId }
                            : m.triage,
                        }
                      : m,
                  ),
                );
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
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
                  content: "Connection error. Please check your network and try again.",
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
    },
    [input, isStreaming, messages, queryClient],
  );

  const handleTranscript = useCallback(
    (text: string, method: "voice" | "camera" | "upload") => {
      sendMessage(text, method);
    },
    [sendMessage],
  );

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
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col glass-card rounded-xl border border-white/10 overflow-hidden min-h-[600px] max-h-[75vh]">
      {/* Header bar */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shadow-[0_0_12px_rgba(0,212,255,0.15)]">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold tracking-[0.18em] text-primary uppercase">
              Triage Agent
            </p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Auto-triages every message · remembers context
            </p>
          </div>
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
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-16">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_24px_rgba(0,212,255,0.1)]">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-sm font-sans font-medium text-white/80">
                Describe your issue — I'll triage it automatically
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                Supports HackerRank · Claude · Visa · Use voice or camera too
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {SUGGESTED_PROMPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s, "typed")}
                  className="text-[10px] font-mono px-3 py-1.5 rounded border border-white/10 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-3 border-t border-white/10 shrink-0 bg-black/10">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your issue… (Enter to send · Shift+Enter for new line)"
              disabled={isStreaming}
              rows={2}
              className="w-full resize-none bg-black/40 border border-white/10 text-sm font-sans text-white placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none rounded-lg px-3 py-3 min-h-[52px] max-h-[120px] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <MultimodalInput onTranscript={handleTranscript} disabled={isStreaming} />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="h-9 w-9 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary rounded-lg shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
          Every message is automatically triaged ·{" "}
          <span className="text-primary/60">Enter to send</span>
        </p>
      </div>
    </div>
  );
}

function ActionBadge({ escalated }: { escalated: boolean }) {
  if (escalated) {
    return (
      <Badge
        variant="outline"
        className="text-[9px] font-mono font-bold tracking-[0.15em] bg-destructive/10 text-destructive border-destructive/30 rounded-md px-1.5 py-0"
      >
        <AlertTriangle className="w-2.5 h-2.5 mr-1" />
        ESCALATE
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[9px] font-mono font-bold tracking-[0.15em] bg-success/10 text-success border-success/30 rounded-md px-1.5 py-0"
    >
      <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
      AUTO-REPLY
    </Badge>
  );
}

function ReasoningTrace({
  triage,
}: {
  triage: TriageMeta;
}) {
  const [open, setOpen] = useState(false);

  const hasDetails =
    triage.escalationCategories.length > 0 ||
    triage.retrievedDocs.length > 0;
  if (!hasDetails && !triage.escalated) return null;

  return (
    <div className="mt-2 border-t border-white/5 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-white/70 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        REASONING TRACE
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {triage.escalated && triage.escalationReason && (
            <div>
              <p className="text-[9px] font-mono text-destructive/70 tracking-[0.12em] uppercase mb-0.5">
                Escalation Reason
              </p>
              <p className="text-[11px] font-mono text-muted-foreground">
                {triage.escalationReason}
              </p>
            </div>
          )}
          {triage.escalationCategories.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-muted-foreground tracking-[0.12em] uppercase mb-0.5">
                Categories
              </p>
              <div className="flex flex-wrap gap-1">
                {triage.escalationCategories.map((cat) => (
                  <span
                    key={cat}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-destructive/20 text-destructive/60 bg-destructive/5"
                  >
                    {cat.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {triage.retrievedDocs.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <BookOpen className="w-2.5 h-2.5 text-primary/60" />
                <p className="text-[9px] font-mono text-muted-foreground tracking-[0.12em] uppercase">
                  KB Sources
                </p>
              </div>
              <ul className="space-y-0.5">
                {triage.retrievedDocs.slice(0, 3).map((doc, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[9px] font-mono text-primary/50 shrink-0 mt-px">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-muted-foreground hover:text-primary/80 transition-colors line-clamp-1"
                      >
                        {doc.title || "KB Article"}
                      </a>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground line-clamp-1">
                        {doc.title || "KB Article"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {triage.ticketId && (
            <p className="text-[9px] font-mono text-muted-foreground/50">
              ticket #{triage.ticketId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";
  const triage = message.triage;
  const escalated = triage?.escalated ?? false;

  const agentBubbleClass = escalated
    ? "bg-destructive/8 border border-destructive/20 rounded-tl-sm"
    : "bg-emerald-500/8 border border-emerald-500/15 rounded-tl-sm";

  const userBubbleClass =
    "bg-primary/10 border border-primary/20 rounded-tr-sm";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border mt-0.5 ${
          isUser
            ? "bg-primary/10 border-primary/30"
            : escalated
            ? "bg-destructive/10 border-destructive/30"
            : "bg-emerald-500/10 border-emerald-500/30"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary" />
        ) : escalated ? (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm font-sans leading-relaxed ${
          isUser ? userBubbleClass : agentBubbleClass
        }`}
      >
        {/* Agent meta row */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {triage ? (
              <>
                <DomainBadge
                  domain={triage.domain}
                  confidence={triage.domainConfidence}
                />
                <ActionBadge escalated={escalated} />
              </>
            ) : message.isStreaming ? (
              <span className="text-[10px] font-mono text-muted-foreground animate-pulse">
                classifying…
              </span>
            ) : null}
          </div>
        )}

        {/* Content */}
        {message.content ? (
          <span
            className={`whitespace-pre-wrap ${isUser ? "text-white" : escalated ? "text-white/90" : "text-white/90"}`}
          >
            {message.content}
          </span>
        ) : message.isStreaming ? (
          <span className="flex items-center gap-1.5 text-muted-foreground py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
          </span>
        ) : null}

        {/* Streaming cursor */}
        {!isUser && message.isStreaming && message.content && (
          <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />
        )}

        {/* Reasoning trace — only after streaming done */}
        {!isUser && !message.isStreaming && triage && (
          <ReasoningTrace triage={triage} />
        )}
      </div>
    </div>
  );
}
