import { expect, test, type Page } from "@playwright/test";
import type cytoscape from "cytoscape";
import type {
  CommunalInsight,
  GraphResponse,
  InsightsResponse,
  TransactionsResponse,
} from "../lib/api/engine-types";
import type { ExplanationsResponse } from "../lib/api/explanations";

const user = { user_id: "u_persona_a", full_name: "Graph Test Account" };

function insight(
  counterparty: string,
  relationship_type: CommunalInsight["relationship_type"],
  total_out_ngn: number,
  total_in_ngn: number,
): CommunalInsight {
  return {
    counterparty, relationship_type, total_out_ngn, total_in_ngn,
    net_position_ngn: total_out_ngn - total_in_ngn,
    confidence: 0.9, tier: "high", count: 2, cadence: "monthly",
    first_seen: "2026-06-01", last_seen: "2026-07-01", months_active: 2,
    pct_of_net_income: 10, member_transaction_ids: [], tags: [], reasons: [],
  };
}

const relationships = [
  insight("TEST CONTACT", "dependent", 20_000, 0),
  insight("TEST CONTACT", "informal_lending", 50_000, 20_000),
  insight("OVERSEAS FAMILY", "remittance", 0, 80_000),
];

const graph: GraphResponse = {
  ...user,
  nodes: [
    {
      id: "__user__", label: user.full_name, kind: "user", net_position_ngn: 0,
      total_out_ngn: 0, total_in_ngn: 0, count: 0, pct_of_net_income: 0,
    },
    ...relationships.map((item) => ({
      id: `counterparty:${item.relationship_type}:${item.counterparty}`,
      label: item.counterparty, kind: "counterparty", relationship_type: item.relationship_type,
      tier: item.tier, net_position_ngn: item.net_position_ngn,
      total_out_ngn: item.total_out_ngn, total_in_ngn: item.total_in_ngn,
      count: item.count, cadence: item.cadence, pct_of_net_income: item.pct_of_net_income,
    })),
  ],
  edges: relationships.map((item) => {
    const id = `counterparty:${item.relationship_type}:${item.counterparty}`;
    return {
      id: `relationship:${item.relationship_type}:${item.counterparty}`,
      source: item.net_position_ngn >= 0 ? "__user__" : id,
      target: item.net_position_ngn >= 0 ? id : "__user__",
      relationship_type: item.relationship_type, label: item.relationship_type,
      net_ngn: Math.abs(item.net_position_ngn),
      total_ngn: item.total_out_ngn + item.total_in_ngn, count: item.count,
    };
  }),
};

async function mockRelationships(page: Page) {
  const insights: InsightsResponse = {
    ...user, insights: { net_income_ngn: 200_000, insights: relationships },
  };
  const transactions: TransactionsResponse = { ...user, count: 0, transactions: [] };
  const explanations: ExplanationsResponse = {
    userId: user.user_id, userName: user.full_name, generatedBy: "stub-offline", explanations: {},
  };
  await page.route("**/api/engine/health", (route) => route.fulfill({
    json: { status: "ok", users: [user.user_id] },
  }));
  for (const [path, json] of Object.entries({ graph, insights, transactions, explanations })) {
    await page.route(`**/api/engine/users/${user.user_id}/${path}`, (route) => route.fulfill({ json }));
  }
}

test("the same person can be inspected separately for support and informal lending", async ({ page }) => {
  await mockRelationships(page);
  await page.goto("/communal");
  const inspector = page.getByRole("complementary", { name: "Relationship details", exact: true });
  await inspector.getByRole("button", { name: "Test Contact Dependents · black tax", exact: true }).click();
  await expect(inspector.getByRole("heading", { name: "Test Contact", exact: true })).toBeVisible();
  await expect(inspector.getByText("Dependents · black tax", { exact: true })).toBeVisible();
  await expect(inspector.getByText("₦20,000", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Still owed to you", { exact: true })).toHaveCount(0);

  await inspector.getByRole("button", { name: "Close details", exact: true }).click();
  await inspector.getByRole("button", { name: "Test Contact Informal lending", exact: true }).click();
  await expect(inspector.getByRole("heading", { name: "Test Contact", exact: true })).toBeVisible();
  await expect(inspector.getByText("Informal lending", { exact: true })).toBeVisible();
  await expect(inspector.locator("dt").filter({ hasText: "Still owed to you" }).locator("..").locator("dd"))
    .toHaveText("₦30,000");
});

test("the rendered remittance arrow points from the sender toward the user", async ({ page }) => {
  await mockRelationships(page);
  await page.goto("/communal");
  const canvas = page.getByRole("img", { name: /^Interactive relationship graph;/ });
  await expect(canvas).toBeVisible();
  // Read the actual Cytoscape instance backing the canvas, including its arrow style.
  await expect.poll(() => canvas.evaluate((element) => {
    const cy = (element as HTMLElement & { _cyreg?: { cy?: cytoscape.Core } })._cyreg?.cy;
    const edge = cy?.getElementById("relationship:remittance:OVERSEAS FAMILY");
    return edge?.nonempty() ? {
      source: edge.source().id(), target: edge.target().id(),
      arrow: edge.style("target-arrow-shape"),
    } : null;
  })).toEqual({
    source: "counterparty:remittance:OVERSEAS FAMILY", target: "__user__", arrow: "triangle",
  });
});
