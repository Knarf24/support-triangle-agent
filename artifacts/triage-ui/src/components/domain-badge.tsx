import { Badge } from "@/components/ui/badge";
import { HelpCircle, Terminal, CreditCard, BrainCircuit } from "lucide-react";

export type Domain = "hackerrank" | "claude" | "visa" | "unknown";

interface DomainBadgeProps {
  domain: string;
  confidence?: number;
  className?: string;
}

function ConfidencePip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : pct >= 50
      ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
      : "text-red-400 border-red-500/40 bg-red-500/10";

  const barFill =
    pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400";

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 border ${color} ml-1.5`}
      title={`Domain confidence: ${pct}%`}
    >
      <span className="relative w-12 h-1.5 bg-current/10 rounded-none overflow-hidden shrink-0">
        <span
          className={`absolute left-0 top-0 h-full ${barFill} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}%
    </span>
  );
}

export function DomainBadge({ domain, confidence, className }: DomainBadgeProps) {
  const d = (domain || "unknown").toLowerCase() as Domain;

  const config = {
    hackerrank: {
      color: "bg-[#00EA64]/20 text-[#00EA64] border-[#00EA64]/30",
      icon: Terminal,
      label: "HackerRank"
    },
    claude: {
      color: "bg-[#D97757]/20 text-[#D97757] border-[#D97757]/30",
      icon: BrainCircuit,
      label: "Claude"
    },
    visa: {
      color: "bg-[#1A1F71]/30 text-[#4D65FF] border-[#4D65FF]/40",
      icon: CreditCard,
      label: "Visa"
    },
    unknown: {
      color: "bg-muted text-muted-foreground border-border",
      icon: HelpCircle,
      label: "Unknown"
    }
  };

  const { color, icon: Icon, label } = config[d] || config.unknown;

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Badge variant="outline" className={`font-mono font-semibold rounded-none ${color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
      {confidence !== undefined && <ConfidencePip value={confidence} />}
    </span>
  );
}
