import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTriageTicket, useListTickets, getListTicketsQueryKey, getGetTriageStatsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DomainBadge } from "@/components/domain-badge";
import { AlertCircle, CheckCircle2, Clock, Send, ShieldAlert, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Home() {
  const [ticketText, setTicketText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: submitTicket, isPending } = useTriageTicket();
  const { data: history, isLoading: isHistoryLoading } = useListTickets();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketText.trim()) return;

    submitTicket(
      { data: { ticketText } },
      {
        onSuccess: () => {
          setTicketText("");
          toast({
            title: "Ticket Processed",
            description: "The AI agent has successfully triaged the ticket.",
          });
          queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTriageStatsQueryKey() });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to process the ticket. Please try again.",
            variant: "destructive",
          });
        }
      }
    );
  };

  const latestTicket = history?.[history.length - 1];

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
            <span className="text-primary font-bold">READY</span>
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
                  <Textarea
                    placeholder="User issue goes here..."
                    className="min-h-[200px] font-mono text-sm resize-none rounded-none focus-visible:ring-primary border-border"
                    value={ticketText}
                    onChange={(e) => setTicketText(e.target.value)}
                    disabled={isPending}
                  />
                  <Button 
                    type="submit" 
                    className="w-full font-bold tracking-wide rounded-none" 
                    disabled={!ticketText.trim() || isPending}
                  >
                    {isPending ? "PROCESSING..." : "EXECUTE TRIAGE"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Quick Stats or Last Action could go here */}
          </div>

          {/* Results Display */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="rounded-none shadow-none border-border bg-card min-h-[400px] flex flex-col">
              <CardHeader className="border-b border-border bg-muted/30 pb-4">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Latest Analysis Result
                  </span>
                  {isPending && <Badge variant="outline" className="animate-pulse bg-primary/10 text-primary">ANALYZING...</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex-1 flex flex-col">
                {isPending ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-center">
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <div className="pt-4 grid grid-cols-2 gap-4">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  </div>
                ) : latestTicket ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <DomainBadge domain={latestTicket.domain} confidence={latestTicket.domainConfidence} />
                        {latestTicket.escalated ? (
                          <Badge variant="destructive" className="rounded-none font-mono flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" />
                            ESCALATED
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 rounded-none font-mono flex items-center gap-1 hover:bg-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            AUTO-RESPONDED
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(latestTicket.createdAt), "HH:mm:ss.SSS")}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-mono font-bold text-muted-foreground tracking-wider">INPUT</h4>
                      <div className="p-3 bg-muted/30 border border-border text-sm font-mono overflow-y-auto max-h-[100px]">
                        {latestTicket.ticketText}
                      </div>
                    </div>

                    {latestTicket.escalated ? (
                      <div className="space-y-4 border border-destructive/30 bg-destructive/5 p-4">
                        <div>
                          <h4 className="text-xs font-mono font-bold text-destructive tracking-wider flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4" />
                            ESCALATION REASON
                          </h4>
                          <p className="text-sm font-medium text-foreground">{latestTicket.escalationReason}</p>
                        </div>
                        {latestTicket.escalationCategories?.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {latestTicket.escalationCategories.map(cat => (
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
                        <div className="p-4 bg-muted border border-border text-sm leading-relaxed whitespace-pre-wrap">
                          {latestTicket.response}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground font-mono text-sm space-y-4 opacity-50">
                    <Activity className="w-12 h-12" />
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

function Activity({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className={className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
