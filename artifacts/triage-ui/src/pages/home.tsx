import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTickets, getListTicketsQueryKey, getGetTriageStatsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DomainBadge } from "@/components/domain-badge";
import { AlertCircle, CheckCircle2, Clock, Send, ShieldAlert, Cpu, Square, Ban, X, RotateCcw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, isToday } from "date-fns";
import { SourcesSection } from "@/components/sources-section";
import { MultimodalInput } from "@/components/multimodal-input";
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
const MAX_CHARS = 2000;

const PLACEHOLDER_EXAMPLES = [
  "My HackerRank test timed out in the middle of the assessment. Can you reset it?",
  "How do I adjust the temperature parameter in Claude 3 Opus to make it more creative?",
  "A customer's Visa payment failed with code 51. What does this mean?"
];

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
  const [inputMethod, setInputMethod] = useState<string>("typed");
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [lastStoppedResult, setLastStoppedResult] = useState<StreamingState | null>(null);
  const [suppressHistory, setSuppressHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [textRestored, setTextRestored] = useState(false);
  const [restoredLabel, setRestoredLabel] = useState("RESTORED");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRef = useRef<StreamingState | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading: isHistoryLoading } = useListTickets();

  const handleTranscript = useCallback((text: string, method: "voice" | "camera" | "upload") => {
    setTicketText(text);
    setInputMethod(method);
    setSuppressHistory(true);
    setStreaming(null);
  }, []);

  const ticketsToday = history?.filter((t) => isToday(new Date(t.createdAt))).length ?? 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
        body: JSON.stringify({ ticketText: text, inputMethod }),
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
              setInputMethod("typed");
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
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10 relative">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/50 via-primary/10 to-transparent"></div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,212,255,0.2)]">
                Triage Console
              </h1>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-success animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,255,136,0.6)]"></div>
                <span className="text-[10px] font-mono font-bold text-success tracking-[0.2em]">SYSTEM ACTIVE</span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-sans">Submit support tickets for instant classification and routing.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-[10px] font-mono text-muted-foreground tracking-[0.2em]">TICKETS TODAY</div>
            <div className="text-2xl font-bold font-mono text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
              {ticketsToday}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          {/* Submission Form */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="glass-card rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-mono text-primary tracking-wider">
                  <Send className="w-4 h-4" />
                  NEW INPUT STREAM
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground font-sans">Paste customer query here for analysis.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative group">
                    <Textarea
                      data-testid="input-ticket"
                      placeholder={!isFocused && !ticketText ? PLACEHOLDER_EXAMPLES[placeholderIndex] : ""}
                      className={`min-h-[240px] font-mono text-sm resize-none rounded-lg transition-all duration-300 bg-black/40 
                        ${isFocused ? 'border-primary ring-1 ring-primary shadow-[0_0_15px_rgba(0,212,255,0.2)]' : 'border-white/10'}
                        ${textRestored ? "border-success ring-1 ring-success shadow-[0_0_15px_rgba(0,255,136,0.2)]" : ""}
                      `}
                      value={ticketText}
                      maxLength={MAX_CHARS}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      onChange={(e) => {
                        setTicketText(e.target.value);
                        setInputMethod("typed");
                        if (streaming?.stopped) {
                          setStreaming(null);
                          setSuppressHistory(true);
                        }
                      }}
                      disabled={isSubmitting}
                    />
                    
                    {textRestored && (
                      <span className="absolute top-3 right-3 text-[10px] font-mono font-bold text-success bg-success/10 px-2 py-1 rounded border border-success/30 animate-in fade-in duration-200 backdrop-blur-md">
                        {restoredLabel}
                      </span>
                    )}

                    <div className="flex justify-between items-center mt-2 px-1">
                      <div className="text-[10px] font-mono text-muted-foreground transition-colors duration-300 group-focus-within:text-primary/70">
                        {ticketText.length} / {MAX_CHARS}
                      </div>
                      <MultimodalInput onTranscript={handleTranscript} disabled={isSubmitting} />
                    </div>
                    
                    {ticketText.length >= MAX_CHARS * 0.9 && (
                      <div className="text-[10px] font-mono text-destructive animate-pulse mt-2 px-1">
                        APPROACHING LIMIT
                      </div>
                    )}
                  </div>

                  {isSubmitting ? (
                    <Button
                      data-testid="button-stop"
                      type="button"
                      variant="outline"
                      className="w-full font-sans font-bold tracking-[0.15em] rounded-lg flex items-center gap-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary relative overflow-hidden group"
                      onClick={handleStop}
                    >
                      <div className="absolute inset-0 bg-primary/10 w-full animate-[shimmer_2s_infinite] -translate-x-full group-hover:animate-none"></div>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      EXECUTING... <span className="text-[10px] opacity-70 ml-1">(CLICK TO ABORT)</span>
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        data-testid="button-submit"
                        type="submit"
                        className="w-full font-sans font-bold tracking-[0.15em] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(0,212,255,0.3)] hover:shadow-[0_0_25px_rgba(0,212,255,0.5)] transition-all duration-300"
                        disabled={!ticketText.trim()}
                      >
                        EXECUTE TRIAGE
                      </Button>
                      {streaming?.stopped && ticketText.trim() && (
                        <Button
                          data-testid="button-retry"
                          type="button"
                          variant="outline"
                          className="w-full font-sans font-bold tracking-[0.15em] rounded-lg border-destructive/50 text-destructive hover:bg-destructive/10 transition-all duration-300 animate-in fade-in duration-200"
                          onClick={() => {
                            const text = ticketText;
                            setTicketText("");
                            streamTicket(text);
                          }}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          RETRY ANALYSIS
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
                className="glass-card border-destructive/30 bg-destructive/10 p-4 rounded-xl animate-in fade-in slide-in-from-top-4 duration-300 backdrop-blur-md"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-destructive shrink-0" />
                    <span className="text-[10px] font-mono font-bold text-destructive tracking-widest">PREVIOUS PARTIAL RESULT</span>
                  </div>
                  <button
                    data-testid="button-dismiss-stopped"
                    onClick={() => setLastStoppedResult(null)}
                    className="text-muted-foreground hover:text-white transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs font-mono text-muted-foreground/60 truncate mb-2 px-1">
                  {lastStoppedResult.ticketText}
                </div>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto text-muted-foreground shadow-inner">
                  {lastStoppedResult.response}
                  <span className="inline-block ml-1 text-xs italic text-destructive/70 font-mono select-none">▌ [ABORTED]</span>
                </div>
              </div>
            )}
            
            <Card className="glass-card rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-h-[500px] flex flex-col overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-black/20 pb-4 relative">
                {streaming?.isStreaming && (
                  <div className="absolute bottom-0 left-0 h-[2px] bg-primary w-full origin-left animate-[pulse_1s_ease-in-out_infinite] shadow-[0_0_10px_rgba(0,212,255,0.8)]"></div>
                )}
                <CardTitle className="text-sm font-mono flex items-center justify-between">
                  <span className="flex items-center gap-2 text-white tracking-wider">
                    <ActivityIcon className="w-4 h-4 text-primary" />
                    ANALYSIS RESULT
                  </span>
                  {streaming?.isStreaming && (
                    <Badge variant="outline" className="animate-pulse bg-primary/10 text-primary border-primary/30 text-[10px] tracking-widest">
                      ANALYZING...
                    </Badge>
                  )}
                  {streaming?.stopped && !streaming?.isStreaming && (
                    <Badge
                      data-testid="badge-stopped"
                      variant="outline"
                      className="bg-destructive/10 text-destructive border-destructive/40 font-mono text-[10px] tracking-widest flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" />
                      ABORTED
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex-1 flex flex-col p-6">
                {isSubmitting && !streaming?.domain ? (
                  <div className="space-y-6 flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full opacity-60">
                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                      <Skeleton className="h-6 w-32 bg-white/10" />
                      <Skeleton className="h-6 w-24 bg-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24 bg-white/10" />
                      <Skeleton className="h-16 w-full bg-white/10 rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32 bg-white/10" />
                      <Skeleton className="h-32 w-full bg-white/10 rounded-lg" />
                    </div>
                  </div>
                ) : displayTicket && displayTicket.domain ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out" data-testid="result-panel">
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-black/20 p-3 rounded-lg border border-white/5 backdrop-blur-sm">
                      <div className="flex items-center gap-4">
                        <DomainBadge domain={displayTicket.domain} confidence={displayTicket.domainConfidence} className="scale-105 origin-left" />
                        
                        <div className="w-px h-6 bg-white/10 hidden sm:block"></div>
                        
                        {displayTicket.escalated ? (
                          <Badge variant="destructive" className="rounded-md font-mono text-[10px] tracking-[0.15em] flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,68,68,0.3)] px-2 py-1" data-testid="status-escalated">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            ESCALATED
                          </Badge>
                        ) : (
                          <Badge className="bg-success/10 text-success border border-success/30 rounded-md font-mono text-[10px] tracking-[0.15em] flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,255,136,0.2)] px-2 py-1" data-testid="status-auto-responded">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            AUTO-RESPONDED
                          </Badge>
                        )}
                      </div>
                      {"createdAt" in displayTicket && displayTicket.createdAt ? (
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded">
                          <Clock className="w-3 h-3 text-primary/70" />
                          {format(new Date(displayTicket.createdAt as string), "HH:mm:ss.SSS")}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2 md:col-span-2">
                        <h4 className="text-[10px] font-mono font-bold text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                          ORIGINAL INPUT
                        </h4>
                        <div className="p-4 bg-black/30 rounded-lg border border-white/5 text-sm font-mono text-white/80 overflow-y-auto max-h-[120px] shadow-inner leading-relaxed">
                          {displayTicket.ticketText}
                        </div>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        {displayTicket.escalated ? (
                          <div className="space-y-4 border border-destructive/30 bg-destructive/10 p-5 rounded-lg shadow-[inset_0_0_20px_rgba(255,68,68,0.05)] relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-destructive"></div>
                            <div>
                              <h4 className="text-[10px] font-mono font-bold text-destructive tracking-[0.2em] flex items-center gap-2 mb-3">
                                <AlertCircle className="w-4 h-4" />
                                ESCALATION REASON
                              </h4>
                              <p className="text-sm font-medium text-white leading-relaxed">{displayTicket.escalationReason}</p>
                            </div>
                            {displayTicket.escalationCategories?.length > 0 && (
                              <div className="flex gap-2 flex-wrap pt-2">
                                {displayTicket.escalationCategories.map((cat) => (
                                  <Badge key={cat} variant="outline" className="border-destructive/30 text-destructive text-[10px] tracking-wider rounded bg-destructive/5 px-2 py-0.5">
                                    {cat}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2 relative">
                            <h4 className="text-[10px] font-mono font-bold text-success tracking-[0.2em] flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_5px_rgba(0,255,136,0.8)]"></span>
                              AI RESPONSE
                            </h4>
                            <div
                              data-testid="text-response"
                              className="p-5 bg-primary/5 rounded-lg border border-primary/20 text-sm font-sans leading-relaxed whitespace-pre-wrap min-h-[120px] text-white/90 shadow-[inset_0_0_20px_rgba(0,212,255,0.03)]"
                            >
                              {displayTicket.response}
                              {streaming?.isStreaming && !displayTicket.escalated && (
                                <span className="inline-block w-[2px] h-[1em] bg-primary ml-1 animate-[blink_1s_step-end_infinite] align-text-bottom shadow-[0_0_5px_rgba(0,212,255,0.8)]" />
                              )}
                              {streaming?.stopped && (
                                <span className="inline-block ml-1 text-xs italic text-destructive/70 font-mono select-none">▌ [ABORTED]</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <SourcesSection docs={displayTicket.retrievedDocs ?? []} />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground font-mono text-sm space-y-6 opacity-40">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary blur-2xl opacity-20 rounded-full animate-pulse"></div>
                      <ActivityIcon className="w-16 h-16 text-white relative z-10" />
                    </div>
                    <p className="tracking-widest">SYSTEM STANDBY // AWAITING INPUT</p>
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