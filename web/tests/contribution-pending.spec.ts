import { expect, test } from "@playwright/test";
import type { Circle, SavingsSession } from "../lib/api/savings";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("instalment inputs wait for submission and refresh before accepting the next payment", async ({ page }) => {
  const session: SavingsSession = {
    user_id: "ada-member", display_name: "Ada Member", email: "ada@example.com", google_linked: true,
  };
  let circle: Circle = {
    id: "contribution-pending", name: "Instalment savings", organizer_id: "bisi-organiser",
    contribution_kobo: 1_000_000, frequency: "monthly", member_limit: 2,
    start_date: "2026-11-01", due_dates: ["2026-11-01", "2026-12-01"],
    rules: "Submit each transfer separately.", invite_code: "INSTALMENTS",
    status: "active", current_round: 1, agreement_version: 1,
    created_at: "2026-11-01T09:00:00Z", contributions: [], payouts: [],
    members: [
      { user_id: "bisi-organiser", display_name: "Bisi Organiser", position: 1 },
      { user_id: session.user_id, display_name: session.display_name, position: 2 },
    ],
  };
  const postReceived = deferred();
  const releasePost = deferred();
  const refreshReceived = deferred();
  const releaseRefresh = deferred();
  let submitted = false;
  const path = `**/api/engine/savings/circles/${circle.id}`;
  await page.route("**/api/engine/savings/session", (route) => route.fulfill({ json: session }));
  await page.route(path, async (route) => {
    if (submitted) {
      refreshReceived.resolve();
      await releaseRefresh.promise;
    }
    await route.fulfill({ json: circle });
  });
  await page.route(`${path}/contributions`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      round_number: 1, amount_kobo: 400_000, reference: "first-instalment",
    });
    postReceived.resolve();
    await releasePost.promise;
    submitted = true;
    circle = { ...circle, contributions: [{
      member_id: session.user_id, round_number: 1, status: "submitted",
      reference: "first-instalment", submitted_at: "2026-11-04T09:00:00Z",
      confirmed_at: null, confirmed_kobo: 0, matched_kobo: 0,
      payments: [{
        id: "first-payment", amount_kobo: 400_000, reference: "first-instalment",
        status: "submitted", source: "manual", submitted_at: "2026-11-04T09:00:00Z",
      }],
    }] };
    await route.fulfill({ json: circle });
  });
  try {
    await page.goto(`/circles/${circle.id}`);
    const amount = page.getByLabel("Amount paid (₦)", { exact: true });
    const reference = page.getByLabel("Contribution reference", { exact: true });
    await amount.fill("4000");
    await reference.fill("first-instalment");
    await page.getByRole("button", { name: "Submit contribution", exact: true }).click();
    await postReceived.promise;
    await expect(amount).toBeDisabled({ timeout: 2_000 });
    await expect(reference).toBeDisabled();

    releasePost.resolve();
    await refreshReceived.promise;
    await expect(amount).toBeDisabled();
    await expect(reference).toBeDisabled();
    const nextAmount = amount.fill("6000");
    releaseRefresh.resolve();
    await nextAmount;
    await reference.fill("second-instalment");
    await expect(amount).toBeEnabled();
    await expect(reference).toBeEnabled();
    await expect(amount).toHaveValue("6000");
    await expect(reference).toHaveValue("second-instalment");
    await expect(page.getByText("Reference: first-instalment", { exact: true })).toBeVisible();
  } finally {
    releasePost.resolve();
    releaseRefresh.resolve();
  }
});
