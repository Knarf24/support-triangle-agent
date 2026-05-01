import { Badge } from "@/components/ui/badge";
import { HelpCircle, Terminal, CreditCard, BrainCircuit } from "lucide-react";

export type Domain = "hackerrank" | "claude" | "visa" | "unknown";

interface DomainBadgeProps {
  domain: string;
  confidence?: number;
  className?: string;
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
    <Badge variant="outline" className={`font-mono font-semibold rounded-none ${color} ${className}`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
      {confidence !== undefined && (
        <span className="ml-2 opacity-75">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </Badge>
  );
}
