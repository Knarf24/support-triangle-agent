import { useState, Fragment, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTickets } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DomainBadge } from "@/components/domain-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Search, ShieldAlert, CheckCircle2, ChevronDown, ChevronRight, AlertCircle, Download, Mic, Camera, Paperclip } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourcesSection } from "@/components/sources-section";

function InputMethodBadge({ method }: { method: string }) {
  if (method === "voice") return <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 tracking-wider"><Mic className="w-2.5 h-2.5" />VOICE</span>;
  if (method === "camera") return <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#D97757]/10 text-[#D97757] border border-[#D97757]/20 tracking-wider"><Camera className="w-2.5 h-2.5" />CAM</span>;
  if (method === "upload") return <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 tracking-wider"><Paperclip className="w-2.5 h-2.5" />FILE</span>;
  return null;
}

function escapeCsv(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function History() {
  const { data: tickets, isLoading } = useListTickets();
  const [searchTerm, setSearchTerm] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourcesFilter, setSourcesFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const exportCsv = useCallback(() => {
    if (!tickets || tickets.length === 0) return;
    const headers = [
      "id", "timestamp", "domain", "confidence_pct",
      "escalated", "escalation_reason", "escalation_categories",
      "sources_count", "ticket_text", "response"
    ];
    const rows = [...tickets].reverse().map((t) => [
      t.id,
      format(new Date(t.createdAt), "yyyy-MM-dd HH:mm:ss"),
      t.domain,
      Math.round((t.domainConfidence ?? 0) * 100),
      t.escalated ? "true" : "false",
      t.escalationReason ?? "",
      Array.isArray(t.escalationCategories) ? t.escalationCategories.join(";") : "",
      Array.isArray(t.retrievedDocs) ? t.retrievedDocs.length : 0,
      t.ticketText,
      t.response ?? "",
    ].map(escapeCsv).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triage-audit-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tickets]);

  const filteredTickets = tickets?.filter(ticket => {
    const matchesSearch = ticket.ticketText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDomain = domainFilter === "all" || ticket.domain === domainFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "escalated" ? ticket.escalated : !ticket.escalated);
    const hasDocs = Array.isArray(ticket.retrievedDocs) && ticket.retrievedDocs.length > 0;
    const matchesSources = sourcesFilter === "all" ||
      (sourcesFilter === "with" ? hasDocs : !hasDocs);
    
    return matchesSearch && matchesDomain && matchesStatus && matchesSources;
  }).reverse();

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 relative z-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6 relative">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/50 via-primary/10 to-transparent"></div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,212,255,0.2)]">Audit Log</h1>
            <p className="text-muted-foreground mt-1 font-sans text-sm">Complete history of triaged support interactions.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg font-sans font-semibold text-xs tracking-[0.12em] gap-2 self-start md:self-auto border-white/20 hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors shadow-[0_0_15px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-md"
            onClick={exportCsv}
            disabled={!tickets || tickets.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT CSV
          </Button>
        </header>

        <div className="flex flex-col sm:flex-row gap-4 items-center glass-card rounded-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input 
              placeholder="Search ticket content..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-lg border-white/10 bg-black/40 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] focus-visible:shadow-[0_0_15px_rgba(0,212,255,0.2),inset_0_0_10px_rgba(0,0,0,0.5)] font-mono text-sm h-10"
            />
          </div>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-lg border-white/10 bg-black/40 focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-300 h-10 font-mono text-xs">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-white/10 bg-[#0F1423] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] font-mono text-xs">
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="hackerrank">HackerRank</SelectItem>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="visa">Visa</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-lg border-white/10 bg-black/40 focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-300 h-10 font-mono text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-white/10 bg-[#0F1423] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] font-mono text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="auto">Auto-Responded</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourcesFilter} onValueChange={setSourcesFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-lg border-white/10 bg-black/40 focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-300 h-10 font-mono text-xs">
              <SelectValue placeholder="Sources" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border-white/10 bg-[#0F1423] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] font-mono text-xs">
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="with">With Sources</SelectItem>
              <SelectItem value="without">Without Sources</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="glass-card rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <Table>
            <TableHeader className="bg-black/40 border-b border-white/10">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[40px]" />
                <TableHead className="w-[100px] font-mono text-xs tracking-wider text-muted-foreground/80 font-bold">ID</TableHead>
                <TableHead className="w-[180px] font-mono text-xs tracking-wider text-muted-foreground/80 font-bold">TIMESTAMP</TableHead>
                <TableHead className="w-[160px] font-mono text-xs tracking-wider text-muted-foreground/80 font-bold">DOMAIN</TableHead>
                <TableHead className="w-[150px] font-mono text-xs tracking-wider text-muted-foreground/80 font-bold">STATUS</TableHead>
                <TableHead className="w-[100px] font-mono text-xs tracking-wider text-muted-foreground/80 font-bold text-center">SOURCES</TableHead>
                <TableHead className="font-mono text-xs tracking-wider text-muted-foreground/80 font-bold">CONTENT SNIPPET</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-white/5">
                    <TableCell><Skeleton className="h-4 w-4 bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12 bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8 mx-auto bg-white/10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full bg-white/10" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTickets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-muted-foreground font-mono bg-black/20">
                    NO RECORDS FOUND MATCHING CRITERIA
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets?.map((ticket) => {
                  const isExpanded = expandedId === ticket.id;
                  const hasDocs = Array.isArray(ticket.retrievedDocs) && ticket.retrievedDocs.length > 0;
                  return (
                    <Fragment key={ticket.id}>
                      <TableRow
                        className={`hover:bg-primary/5 cursor-pointer select-none border-b border-white/5 transition-all duration-200 group ${isExpanded ? 'bg-primary/5' : ''}`}
                        onClick={() => toggleExpand(ticket.id)}
                        data-testid={`history-row-${ticket.id}`}
                      >
                        <TableCell className="pl-4 pr-0">
                          <div className={`p-1 rounded-md transition-colors ${isExpanded ? 'bg-primary/20 text-primary' : 'text-muted-foreground group-hover:text-primary group-hover:bg-primary/10'}`}>
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                            }
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground group-hover:text-primary transition-colors">
                          <div className="flex flex-col gap-1">
                            #{ticket.id.toString().padStart(4, '0')}
                            {ticket.inputMethod && ticket.inputMethod !== "typed" && (
                              <InputMethodBadge method={ticket.inputMethod} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-white/80">
                          {format(new Date(ticket.createdAt), "MMM dd, HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <DomainBadge domain={ticket.domain} confidence={ticket.domainConfidence} className="text-[10px] py-0 h-6" />
                        </TableCell>
                        <TableCell>
                          {ticket.escalated ? (
                            <div className="flex items-center text-destructive text-[10px] font-mono font-bold tracking-[0.15em] gap-1.5 drop-shadow-[0_0_5px_rgba(255,68,68,0.5)]">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              ESCALATED
                            </div>
                          ) : (
                            <div className="flex items-center text-success text-[10px] font-mono font-bold tracking-[0.15em] gap-1.5 drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              RESOLVED
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {hasDocs ? (
                            <Badge variant="outline" className="rounded bg-primary/10 font-mono text-[10px] border-primary/30 text-primary tabular-nums shadow-[0_0_8px_rgba(0,212,255,0.2)]">
                              {ticket.retrievedDocs.length}
                            </Badge>
                          ) : (
                            <span className="text-xs font-mono text-muted-foreground/30">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[350px]">
                          <div className="truncate text-xs opacity-70 group-hover:opacity-100 transition-opacity font-mono text-white/90">
                            {ticket.ticketText}
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${ticket.id}-detail`} className="bg-black/40 border-b border-white/5 shadow-inner">
                          <TableCell colSpan={7} className="p-0">
                            <div className="px-8 py-6 space-y-6 animate-in slide-in-from-top-2 fade-in duration-300">
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-mono font-bold text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                                  <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                  INPUT
                                </h4>
                                <div className="p-4 bg-black/60 rounded-lg border border-white/5 text-sm font-mono text-white/90 whitespace-pre-wrap max-h-[160px] overflow-y-auto shadow-inner leading-relaxed">
                                  {ticket.ticketText}
                                </div>
                              </div>

                              {ticket.escalated ? (
                                <div className="space-y-3 border border-destructive/30 bg-destructive/10 p-4 rounded-lg shadow-[inset_0_0_20px_rgba(255,68,68,0.05)] relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-destructive"></div>
                                  <h4 className="text-[10px] font-mono font-bold text-destructive tracking-[0.2em] flex items-center gap-2">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    ESCALATION REASON
                                  </h4>
                                  <p className="text-sm font-sans font-medium text-white/90">{ticket.escalationReason}</p>
                                  {ticket.escalationCategories?.length > 0 && (
                                    <div className="flex gap-2 flex-wrap pt-1">
                                      {ticket.escalationCategories.map((cat: string) => (
                                        <Badge key={cat} variant="outline" className="border-destructive/30 text-destructive text-[10px] tracking-wider rounded bg-destructive/5 px-2 py-0.5">
                                          {cat}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : ticket.response ? (
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-mono font-bold text-success tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_5px_rgba(0,255,136,0.8)]"></span>
                                    AI RESPONSE
                                  </h4>
                                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 text-sm font-sans leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto text-white/90 shadow-[inset_0_0_20px_rgba(0,212,255,0.03)]">
                                    {ticket.response}
                                  </div>
                                </div>
                              ) : null}

                              {hasDocs && (
                                <div className="pt-2">
                                  <SourcesSection docs={ticket.retrievedDocs} />
                                </div>
                              )}

                              {!hasDocs && (
                                <div className="flex items-center gap-2 pt-2 border-t border-white/5 mt-4 text-[10px] font-mono text-muted-foreground/40 tracking-[0.2em]">
                                  <div className="w-1 h-1 rounded-full bg-muted-foreground/30"></div>
                                  NO SOURCE DOCUMENTS
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}