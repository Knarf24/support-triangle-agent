import { useListTickets } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AgentChat } from "@/components/agent-chat";
import { isToday } from "date-fns";

export default function Home() {
  const { data: history } = useListTickets();
  const ticketsToday = history?.filter((t) => isToday(new Date(t.createdAt))).length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-white/10 relative">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/50 via-primary/10 to-transparent" />
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,212,255,0.2)]">
                Triage360
              </h1>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-success animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,255,136,0.6)]" />
                <span className="text-[10px] font-mono font-bold text-success tracking-[0.2em]">
                  SYSTEM ACTIVE
                </span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-sans">
              Describe your issue — the agent triages, classifies, and responds automatically.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-[10px] font-mono text-muted-foreground tracking-[0.2em]">
              TICKETS TODAY
            </div>
            <div className="text-2xl font-bold font-mono text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]">
              {ticketsToday}
            </div>
          </div>
        </header>

        <AgentChat />
      </div>
    </AppLayout>
  );
}
