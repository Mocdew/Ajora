import { ChevronDown } from "lucide-react";
import type {
  CorrectionVerdict,
  MatchedTransfer,
} from "@/lib/api/engine-types";
import { TransferPairCard } from "@/components/transfers/transfer-pair-card";

type Tier = MatchedTransfer["tier"];

const tierMeta: Record<Tier, { title: string; description: string }> = {
  high: {
    title: "High confidence",
    description: "Strong matches removed automatically — still open to your correction.",
  },
  medium: {
    title: "Medium confidence",
    description: "Likely self-transfers ready for your review.",
  },
  low: {
    title: "Low confidence",
    description: "Borderline matches returned by the engine for transparency.",
  },
};

export function TierGroup({
  tier,
  matches,
  defaultOpen = false,
  verdicts = {},
  pendingByMatchId = {},
  errorsByMatchId = {},
  onCorrection,
}: {
  tier: Tier;
  matches: MatchedTransfer[];
  defaultOpen?: boolean;
  verdicts?: Record<string, CorrectionVerdict>;
  pendingByMatchId?: Record<string, boolean>;
  errorsByMatchId?: Record<string, string>;
  onCorrection?: (matchId: string, verdict: CorrectionVerdict) => void;
}) {
  if (matches.length === 0) return null;
  const meta = tierMeta[tier];

  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-foreground">
            {meta.title}
          </h2>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold tabular-nums text-secondary-foreground">
          {matches.length}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {matches.map((match) => (
          <TransferPairCard
            key={match.match_id}
            match={match}
            verdict={verdicts[match.match_id]}
            pending={pendingByMatchId[match.match_id]}
            error={errorsByMatchId[match.match_id]}
            onCorrection={
              onCorrection
                ? (verdict) => onCorrection(match.match_id, verdict)
                : undefined
            }
          />
        ))}
      </div>
    </details>
  );
}
