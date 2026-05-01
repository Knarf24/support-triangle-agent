import { Link, useLocation } from "wouter";
import { Activity, History, LayoutDashboard, Ticket } from "lucide-react";

const navItems = [
  { href: "/", label: "Triage", icon: Ticket },
  { href: "/history", label: "History", icon: History },
  { href: "/stats", label: "Stats", icon: Activity },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <LayoutDashboard className="h-6 w-6" />
            <span className="font-bold text-lg tracking-tight">Triage Ops</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-mono">SYSTEM ACTIVE</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border mt-auto">
          <div className="text-xs font-mono text-muted-foreground flex items-center justify-between">
            <span>STATUS</span>
            <span className="text-green-500 font-bold">ONLINE</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}
