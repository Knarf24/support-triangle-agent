import { AppLayout } from "@/components/layout/AppLayout";
import { useGetTriageStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Activity, ShieldAlert, CheckCircle2, TrendingUp, Layers, BookOpen, BarChart2 } from "lucide-react";

export default function Stats() {
  const { data: stats, isLoading } = useGetTriageStats();

  const domainData = stats ? [
    { name: 'HackerRank', value: stats.byDomain.hackerrank, color: 'hsl(var(--domain-hackerrank))' },
    { name: 'Claude', value: stats.byDomain.claude, color: 'hsl(var(--domain-claude))' },
    { name: 'Visa', value: stats.byDomain.visa, color: 'hsl(var(--domain-visa))' },
    { name: 'Unknown', value: stats.byDomain.unknown, color: 'hsl(var(--domain-unknown))' },
  ] : [];

  const escalationRate = stats && stats.total > 0 
    ? Math.round((stats.escalated / stats.total) * 100) 
    : 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Metrics</h1>
            <p className="text-muted-foreground mt-1">Aggregate performance and routing statistics.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="TOTAL PROCESSED"
            value={stats?.total}
            icon={Activity}
            loading={isLoading}
            className="border-primary/30"
          />
          <StatCard
            title="AUTO-RESOLVED"
            value={stats?.autoResponded}
            icon={CheckCircle2}
            loading={isLoading}
            className="border-emerald-500/30"
            valueClassName="text-emerald-500"
          />
          <StatCard
            title="ESCALATED TO HUMAN"
            value={stats?.escalated}
            icon={ShieldAlert}
            loading={isLoading}
            className="border-destructive/30"
            valueClassName="text-destructive"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            title="TOTAL KB SOURCES CONSULTED"
            value={stats?.totalSources}
            icon={BookOpen}
            loading={isLoading}
            className="border-primary/30"
          />
          <StatCard
            title="AVG SOURCES PER TICKET"
            value={stats?.avgSourcesPerTicket}
            icon={BarChart2}
            loading={isLoading}
            className="border-primary/30"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-none bg-card border-border shadow-none">
            <CardHeader className="border-b border-border bg-muted/20">
              <CardTitle className="text-sm font-mono tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                VOLUME BY DOMAIN
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 h-[300px]">
              {isLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0' }}
                      itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-mono)' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                      {domainData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none bg-card border-border shadow-none">
            <CardHeader className="border-b border-border bg-muted/20">
              <CardTitle className="text-sm font-mono tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                SYSTEM EFFICIENCY
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col items-center justify-center h-[300px]">
              {isLoading ? (
                <Skeleton className="w-48 h-48 rounded-full" />
              ) : (
                <div className="relative flex items-center justify-center">
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle
                      className="text-muted stroke-current"
                      strokeWidth="12"
                      cx="96"
                      cy="96"
                      r="88"
                      fill="transparent"
                    />
                    <circle
                      className="text-emerald-500 stroke-current drop-shadow-md"
                      strokeWidth="12"
                      strokeDasharray={2 * Math.PI * 88}
                      strokeDashoffset={2 * Math.PI * 88 * (1 - (100 - escalationRate) / 100)}
                      strokeLinecap="butt"
                      cx="96"
                      cy="96"
                      r="88"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold font-mono tracking-tighter text-emerald-500">
                      {100 - escalationRate}%
                    </span>
                    <span className="text-xs font-mono text-muted-foreground mt-1">AUTO-RESOLVED</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, loading, className, valueClassName }: any) {
  return (
    <Card className={`rounded-none bg-card shadow-none border ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex flex-col space-y-2">
            <p className="text-xs font-mono font-bold text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <h2 className={`text-4xl font-bold tracking-tighter font-mono ${valueClassName || 'text-foreground'}`}>
                {value ?? 0}
              </h2>
            )}
          </div>
          <div className={`p-4 bg-muted/50 rounded-none border border-border ${className}`}>
            <Icon className="w-6 h-6 opacity-75" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
