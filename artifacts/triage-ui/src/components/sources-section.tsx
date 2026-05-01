import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Maximize2, Minimize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SourcesSectionProps {
  docs: string[];
}

const TRUNCATE_LENGTH = 160;

function SourceDoc({ doc, index }: { doc: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isTruncatable = doc.length > TRUNCATE_LENGTH;
  const displayText = expanded || !isTruncatable ? doc : doc.slice(0, TRUNCATE_LENGTH) + "…";

  return (
    <div className="border border-border bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <Badge variant="outline" className="rounded-none font-mono text-[10px] shrink-0 border-primary/30 text-primary">
            DOC {String(index + 1).padStart(2, "0")}
          </Badge>
        </div>
        {isTruncatable && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? "Collapse source" : "Expand source"}
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        )}
      </div>
      <p className="text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
        {displayText}
      </p>
      {isTruncatable && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? "SHOW LESS" : "SHOW MORE"}
        </button>
      )}
    </div>
  );
}

export function SourcesSection({ docs }: SourcesSectionProps) {
  const [open, setOpen] = useState(false);

  if (!docs || docs.length === 0) return null;

  return (
    <div className="border border-border/60 bg-muted/10" data-testid="sources-section">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground tracking-wider">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          SOURCES
          <Badge variant="outline" className="rounded-none font-mono text-[10px] border-border ml-1">
            {docs.length}
          </Badge>
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {open ? "COLLAPSE" : "EXPAND"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/60">
          <p className="text-[10px] font-mono text-muted-foreground/60 pt-3 pb-1 tracking-wider">
            KB DOCUMENTS CONSULTED FOR THIS RESPONSE
          </p>
          {docs.map((doc, i) => (
            <SourceDoc key={i} doc={doc} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
