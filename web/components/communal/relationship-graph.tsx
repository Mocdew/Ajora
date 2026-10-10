"use client";

import * as React from "react";
import type cytoscape from "cytoscape";
import { Users } from "lucide-react";
import { cn, formatNaira } from "@/lib/utils";
import { useRelationshipGraph } from "@/lib/api/communal";
import { usePersona } from "@/components/persona-context";
import { QueryError } from "@/components/query-error";
import { Card } from "@/components/ui/card";
import { prettyName, type Flow } from "@/lib/communal-insights";
import type { GraphResponse, GraphNode } from "@/lib/api/engine-types";

/**
 * Relationship graph — Cytoscape.js, mounted by hand (useRef + useEffect) so there's
 * no React-wrapper version to chase; Cytoscape is dynamically imported inside the
 * effect so it never runs during SSR.
 *
 * ── Visual encoding (validated with the dataviz skill) ──────────────────────
 * A node-link graph is an "all-pairs" form (any two nodes can sit side by side), so
 * categorical color is capped at 3 saturated hues. Color therefore carries money
 * DIRECTION (teal = in/owed-to-you, amber = out) plus the green user hub, with a
 * neutral gray for balanced (ajo, net ≈ 0) ties — a diverging-style neutral midpoint,
 * not a 4th category. ROLE rides on node SHAPE + an always-on name label + the legend,
 * so identity is never color-alone. The direction pair passes the validator's CVD,
 * normal-vision and contrast gates in both modes (light amber's sub-3:1 is relieved by
 * the permanent labels + legend + the insight-card figures above).
 */

type Theme = "light" | "dark";

interface Palette {
  self: string;
  in: string;
  out: string;
  neutral: string;
  ink: string;
  edgeLabelBg: string;
  border: string;
}

const PALETTES: Record<Theme, Palette> = {
  light: {
    self: "#0E3A2E", // --primary, deep forest green (hero hub)
    in: "#2FA58C", // --teal / --chart-true — money in / owed to you
    out: "#E5A23B", // --gold / --chart-inflated — money out
    neutral: "#8A948C", // green-gray — balanced two-way (ajo)
    ink: "#0D2B22", // --foreground
    edgeLabelBg: "#FFFFFF", // --card
    border: "#E1DDD1", // --border
  },
  dark: {
    self: "#3FA87F",
    in: "#2FA58C",
    out: "#C27E1E",
    neutral: "#7E8C86",
    ink: "#F2EFE6",
    edgeLabelBg: "#123A2E",
    border: "#1E4A3C",
  },
};

/** Node shape per relationship role — the secondary (non-color) identity channel. */
const SHAPE = {
  user: "ellipse",
  ajo_esusu: "round-rectangle",
  dependent: "ellipse",
  informal_lending: "diamond",
  remittance: "hexagon",
} as const;

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Money flow relative to the user for a counterparty node. Mirrors insightFlow. */
function nodeFlow(n: GraphNode): Flow {
  switch (n.relationship_type) {
    case "dependent":
      return "out";
    case "ajo_esusu":
      return Math.abs(n.net_position_ngn) < 1 ? "neutral" : n.net_position_ngn > 0 ? "out" : "in";
    case "informal_lending":
      return n.net_position_ngn >= 0 ? "in" : "out";
    case "remittance":
      return n.total_in_ngn >= n.total_out_ngn ? "in" : "out";
    default:
      return "neutral";
  }
}

/** Gross volume on a tie — drives node size + edge width. */
function nodeVolume(n: GraphNode): number {
  return Math.max(n.total_out_ngn, n.total_in_ngn, Math.abs(n.net_position_ngn));
}

const compact: Intl.NumberFormatOptions = {
  notation: "compact",
  maximumFractionDigits: 1,
};

/** Short, money-first edge label. */
function edgeLabel(n: GraphNode): string {
  const flow = nodeFlow(n);
  switch (n.relationship_type) {
    case "informal_lending":
      return flow === "in"
        ? `owes ${formatNaira(n.net_position_ngn, compact)}`
        : `you owe ${formatNaira(Math.abs(n.net_position_ngn), compact)}`;
    case "ajo_esusu":
      return `${formatNaira(n.total_out_ngn, compact)} ⇄`;
    case "remittance":
      return flow === "in"
        ? `${formatNaira(n.total_in_ngn, compact)} in`
        : `${formatNaira(n.total_out_ngn, compact)} out`;
    case "dependent":
    default:
      return `${formatNaira(n.total_out_ngn, compact)} out`;
  }
}

interface Built {
  elements: cytoscape.ElementDefinition[];
  volMin: number;
  volMax: number;
}

