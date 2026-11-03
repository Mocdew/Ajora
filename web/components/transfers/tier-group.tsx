import {
  CaretDown,
} from "@phosphor-icons/react/dist/ssr";
import type {
  MatchedTransfer,
} from "@/lib/api/engine-types";
import { TransferPairCard } from "@/components/transfers/transfer-pair-card";

type Tier = MatchedTransfer["tier"];

const tierMeta: Record<Tier, { title: string; description: string }> = {
  high: {
    title: "High confidence",
    description: "Strong matches, removed automatically. You can still correct them.",
  },
  medium: {
    title: "Medium confidence",
    description: "Left in your totals until you confirm them.",
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
  onCorrection,
  pendingId,
}: {
  tier: Tier;
  matches: MatchedTransfer[];
  defaultOpen?: boolean;
  pendingId?: string;
  onCorrection: (matchId: string, verdict: "confirm" | "reject") => void;
}) {
  if (matches.length === 0) return null;
  const meta = tierMeta[tier];

  return (
    <details className="group" open={defaultOpen}>
      <summary className="card-soft flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-300 hover:bg-secondary [&::-webkit-details-marker]:hidden">
        <CaretDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-500 group-open:rotate-180"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            {meta.title}
          </h2>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <span className="badge-neutral tabular-nums">
          {matches.length}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {matches.map((match) => (
          <TransferPairCard
            key={match.match_id}
            match={match}
            pending={pendingId === match.match_id}
            disabled={Boolean(pendingId)}
            onCorrection={verdict => onCorrection(match.match_id, verdict)}
          />
        ))}
      </div>
    </details>
  );
}
