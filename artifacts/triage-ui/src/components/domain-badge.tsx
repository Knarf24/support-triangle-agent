import { Badge } from "@/components/ui/badge";
import { HelpCircle, Terminal, CreditCard, BrainCircuit } from "lucide-react";
import { useState, useEffect } from "react";

export type Domain = "hackerrank" | "claude" | "visa" | "unknown";

interface DomainBadgeProps {
  domain: string;
  confidence?: number;
  className?: string;
}

function ConfidencePip({ value }: { value: number }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  
  useEffect(() => {
    // Small delay to ensure the element is painted before animating
    const timer = setTimeout(() => {
      setAnimatedValue(Math.round(value * 100));
    }, 50);
    return () => clearTimeout(timer);
  }, [value]);

  const pct = Math.round(value * 100);
  const color =
    pct >= 75
      ? "text-success border-success/40 bg-success/10 shadow-[0_0_10px_rgba(0,255,136,0.15)]"
      : pct >= 50
      ? "text-amber-400 border-amber-400/40 bg-amber-400/10 shadow-[0_0_10px_rgba(251,191,36,0.15)]"
      : "text-destructive border-destructive/40 bg-destructive/10 shadow-[0_0_10px_rgba(255,68,68,0.15)]";

  const barFill =
    pct >= 75 ? "bg-success shadow-[0_0_8px_rgba(0,255,136,0.8)]" : pct >= 50 ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "bg-destructive shadow-[0_0_8px_rgba(255,68,68,0.8)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-bold px-1.5 py-0.5 border ${color} ml-1.5 backdrop-blur-sm transition-colors`}
      title={`Domain confidence: ${pct}%`}
    >
      <span className="relative w-12 h-1.5 bg-black/40 border border-white/5 rounded-full overflow-hidden shrink-0">
        <span
          className={`absolute left-0 top-0 h-full ${barFill} transition-all duration-1000 ease-out`}
          style={{ width: `${animatedValue}%` }}
        />
      </span>
      {animatedValue}%
    </span>
  );
}

export function DomainBadge({ domain, confidence, className }: DomainBadgeProps) {
  const d = (domain || "unknown").toLowerCase() as Domain;

  const config = {
    hackerrank: {
      color: "bg-[#00EA64]/10 text-[#00EA64] border-[#00EA64]/30 shadow-[0_0_10px_rgba(0,234,100,0.1)]",
      icon: Terminal,
      label: "HackerRank"
    },
    claude: {
      color: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/30 shadow-[0_0_10px_rgba(217,119,87,0.1)]",
      icon: BrainCircuit,
      label: "Claude"
    },
    visa: {
      color: "bg-primary/10 text-primary border-primary/30 shadow-[0_0_10px_rgba(0,212,255,0.15)]",
      icon: CreditCard,
      label: "Visa"
    },
    unknown: {
      color: "bg-white/5 text-muted-foreground border-white/10",
      icon: HelpCircle,
      label: "Unknown"
    }
  };

  const { color, icon: Icon, label } = config[d] || config.unknown;

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Badge variant="outline" className={`font-mono font-bold tracking-wider rounded-md backdrop-blur-sm ${color}`}>
        <Icon className="w-3 h-3 mr-1.5 opacity-80" />
        {label}
      </Badge>
      {confidence !== undefined && <ConfidencePip value={confidence} />}
    </span>
  );
}