function buildElements(graph: GraphResponse): Built {
  const counterparties = graph.nodes.filter((n) => n.kind !== "user");
  const vols = counterparties.map(nodeVolume).filter((v) => v > 0);
  const volMin = vols.length ? Math.min(...vols) : 0;
  const volMax = vols.length ? Math.max(...vols) : 1;

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const nodes: cytoscape.ElementDefinition[] = graph.nodes.map((n) => {
    const isUser = n.kind === "user";
    return {
      data: {
        id: n.id,
        label: isUser ? n.label : prettyName(n.label),
        role: isUser ? "user" : n.relationship_type ?? "dependent",
        direction: isUser ? "self" : nodeFlow(n),
        volume: isUser ? 0 : nodeVolume(n),
      },
    };
  });

  const edges: cytoscape.ElementDefinition[] = graph.edges.map((e) => {
    // The engine emits source = __user__. For flows that arrive at the user
    // (money owed/received), flip so the arrow points back at the hub.
    const other = byId.get(e.target === "__user__" ? e.source : e.target);
    const flow = other ? nodeFlow(other) : "neutral";
    const pointsAtUser = flow === "in";
    return {
      data: {
        id: e.id,
        source: pointsAtUser ? e.target : e.source,
        target: pointsAtUser ? e.source : e.target,
        label: other ? edgeLabel(other) : e.label,
        direction: flow,
        volume: other ? nodeVolume(other) : e.total_ngn,
      },
    };
  });

  return { elements: [...nodes, ...edges], volMin, volMax };
}

function buildStylesheet(p: Palette, volMin: number, volMax: number): cytoscape.StylesheetJson {
  // Guard the mapData domain so a single-tie (or equal-volume) graph still sizes.
  const lo = volMin;
  const hi = volMax > volMin ? volMax : volMin + 1;
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "font-size": 12,
        "font-weight": 600,
        color: p.ink,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 7,
        "text-wrap": "wrap",
        "text-max-width": "96px",
        "border-width": 2,
        "border-color": p.edgeLabelBg,
        "transition-property": "border-width, border-color",
        "transition-duration": 120,
      },
    },
    {
      selector: "node[volume > 0]",
      style: {
        width: `mapData(volume, ${lo}, ${hi}, 44, 66)`,
        height: `mapData(volume, ${lo}, ${hi}, 44, 66)`,
      },
    },
    // Color by money direction.
    { selector: 'node[direction = "in"]', style: { "background-color": p.in } },
    { selector: 'node[direction = "out"]', style: { "background-color": p.out } },
    { selector: 'node[direction = "neutral"]', style: { "background-color": p.neutral } },
    {
      selector: 'node[direction = "self"]',
      style: {
        "background-color": p.self,
        color: p.self,
        width: 74,
        height: 74,
        "font-size": 14,
        "border-width": 0,
      },
    },
    // Shape by role.
    { selector: 'node[role = "ajo_esusu"]', style: { shape: SHAPE.ajo_esusu } },
    { selector: 'node[role = "dependent"]', style: { shape: SHAPE.dependent } },
    { selector: 'node[role = "informal_lending"]', style: { shape: SHAPE.informal_lending } },
    { selector: 'node[role = "remittance"]', style: { shape: SHAPE.remittance } },
    { selector: 'node[role = "user"]', style: { shape: SHAPE.user } },
    // Hover emphasis.
    { selector: "node.hl", style: { "border-width": 3, "border-color": p.ink } },
    // Edges — directional, colored + arrowed by money direction.
    {
      selector: "edge",
      style: {
        width: `mapData(volume, ${lo}, ${hi}, 2, 5)`,
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.1,
        label: "data(label)",
        "font-size": 10,
        "font-weight": 600,
        color: p.ink,
        "text-background-color": p.edgeLabelBg,
        "text-background-opacity": 0.92,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-rotation": "autorotate",
        opacity: 0.95,
      },
    },
    {
      selector: 'edge[direction = "in"]',
      style: { "line-color": p.in, "target-arrow-color": p.in },
    },
    {
      selector: 'edge[direction = "out"]',
      style: { "line-color": p.out, "target-arrow-color": p.out },
    },
    {
      // Balanced ties read as two-way: arrows at both ends, neutral gray.
      selector: 'edge[direction = "neutral"]',
      style: {
        "line-color": p.neutral,
        "target-arrow-color": p.neutral,
        "source-arrow-color": p.neutral,
        "source-arrow-shape": "triangle",
      },
    },
    {
      selector: "edge.hl",
      style: { opacity: 1, width: `mapData(volume, ${lo}, ${hi}, 3, 6)` },
    },
  ];
}

