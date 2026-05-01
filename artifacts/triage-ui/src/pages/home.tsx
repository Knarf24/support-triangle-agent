import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTickets, getListTicketsQueryKey, getGetTriageStatsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DomainBadge } from "@/components/domain-badge";
import { AlertCircle, CheckCircle2, Clock, Send, ShieldAlert, Cpu, Square, Ban, X, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { SourcesSection } from "@/components/sources-section";
import type { RetrievedDoc } from "@workspace/api-client-react";

type StreamingMeta = {
  domain: string;
  domainConfidence: number;
  escalated: boolean;
  escalationReason: string;
  escalationCategories: string[];
  retrievedDocs: RetrievedDoc[];
};

type StreamingState = StreamingMeta & {
  ticketText: string;
  response: string;
  isStreaming: boolean;
  stopped?: boolean;
  id?: number;
};

const DRAFT_KEY = "triage-draft";

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(text: string) {
  try {
    if (text) {
      localStorage.setItem(DRAFT_KEY, text);
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export default function Home() {
  const [ticketText, setTicketText] = useState(() => readDraft());
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [lastStoppedResult, setLastStoppedResult] = useState<StreamingState | null>(null);
  const [suppressHistory, setSuppressHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [textRestored, setTextRestored] = useState(false);
  const [restoredLabel, setRestoredLabel] = useState("RESTORED");
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRef = useRef<StreamingState | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading: isHistoryLoading } = useListTickets();

  useEffect(() => {
    const hasDraft = !!readDraft();
    if (hasDraft) {
      setRestoredLabel("DRAFT RESTORED");
      setTextRestored(true);
      setTimeout(() => setTextRestored(false), 2000);
    }
  }, []);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      if (!isSubmittingRef.current) {
        saveDraft(ticketText);
      }
    }, 500);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [ticketText]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const streamTicket = useCallback(async (text: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setSuppressHistory(false);

    const initialState: StreamingState = {
      ticketText: text,
      domain: "",
      domainConfidence: 0,
      escalated: false,
      escalationReason: "",
      escalationCategories: [],
      retrievedDocs: [],
      response: "",
      isStreaming: true,
    };
    streamingRef.current = initialState;
    setStreaming(initialState);

    let aborted = false;

    try {
      const response = await fetch("/api/triage/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketText: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "meta") {
              setStreaming((prev) => {
                const next = prev && ({
                  ...prev,
                  domain: data.domain,
                  domainConfidence: data.domainConfidence,
                  escalated: data.escalated,
                  escalationReason: data.escalationReason,
                  escalationCategories: data.escalationCategories,
                  retrievedDocs: data.retrievedDocs,
                });
                if (next) streamingRef.current = next;
                return next;
              });
            } else if (data.type === "chunk") {
              setStreaming((prev) => {
                const next = prev && ({ ...prev, response: prev.response + data.text });
                if (next) streamingRef.current = next;
                return next;
              });
            } else if (data.type === "done") {
              setStreaming((prev) => {
                const next = prev && ({ ...prev, isStreaming: false, id: data.id });
                if (next) streamingRef.current = next;
                return next;
              });
              clearDraft();
              setLastStoppedResult(null);
              queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetTriageStatsQueryKey() });
            }
          } catch (parseErr) {
            console.warn("[triage/stream] Malformed SSE frame ignored:", line, parseErr);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        aborted = true;
        const stoppedState = streamingRef.current
          ? { ...streamingRef.current, isStreaming: false, stopped: true }
          : null;
        setStreaming(stoppedState);
        if (stoppedState) setLastStoppedResult(stoppedState);
        setTicketText(text);
        setRestoredLabel("RESTORED");
        setTextRestored(true);
        setTimeout(() => setTextRestored(false), 2000);
      } else {
        console.error("[triage/stream] Stream error:", err);
        toast({ title: "Error", description: "Failed to process the ticket. Please try again.", variant: "destructive" });
        setStreaming(null);
      }
    } finally {
      abortControllerRef.current = null;
      setIsSubmitting(false);
      if (aborted) {
        toast({ title: "Stopped", description: "Response stopped — your original text has been restored.", variant: "default" });
      }
    }
  }, [queryClient, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketText.trim() || isSubmitting) return;
    const text = ticketText;
    setTicketText("");
    streamTicket(text);
  };

  const displayTicket = streaming ?? (suppressHistory ? null : (history && history.length > 0 ? history[0] : null));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Triage Console</h1>
            <p className="text-muted-foreground mt-1">Submit support tickets for instant classification and routing.</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-mono bg-card px-3 py-1.5 border border-border">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">AGENT STATUS:</span>
            <span className={`font-bold ${isSubmitting ? "text-yellow-400 animate-pulse" : "text-primary"}`}>
              {isSubmitting ? "PROCESSING" : "READY"}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Submission Form */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-primary/20 shadow-none rounded-none bg-card">
              <CardHeader className="border-b border-border bg-muted/30 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="w-4 h-4" />
                  New Input Stream
                </CardTitle>
                <CardDescription>Paste customer query here for analysis.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Textarea
                      data-testid="input-ticket"
                      placeholder="User issue goes here..."
                      className={`min-h-[200px] font-mono text-sm resize-none rounded-none focus-visible:ring-primary transition-colors duration-300 ${textRestored ? "border-emerald-500 ring-1 ring-emerald-500/50" : "border-border"}`}
                      value={ticketText}
                      onChange={(e) => {
                        setTicketText(e.target.value);
                        if (streaming?.stopped) {
                          setStreaming(null);
                          setSuppressHistory(true);
                        }
                      }}
                      disabled={isSubmitting}
                    />
                    {textRestored && (
                      <span className="absolute top-2 right-2 text-xs font-mono font-bold text-emerald-500 bg-card px-1.5 py-0.5 border border-emerald-500/40 animate-in fade-in duration-200">
                        {restoredLabel}
                      </span>
                    )}
                  </div>
                  {isSubmitting ? (
                    <Button
                      data-testid="button-stop"
                      type="button"
                      variant="destructive"
                      className="w-full font-bold tracking-wide rounded-none flex items-center gap-2"
                      onClick={handleStop}
                    >
                      <Square className="w-4 h-4 fill-current" />
                      STOP
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        data-testid="button-submit"
                        type="submit"
                        className="w-full font-bold tracking-wide rounded-none"
                        disabled={!ticketText.trim()}
                      >
                        EXECUTE TRIAGE
                      </Button>
                      {streaming?.stopped && ticketText.trim() && (
                        <Button
                          data-testid="button-retry"
                          type="button"
                          variant="outline"
                          className="w-full font-bold tracking-wide rounded-none border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 flex items-center gap-2 animate-in fade-in duration-200"
                          onClick={() => {
                            const text = ticketText;
                            setTicketText("");
                            streamTicket(text);
                          }}
                        >
                          <RotateCcw className="w-4 h-4" />
                          RETRY
                        </Button>
                      )}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Results Display */}
          <div className="lg:col-span-7 space-y-6">
            {lastStoppedResult && streaming && !streaming.stopped && (
              <div
                data-testid="stopped-result-banner"
                className="border border-amber-500/30 bg-amber-500/5 p-4 space-y-2 animate-in fade-in duration-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ban className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-mono font-bold text-amber-500 tracking-wider">PREVIOUS PARTIAL RESULT</span>
                  </div>
                  <button
                    data-testid="button-dismiss-stopped"
                    onClick={() => setLastStoppedResult(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs font-mono text-muted-foreground/60 truncate">
                  {lastStoppedResult.ticketText}
                </div>
                <div className="p-3 bg-muted border border-border text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto text-muted-foreground">
                  {lastStoppedResult.response}
                  <span className="inline-block ml-1 text-xs italic text-muted-foreground/70 font-mono select-none">▌ [response cut off]</span>
                </div>
              </div>
            )}
            <Card className="rounded-none shadow-none border-border bg-card min-h-[400px] flex flex-col">
              <CardHeader className="border-b border-border bg-muted/30 pb-4">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ActivityIcon className="w-4 h-4" />
                    Latest Analysis Result
                  </span>
                  {streaming?.isStreaming && (
                    <Badge variant="outline" className="animate-pulse bg-primary/10 text-primary border-primary/30">
                      ANALYZING...
                    </Badge>
                  )}
                  {streaming?.stopped && !streaming?.isStreaming && (
                    <Badge
                      data-testid="badge-stopped"
                      variant="outline"
                      className="bg-amber-500/10 text-amber-500 border-amber-500/40 font-mono flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" />
                      PARTIAL — STOPPED
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex-1 flex flex-col">
                {isSubmitting && !streaming?.domain ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-center">
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <div className="pt-4 grid grid-cols-2 gap-4">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  </div>
                ) : displayTicket && displayTicket.domain ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="result-panel">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <DomainBadge domain={displayTicket.domain} confidence={displayTicket.domainConfidence} />
                        {displayTicket.escalated ? (
                          <Badge variant="destructive" className="rounded-none font-mono flex items-center gap-1" data-testid="status-escalated">
                            <ShieldAlert className="w-3 h-3" />
                            ESCALATED
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 rounded-none font-mono flex items-center gap-1 hover:bg-emerald-500/30" data-testid="status-auto-responded">
                            <CheckCircle2 className="w-3 h-3" />
                            AUTO-RESPONDED
                          </Badge>
                        )}
                      </div>
                      {"createdAt" in displayTicket && displayTicket.createdAt ? (
                        <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(displayTicket.createdAt as string), "HH:mm:ss.SSS")}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold text-muted-foreground tracking-wider">INPUT</h4>
                      <div className="p-3 bg-muted/30 border border-border text-sm font-mono overflow-y-auto max-h-[100px]">
                        {displayTicket.ticketText}
                      </div>
                    </div>

                    {displayTicket.escalated ? (
                      <div className="space-y-4 border border-destructive/30 bg-destructive/5 p-4">
                        <div>
                          <h4 className="text-xs font-mono font-bold text-destructive tracking-wider flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4" />
                            ESCALATION REASON
                          </h4>
                          <p className="text-sm font-medium text-foreground">{displayTicket.escalationReason}</p>
                        </div>
                        {displayTicket.escalationCategories?.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {displayTicket.escalationCategories.map((cat) => (
                              <Badge key={cat} variant="outline" className="border-destructive/30 text-destructive text-xs rounded-none bg-background">
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <h4 className="text-xs font-mono font-bold text-emerald-500 tracking-wider">AI RESPONSE</h4>
                        <div
                          data-testid="text-response"
                          className="p-4 bg-muted border border-border text-sm leading-relaxed whitespace-pre-wrap min-h-[80px]"
                        >
                          {displayTicket.response}
                          {streaming?.isStreaming && !displayTicket.escalated && (
                            <span className="inline-block w-[2px] h-[1em] bg-emerald-400 ml-0.5 animate-[blink_1s_step-end_infinite] align-text-bottom" />
                          )}
                          {streaming?.stopped && (
                            <span className="inline-block ml-1 text-xs italic text-muted-foreground/70 font-mono select-none">▌ [response cut off]</span>
                          )}
                        </div>
                      </div>
                    )}

                    <SourcesSection docs={displayTicket.retrievedDocs ?? []} />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground font-mono text-sm space-y-4 opacity-50">
                    <ActivityIcon className="w-12 h-12" />
                    <p>AWAITING INPUT...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
