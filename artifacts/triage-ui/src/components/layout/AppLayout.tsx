import { Link, useLocation } from "wouter";
import { Activity, History, LayoutDashboard, Ticket, Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Triage", icon: Ticket },
  { href: "/history", label: "History", icon: History },
  { href: "/stats", label: "Stats", icon: Activity },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row relative">
      <div className="fixed inset-0 pointer-events-none bg-grid-pattern opacity-30 z-0"></div>
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-background/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2 text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.5)]">
          <LayoutDashboard className="h-6 w-6" />
          <span className="font-bold text-lg tracking-tight">Triage Ops</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="text-muted-foreground hover:text-white">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`
        ${collapsed ? 'hidden md:flex md:w-20' : 'flex w-full md:w-64'} 
        flex-col border-b md:border-b-0 md:border-r border-white/10 glass-card z-10 transition-all duration-300
      `}>
        <div className={`p-6 border-b border-white/10 flex items-center justify-between ${collapsed ? 'md:justify-center md:px-2' : ''}`}>
          <div className={`flex items-center gap-2 text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.5)] ${collapsed ? 'md:hidden' : ''}`}>
            <LayoutDashboard className="h-6 w-6" />
            <span className="font-bold text-lg tracking-tight">Triage Ops</span>
          </div>
          {collapsed && <LayoutDashboard className="hidden md:block h-6 w-6 text-primary drop-shadow-[0_0_8px_rgba(0,212,255,0.5)]" />}
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-300 relative group
                  ${isActive
                    ? "text-primary bg-primary/10 shadow-[inset_4px_0_0_0_rgba(0,212,255,1)]"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                  } ${collapsed ? 'md:justify-center' : ''}`
                }
              >
                <item.icon className={`h-5 w-5 ${isActive ? 'drop-shadow-[0_0_5px_rgba(0,212,255,0.8)]' : 'group-hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]'}`} />
                <span className={`font-medium tracking-wide ${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                {isActive && <div className="absolute inset-0 bg-primary/5 blur-md -z-10 rounded-md"></div>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 mt-auto bg-black/20">
          <div className={`text-[10px] font-mono text-muted-foreground flex items-center ${collapsed ? 'md:justify-center' : 'justify-between'}`}>
            <span className={`${collapsed ? 'md:hidden' : ''}`}>STATUS</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,255,136,0.6)]"></div>
              <span className={`text-success font-bold tracking-wider ${collapsed ? 'md:hidden' : ''}`}>ONLINE</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto relative z-10">
        {children}
      </main>
    </div>
  );
}