const LAYOUT: cytoscape.ConcentricLayoutOptions = {
  name: "concentric",
  concentric: (node) => (node.data("direction") === "self" ? 2 : 1),
  levelWidth: () => 1,
  minNodeSpacing: 46,
  padding: 28,
  animate: false,
  startAngle: (3 / 2) * Math.PI,
};

function GraphSkeleton() {
  return <div className="h-[460px] w-full animate-pulse rounded-md bg-muted/50" />;
}

/* ── Legend — the dependable identity channels (never color-alone) ─────────── */

function ShapeGlyph({ shape }: { shape: "round-rect" | "circle" | "diamond" | "hex" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    className: "text-muted-foreground",
    "aria-hidden": true,
  } as const;
  const fill = "none";
  const stroke = "currentColor";
  const sw = 1.5;
  switch (shape) {
    case "round-rect":
      return (
        <svg {...common}>
          <rect x="1.5" y="3.5" width="13" height="9" rx="2.5" fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case "hex":
      return (
        <svg {...common}>
          <path d="M8 1.5 14 5v6l-6 3.5L2 11V5Z" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
  }
}

function Legend() {
  return (
    <div className="flex flex-col gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Money direction · fill &amp; arrow
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(var(--teal))" }} aria-hidden />
            Money in / owed to you
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(var(--gold))" }} aria-hidden />
            Money out
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#8A948C" }} aria-hidden />
            Balanced (two-way)
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} aria-hidden />
            You
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Role · node shape
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="round-rect" /> Ajo / esusu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="circle" /> Dependent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="diamond" /> Informal lending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="hex" /> Remittance
          </span>
        </div>
      </div>
    </div>
  );
}

/** Empty state for a persona with only the user node (no communal ties). */
function EmptyGraph() {
  return (
    <Card className="flex h-[460px] flex-col items-center justify-center gap-3 border-dashed bg-muted/10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          No relationships to graph yet
        </p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          This persona has no communal counterparties for the period — just them.
          Switch personas to explore a richer relationship web.
        </p>
      </div>
    </Card>
  );
}

export function RelationshipGraph() {
  const { userId } = usePersona();
  const { data, isLoading, isError, error, refetch } =
    useRelationshipGraph(userId);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);
  const [theme, setTheme] = React.useState<Theme>("light");

  const hasCounterparties = Boolean(
    data && data.nodes.some((n) => n.kind !== "user"),
  );

  React.useEffect(() => {
    setTheme(readTheme());
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    if (!data || !hasCounterparties || !containerRef.current) return;
    let disposed = false;
    let cy: cytoscape.Core | null = null;

    (async () => {
      const cytoscapeLib = (await import("cytoscape")).default;
      if (disposed || !containerRef.current) return;

      const palette = PALETTES[theme];
      const { elements, volMin, volMax } = buildElements(data);
      cy = cytoscapeLib({
        container: containerRef.current,
        elements,
        style: buildStylesheet(palette, volMin, volMax),
        layout: LAYOUT,
        minZoom: 0.4,
        maxZoom: 2.5,
        wheelSensitivity: 0.2,
        autoungrabify: false,
      });
      cyRef.current = cy;

      cy.on("mouseover", "node", (evt: cytoscape.EventObject) => {
        const n = evt.target;
        n.addClass("hl");
        n.connectedEdges().addClass("hl");
      });
      cy.on("mouseout", "node", (evt: cytoscape.EventObject) => {
        const n = evt.target;
        n.removeClass("hl");
        n.connectedEdges().removeClass("hl");
      });

      cy.fit(undefined, 36);
    })();

    return () => {
      disposed = true;
      if (cy) cy.destroy();
      cyRef.current = null;
    };
  }, [data, hasCounterparties, theme]);

  if (isError) {
    return <QueryError error={error} onRetry={() => refetch()} />;
  }
  if (isLoading || !data) return <GraphSkeleton />;
  if (!hasCounterparties) return <EmptyGraph />;

  const summary = data.nodes
    .filter((n) => n.kind !== "user")
    .map((n) => prettyName(n.label))
    .join(", ");

  return (
    <figure className="m-0 flex flex-col gap-4">
      <figcaption className="sr-only">
        Relationship graph of your communal money flows. You are at the center,
        connected to {summary}. Teal nodes and arrows are money coming in or owed
        to you; amber are money going out; gray are balanced two-way ties. Node
        shape encodes the relationship type; node size scales with the amount.
        Figures are listed in the insight cards above.
      </figcaption>

      <div
        ref={containerRef}
        role="img"
        aria-label="Interactive relationship graph; a text summary and the figures are in the insight cards above and the legend below."
        className={cn(
          "h-[460px] w-full rounded-md border border-border bg-muted/20",
          "touch-none",
        )}
      />

      <Legend />
    </figure>
  );
}
