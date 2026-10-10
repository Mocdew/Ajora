"use client";

import * as React from "react";
import type cytoscape from "cytoscape";
import { cn } from "@/lib/utils";
import { useCommunal } from "@/lib/api/communal";
import type { CommunalGraph } from "@/lib/api/stub/communal";

/**
 * Relationship graph — Cytoscape.js, mounted by hand (useRef + useEffect) rather
 * than through a React wrapper, so there's no wrapper version to chase and the
 * whole thing stays a client-only concern. Cytoscape is dynamically imported
 * inside the effect, so it never runs during SSR.
 *
 * ── Visual encoding (validated with the dataviz skill) ──────────────────────
 * Cytoscape styles are plain JS, so the brand tokens are mirrored here as hex,
 * per theme (the CSS vars aren't readable from inside the canvas). A node-link
 * graph is an "all-pairs" form — any two nodes can sit side by side — which caps
 * categorical color at 3 hues per the skill. So color carries the 2-way money
 * DIRECTION (+ the user), and ROLE rides on node SHAPE + an always-on name label
 * + the legend. Identity is never color-alone; edge arrows + edge colors
 * reinforce direction. The two direction hues (teal #2FA58C in, amber #E5A23B /
 * #C27E1E out) pass the validator's CVD, normal-vision and (dark) contrast gates
 * in both modes; the light contrast WARN is relieved by the permanent labels.
 */

type Theme = "light" | "dark";

interface Palette {
  self: string;
  in: string;
  out: string;
  ink: string;
  edgeLabelBg: string;
  border: string;
}

const PALETTES: Record<Theme, Palette> = {
  light: {
    self: "#0E3A2E", // --primary, deep forest green (hero)
    in: "#2FA58C", // --teal / --chart-true — money in / owed to you
    out: "#E5A23B", // --gold / --chart-inflated — money out
    ink: "#0D2B22", // --foreground
    edgeLabelBg: "#FFFFFF", // --card
    border: "#E1DDD1", // --border
  },
  dark: {
    self: "#3FA87F", // brighter green on the dark card so the hub reads
    in: "#2FA58C", // teal holds its step in dark (validated)
    out: "#C27E1E", // amber steps down into the dark lightness band (validated)
    ink: "#F2EFE6", // --foreground (dark)
    edgeLabelBg: "#123A2E", // --card (dark)
    border: "#1E4A3C",
  },
};

/** Node shape per role — the secondary (non-color) identity channel.
 * `as const` keeps these as literal NodeShape values for the Cytoscape style. */
const SHAPE = {
  self: "ellipse",
  thrift: "round-rectangle",
  dependent: "ellipse",
  lending: "diamond",
  remittance: "hexagon",
} as const;

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function buildElements(graph: CommunalGraph): cytoscape.ElementDefinition[] {
  const nodes: cytoscape.ElementDefinition[] = graph.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      type: n.type,
      direction: n.direction,
      amount: n.amount ?? 0,
    },
  }));
  const edges: cytoscape.ElementDefinition[] = graph.edges.map((e) => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? "",
      direction: e.direction,
      amount: e.amount,
    },
  }));
  return [...nodes, ...edges];
}

