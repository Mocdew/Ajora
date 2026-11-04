import { expect, test, type Page } from "@playwright/test";
import type { CashflowResponse } from "../lib/api/engine-types";
import type { ExplanationsResponse } from "../lib/api/explanations";

const user = "u_persona_b";
const api = `/api/engine/users/${user}`;
const account = "domv-b04";

async function go(page: Page, route: string) {
  const legacyRoute = route === "dashboard" ? "insights" : route === "settings" ? "connections" : route;
  await page.goto(`/${legacyRoute}`);
}

test("Emeka can reconcile a transfer, revoke a bank and verify what changed", async ({ page, request }, testInfo) => {
  // This scenario writes fixture consent, verdicts and audit events. Run it
  // against a dedicated engine with AJORA_STATE_DIR pointing at a temp directory.
  const read = async <T,>(path: string) => {
    const response = await request.get(`${api}/${path}`);
    expect(response.ok()).toBeTruthy();
    return await response.json() as T;
  };
  const explain = () => read<ExplanationsResponse>("explanations");
  const cashflow = () => read<CashflowResponse>("cashflow");
  await page.goto("/insights");
  await page.getByRole("combobox", { name: "Select persona" }).selectOption(user);
  await expect(page.getByText("Emeka Balogun", { exact: true })).toBeVisible();

  const baseline = await cashflow();
  const full = await explain();
  await expect(page.getByText(full.explanations.dedup.narration, { exact: true })).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Remove phantom self-transfers" });
  await toggle.click();
  await expect(page.getByText("Showing raw, double-counted view")).toBeVisible();
  await toggle.click();
  await expect(page.getByText("Showing true cashflow")).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("dashboard.png") });
  await go(page, "transfers");
  const pair = page.getByRole("article").first();
  await pair.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("button", { name: "Reject match", exact: true }).click();
  await expect(pair.getByText("Match rejected")).toBeVisible();
  expect((await cashflow()).before_after.matched_transfer_count).toBe(baseline.before_after.matched_transfer_count - 1);
  await page.reload();
  await expect(pair.getByText("Match rejected")).toBeVisible();
  await go(page, "dashboard");
  await expect(page.getByText((await explain()).explanations.dedup.narration, { exact: true })).toBeVisible();
  await go(page, "transfers");
  await pair.getByRole("button", { name: "Confirm match" }).click();
  await expect(pair.getByText("Match confirmed")).toBeVisible();
  expect((await cashflow()).before_after).toEqual(baseline.before_after);

  await go(page, "communal");
  const remittance = Object.entries(full.explanations).find(([key]) => key.startsWith("remittance:"))![1];
  await expect(page.getByText(remittance.narration, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Relationship graph" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("communal.png"), fullPage: true });
  await go(page, "settings");
  await page.getByRole("switch", { name: /Revoke consent for Domiciliary/ }).click();
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText(/Access revoked\. Domiciliary/)).toBeVisible();
  const scoped = await explain();
  expect(scoped.explanations.dedup.narration).not.toEqual(full.explanations.dedup.narration);
  expect(Object.keys(scoped.explanations).some(key => key.startsWith("remittance:"))).toBe(false);

  // Hold the new narration request open. Even briefly showing the previous
  // consent scope while this request is pending would disclose excluded data.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${api}/explanations`, async route => {
    await gate;
    await route.continue();
  }, { times: 1 });
  const freshRead = page.waitForRequest(req => req.url().endsWith(`${api}/explanations`));
  try {
    await go(page, "dashboard");
    await freshRead;
    await expect(page.getByText(full.explanations.dedup.narration, { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByText(scoped.explanations.dedup.narration, { exact: true })).toBeVisible();
  await go(page, "communal");
  await expect(page.getByRole("region", { name: "Communal insights" })
    .getByText(/dependents · black tax/i)).toBeVisible();
  await expect(page.getByText(remittance.narration, { exact: true })).toHaveCount(0);
  await go(page, "audit");
  await expect(page.getByText("Excluded by revoked consent:", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("audit-after-revoke.png") });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export audit log" }).click();
  expect((await download).suggestedFilename()).toBe(`ajora-audit-${user}.json`);

  await go(page, "settings");
  await page.getByRole("switch", { name: /Grant consent for Domiciliary/ }).click();
  await expect(page.getByText(/Access restored\. Domiciliary/)).toBeVisible();
  await go(page, "dashboard");
  await expect(page.getByText(full.explanations.dedup.narration, { exact: true })).toBeVisible();
  const audit = await read<{entries: {endpoint: string; revoked_excluded: string[]; accounts_accessed: string[]}[]}>("audit");
  expect(audit.entries.some(e => e.endpoint === "explanations" && e.revoked_excluded.includes(account)
    && !e.accounts_accessed.includes(account))).toBe(true);
});
