import { useState, Fragment } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTickets } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DomainBadge, Domain } from "@/components/domain-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Search, ShieldAlert, CheckCircle2, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourcesSection } from "@/components/sources-section";

export default function History() {
  const { data: tickets, isLoading } = useListTickets();
  const [searchTerm, setSearchTerm] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourcesFilter, setSourcesFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
            <p className="text-muted-foreground mt-1">Complete history of triaged support interactions.</p>
          </div>
        </header>

        <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search ticket content..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-none border-border bg-background"
            />
          </div>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-none border-border bg-background">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="hackerrank">HackerRank</SelectItem>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="visa">Visa</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-none border-border bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="auto">Auto-Responded</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourcesFilter} onValueChange={setSourcesFilter}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-none border-border bg-background">
              <SelectValue placeholder="Sources" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="with">With sources</SelectItem>
              <SelectItem value="without">Without sources</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32px]" />
                <TableHead className="w-[100px] font-mono text-xs">ID</TableHead>
                <TableHead className="w-[180px] font-mono text-xs">TIMESTAMP</TableHead>
                <TableHead className="w-[150px] font-mono text-xs">DOMAIN</TableHead>
                <TableHead className="w-[140px] font-mono text-xs">STATUS</TableHead>
                <TableHead className="w-[90px] font-mono text-xs">SOURCES</TableHead>
                <TableHead className="font-mono text-xs">CONTENT SNIPPET</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTickets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground font-mono">
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
                        className="hover:bg-muted/50 group cursor-pointer select-none"
                        onClick={() => toggleExpand(ticket.id)}
                        data-testid={`history-row-${ticket.id}`}
                      >
                        <TableCell className="pl-3 pr-0">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          #{ticket.id.toString().padStart(4, '0')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {format(new Date(ticket.createdAt), "MMM dd, HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <DomainBadge domain={ticket.domain} confidence={ticket.domainConfidence} className="text-[10px] py-0 h-6" />
                        </TableCell>
                        <TableCell>
                          {ticket.escalated ? (
                            <div className="flex items-center text-destructive text-xs font-mono font-bold gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              ESCALATED
                            </div>
                          ) : (
                            <div className="flex items-center text-emerald-500 text-xs font-mono font-bold gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              RESOLVED
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasDocs ? (
                            <Badge variant="outline" className="rounded-none font-mono text-[10px] border-primary/30 text-primary tabular-nums">
                              {ticket.retrievedDocs.length}
                            </Badge>
                          ) : (
                            <span className="text-xs font-mono text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[400px]">
                          <div className="truncate text-sm opacity-80 group-hover:opacity-100 transition-opacity font-mono">
                            {ticket.ticketText}
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${ticket.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="p-0">
                            <div className="px-6 py-4 space-y-4 border-t border-border/40">
                              <div className="space-y-1.5">
                                <h4 className="text-[10px] font-mono font-bold text-muted-foreground tracking-wider">INPUT</h4>
                                <div className="p-3 bg-background border border-border text-sm font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                                  {ticket.ticketText}
                                </div>
                              </div>

                              {ticket.escalated ? (
                                <div className="space-y-2 border border-destructive/30 bg-destructive/5 p-3">
                                  <h4 className="text-[10px] font-mono font-bold text-destructive tracking-wider flex items-center gap-2">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    ESCALATION REASON
                                  </h4>
                                  <p className="text-sm text-foreground">{ticket.escalationReason}</p>
                                  {ticket.escalationCategories?.length > 0 && (
                                    <div className="flex gap-2 flex-wrap pt-1">
                                      {ticket.escalationCategories.map((cat: string) => (
                                        <Badge key={cat} variant="outline" className="border-destructive/30 text-destructive text-xs rounded-none bg-background">
                                          {cat}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : ticket.response ? (
                                <div className="space-y-1.5">
                                  <h4 className="text-[10px] font-mono font-bold text-emerald-500 tracking-wider">AI RESPONSE</h4>
                                  <div className="p-3 bg-background border border-border text-sm leading-relaxed whitespace-pre-wrap max-h-[160px] overflow-y-auto font-mono">
                                    {ticket.response}
                                  </div>
                                </div>
                              ) : null}

                              {hasDocs && (
                                <SourcesSection docs={ticket.retrievedDocs} />
                              )}

                              {!hasDocs && (
                                <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wider">NO SOURCE DOCUMENTS FOR THIS TICKET</p>
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