function buildStylesheet(p: Palette): cytoscape.StylesheetJson {
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
        "border-color": p.edgeLabelBg, // surface ring so overlapping marks separate
        "transition-property": "border-width, border-color",
        "transition-duration": 120,
      },
    },
    // Size by monthly volume (counterparties only — self is fixed below).
    {
      selector: "node[amount > 0]",
      style: {
        width: "mapData(amount, 30000, 80000, 44, 66)",
        height: "mapData(amount, 30000, 80000, 44, 66)",
      },
    },
    // Color by money direction.
    { selector: 'node[direction = "in"]', style: { "background-color": p.in } },
    { selector: 'node[direction = "out"]', style: { "background-color": p.out } },
    {
      selector: 'node[direction = "self"]',
      style: {
        "background-color": p.self,
        color: p.self, // the hub's own label leans on its hue, below the node
        width: 74,
        height: 74,
        "font-size": 14,
        "border-width": 0,
      },
    },
    // Shape by role.
    { selector: 'node[type = "thrift"]', style: { shape: SHAPE.thrift } },
    { selector: 'node[type = "dependent"]', style: { shape: SHAPE.dependent } },
    { selector: 'node[type = "lending"]', style: { shape: SHAPE.lending } },
    { selector: 'node[type = "remittance"]', style: { shape: SHAPE.remittance } },
    { selector: 'node[type = "self"]', style: { shape: SHAPE.self } },
    // Hover emphasis.
    {
      selector: "node.hl",
      style: { "border-width": 3, "border-color": p.ink },
    },
    // Edges — directional, colored + arrowed by money direction.
    {
      selector: "edge",
      style: {
        width: "mapData(amount, 30000, 80000, 2, 5)",
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
      selector: "edge.hl",
      style: { opacity: 1, width: "mapData(amount, 30000, 80000, 3, 6)" },
    },
  ];
}

const LAYOUT: cytoscape.ConcentricLayoutOptions = {
  name: "concentric",
  // Self at the dead center, every counterparty on the ring around it.
  concentric: (node) => (node.data("type") === "self" ? 2 : 1),
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
            <ShapeGlyph shape="round-rect" /> Thrift group
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="circle" /> Dependent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="diamond" /> Lender (owes you)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShapeGlyph shape="hex" /> Remittance
          </span>
        </div>
      </div>
    </div>
  );
}

export function RelationshipGraph() {
  const { data, isLoading, isError } = useCommunal();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);
  // Re-render the graph when the <html> `dark` class flips.
  const [theme, setTheme] = React.useState<Theme>("light");

  // Track the active theme via the same `.dark` class the theme toggle sets.
  React.useEffect(() => {
    setTheme(readTheme());
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // Mount / rebuild the Cytoscape instance. Rebuilt on data or theme change.
  React.useEffect(() => {
    if (!data || !containerRef.current) return;
    let disposed = false;
    let cy: cytoscape.Core | null = null;

    (async () => {
      const cytoscapeLib = (await import("cytoscape")).default;
      if (disposed || !containerRef.current) return;

      const palette = PALETTES[theme];
      cy = cytoscapeLib({
        container: containerRef.current,
        elements: buildElements(data.graph),
        style: buildStylesheet(palette),
        layout: LAYOUT,
        minZoom: 0.4,
        maxZoom: 2.5,
        wheelSensitivity: 0.2,
        autoungrabify: false, // nodes stay draggable
      });
      cyRef.current = cy;

      // Hover: lift the node and its incident edges.
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
  }, [data, theme]);

  if (isError) {
    return (
      <p className="flex h-[460px] items-center justify-center text-sm text-negative">
        Couldn&apos;t load the relationship graph.
      </p>
    );
  }
  if (isLoading || !data) return <GraphSkeleton />;

  const summary = data.graph.nodes
    .filter((n) => n.type !== "self")
    .map((n) => n.label)
    .join(", ");

  return (
    <figure className="m-0 flex flex-col gap-4">
      <figcaption className="sr-only">
        Relationship graph of your communal money flows. You are at the center,
        connected to {summary}. Teal nodes and arrows are money coming in or owed
        to you; amber are money going out. Node shape encodes the relationship
        type; node size scales with the monthly amount. Figures are listed in the
        insight cards above.
      </figcaption>

      <div
        ref={containerRef}
        role="img"
        aria-label="Interactive relationship graph; a text summary and the figures are in the insight cards above and the legend below."
        className={cn(
          "h-[460px] w-full rounded-md border border-border bg-muted/20",
          "touch-none", // let Cytoscape own gestures inside the canvas
        )}
      />

      <Legend />
    </figure>
  );
}
