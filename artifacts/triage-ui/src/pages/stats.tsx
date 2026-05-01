import { AppLayout } from "@/components/layout/AppLayout";
import { useGetTriageStats, useListTickets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { Activity, ShieldAlert, CheckCircle2, TrendingUp, Layers, BookOpen, BarChart2, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { DomainBadge } from "@/components/domain-badge";
import { Badge } from "@/components/ui/badge";

function AnimatedCounter({ value, duration = 1200 }: { value: number, duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = 0;
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // easeOutQuart
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      
      setCount(Math.floor(easeProgress * (value - startValue) + startValue));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <>{count}</>;
}

export default function Stats() {
  const { data: stats, isLoading } = useGetTriageStats();
  const { data: tickets, isLoading: isTicketsLoading } = useListTickets();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const domainData = stats ? [
    { name: 'HackerRank', value: stats.byDomain.hackerrank, color: 'hsl(var(--domain-hackerrank))' },
    { name: 'Claude', value: stats.byDomain.claude, color: 'hsl(var(--domain-claude))' },
    { name: 'Visa', value: stats.byDomain.visa, color: 'hsl(var(--domain-visa))' },
    { name: 'Unknown', value: stats.byDomain.unknown, color: 'hsl(var(--domain-unknown))' },
  ] : [];

  const escalationRate = stats && stats.total > 0 
    ? Math.round((stats.escalated / stats.total) * 100) 
    : 0;

  const autoResolvedRate = 100 - escalationRate;
  
  const recentTickets = tickets?.slice().reverse().slice(0, 5) || [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 relative z-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6 relative">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/50 via-primary/10 to-transparent"></div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,212,255,0.2)]">System Metrics</h1>
            <p className="text-muted-foreground mt-1 font-sans text-sm">Aggregate performance and routing statistics.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="TOTAL PROCESSED"
            value={stats?.total}
            icon={Activity}
            loading={isLoading}
            className="border-primary/30 shadow-[0_0_15px_rgba(0,212,255,0.1)]"
            iconClassName="text-primary drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]"
          />
          <StatCard
            title="AUTO-RESOLVED"
            value={stats?.autoResponded}
            icon={CheckCircle2}
            loading={isLoading}
            className="border-success/30 shadow-[0_0_15px_rgba(0,255,136,0.1)]"
            valueClassName="text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.3)]"
            iconClassName="text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]"
          />
          <StatCard
            title="ESCALATED TO HUMAN"
            value={stats?.escalated}
            icon={ShieldAlert}
            loading={isLoading}
            className="border-destructive/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]"
            valueClassName="text-destructive drop-shadow-[0_0_5px_rgba(255,68,68,0.3)]"
            iconClassName="text-destructive drop-shadow-[0_0_5px_rgba(255,68,68,0.5)]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            title="TOTAL KB SOURCES CONSULTED"
            value={stats?.totalSources}
            icon={BookOpen}
            loading={isLoading}
            className="border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            iconClassName="text-muted-foreground"
          />
          <StatCard
            title="AVG SOURCES PER TICKET"
            value={stats?.avgSourcesPerTicket}
            icon={BarChart2}
            loading={isLoading}
            className="border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            iconClassName="text-muted-foreground"
            isFloat
          />
        </div>

        <Card className="glass-card rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
            <CardTitle className="text-xs font-mono font-bold text-primary tracking-[0.2em] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              KB SOURCES CONSULTED OVER TIME
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[260px]">
            {isLoading ? (
              <Skeleton className="w-full h-full bg-white/5" />
            ) : !stats?.sourcesOverTime?.length ? (
              <div className="flex items-center justify-center h-full text-xs font-mono text-muted-foreground tracking-[0.15em]">NO DATA YET</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.sourcesOverTime} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    fontFamily="var(--font-mono)"
                    tickFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00");
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} fontFamily="var(--font-mono)" allowDecimals={false} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(0,212,255,0.2)', strokeWidth: 1 }}
                    contentStyle={{ backgroundColor: 'rgba(10,15,30,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 'bold', fontFamily: 'var(--font-mono)', fontSize: '10px' }}
                    labelFormatter={(label: string) => {
                      const d = new Date(label + "T00:00:00");
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    }}
                    formatter={(value: number) => [value, 'Sources']}
                  />
                  <Line
                    type="monotone"
                    dataKey="sources"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))', stroke: 'rgba(0,212,255,0.3)', strokeWidth: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
              <CardTitle className="text-xs font-mono font-bold text-primary tracking-[0.2em] flex items-center gap-2">
                <Layers className="w-4 h-4" />
                VOLUME BY DOMAIN
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 h-[300px]">
              {isLoading ? (
                <Skeleton className="w-full h-full bg-white/5" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} fontFamily="var(--font-mono)" />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} fontFamily="var(--font-mono)" />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: 'rgba(10,15,30,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 'bold', fontFamily: 'var(--font-mono)', fontSize: '10px', tracking: 'widest' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {domainData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
              <CardTitle className="text-xs font-mono font-bold text-primary tracking-[0.2em] flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                SYSTEM EFFICIENCY
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col items-center justify-center h-[300px]">
              {isLoading ? (
                <Skeleton className="w-48 h-48 rounded-full bg-white/5" />
              ) : (
                <div className="relative flex items-center justify-center group">
                  <div className="absolute inset-0 bg-success/20 rounded-full blur-2xl opacity-50 transition-opacity duration-500 group-hover:opacity-80"></div>
                  <svg className="w-56 h-56 transform -rotate-90 relative z-10">
                    <circle
                      className="text-white/5 stroke-current"
                      strokeWidth="16"
                      cx="112"
                      cy="112"
                      r="96"
                      fill="transparent"
                    />
                    <circle
                      className="text-success stroke-current drop-shadow-[0_0_10px_rgba(0,255,136,0.5)] transition-all duration-1000 ease-out"
                      strokeWidth="16"
                      strokeDasharray={2 * Math.PI * 96}
                      strokeDashoffset={mounted ? 2 * Math.PI * 96 * (1 - autoResolvedRate / 100) : 2 * Math.PI * 96}
                      strokeLinecap="round"
                      cx="112"
                      cy="112"
                      r="96"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center z-20">
                    <span className="text-5xl font-bold font-mono tracking-tighter text-success drop-shadow-[0_0_8px_rgba(0,255,136,0.6)]">
                      <AnimatedCounter value={autoResolvedRate} />%
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground mt-1 tracking-[0.2em] font-bold">AUTO-RESOLVED</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="glass-card rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
            <CardTitle className="text-xs font-mono font-bold text-primary tracking-[0.2em] flex items-center gap-2">
              <Activity className="w-4 h-4" />
              RECENT ACTIVITY
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isTicketsLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full bg-white/5" />
                <Skeleton className="h-12 w-full bg-white/5" />
                <Skeleton className="h-12 w-full bg-white/5" />
              </div>
            ) : recentTickets.length === 0 ? (
              <div className="p-8 text-center text-sm font-mono text-muted-foreground">NO RECENT TICKETS FOUND</div>
            ) : (
              <div className="divide-y divide-white/5">
                {recentTickets.map((ticket, i) => (
                  <div key={ticket.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-mono text-muted-foreground/60 w-16">
                        #{ticket.id.toString().padStart(4, '0')}
                      </div>
                      <DomainBadge domain={ticket.domain} confidence={ticket.domainConfidence} className="scale-90 origin-left" />
                      <div className="text-xs font-mono text-muted-foreground hidden sm:block truncate max-w-xs md:max-w-md">
                        {ticket.ticketText}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {ticket.escalated ? (
                        <Badge variant="destructive" className="rounded font-mono text-[9px] tracking-[0.15em] px-1.5 py-0.5 shadow-[0_0_5px_rgba(255,68,68,0.3)]">
                          ESCALATED
                        </Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success border-success/30 rounded font-mono text-[9px] tracking-[0.15em] px-1.5 py-0.5 shadow-[0_0_5px_rgba(0,255,136,0.2)]">
                          RESOLVED
                        </Badge>
                      )}
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded hidden md:flex">
                        <Clock className="w-3 h-3 text-primary/50" />
                        {format(new Date(ticket.createdAt), "HH:mm:ss")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, loading, className, valueClassName, iconClassName, isFloat = false }: any) {
  return (
    <Card className={`glass-card rounded-xl overflow-hidden ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex flex-col space-y-3">
            <p className="text-[10px] font-mono font-bold text-muted-foreground tracking-[0.2em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-10 w-24 bg-white/10" />
            ) : (
              <h2 className={`text-4xl font-bold tracking-tighter font-mono ${valueClassName || 'text-white'}`}>
                {isFloat ? value : <AnimatedCounter value={value ?? 0} />}
              </h2>
            )}
          </div>
          <div className={`p-4 bg-black/40 rounded-lg border border-white/5 shadow-inner`}>
            <Icon className={`w-8 h-8 ${iconClassName}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}