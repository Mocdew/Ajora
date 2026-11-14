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
    status: "active", mode: "manual", current_round: 1, agreement_version: 1,
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
        status: "submitted", source: "manual", submitted_at: "2026-11-04T09:00:00Z", review_version: 1,
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

for (const outcome of ["committed", "discarded"] as const) {
test(`offline input stays unsent and a lost create is ${outcome === "committed" ? "recovered" : "safely discarded"} after reauthentication`, async ({ context, page }) => {
  const original: SavingsSession = {
    user_id: "original", display_name: "Original organiser", email: "original@example.com", google_linked: false,
  };
  const second: SavingsSession = {
    user_id: "second", display_name: "Other member", email: "other@example.com", google_linked: false,
  };
  let signedIn: SavingsSession | null = original;
  const circle: Circle = {
    id: "committed", name: "A saved circle", organizer_id: original.user_id,
    contribution_kobo: 10_000, frequency: "weekly", member_limit: 2, rules: "Private payment instructions",
    invite_code: "EXAMPLE-INVITE", status: "draft", mode: "manual", current_round: 1,
    agreement_version: 1, created_at: "2026-11-01T09:00:00Z",
    start_date: "2026-11-15", due_dates: ["2026-11-15", "2026-11-22"],
    members: [{ user_id: original.user_id, display_name: original.display_name, position: 1 }],
    contributions: [], payouts: [],
  };
  let key = "";
  let posts = 0;
  let checks = 0;
  let discards = 0;
  await page.route("**/api/engine/savings/session", (route) => signedIn
    ? route.fulfill({ json: signedIn })
    : route.fulfill({ status: 401, json: { detail: "Sign in" } }));
  await page.route("**/api/engine/savings/circles", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: posts && signedIn === original && outcome === "committed" ? [circle] : [] });
      return;
    }
    posts += 1;
    key = route.request().headers()["idempotency-key"];
    expect(key).toMatch(/^[a-f0-9-]{36}$/);
    expect(route.request().headers()["x-ajora-actor"]).toBe(original.user_id);
    await route.abort("connectionreset");
  });
  await page.route("**/api/engine/savings/operations/*", (route) => {
    checks += 1;
    expect(route.request().url()).toMatch(new RegExp(`${key}$`));
    expect(route.request().headers()["x-ajora-actor"]).toBe(original.user_id);
    return outcome === "committed"
      ? route.fulfill({ json: circle })
      : route.fulfill({ status: 404, json: { detail: "No committed operation matches that key." } });
  });
  await page.route("**/api/engine/savings/operations/*/abandon", (route) => {
    discards += 1;
    expect(route.request().url()).toMatch(new RegExp(`${key}/abandon$`));
    expect(route.request().headers()["x-ajora-actor"]).toBe(original.user_id);
    return route.fulfill({ json: null });
  });
  await page.route("**/api/engine/savings/circles/committed", (route) => route.fulfill({ json: circle }));
  await page.route("**/api/engine/auth/login", (route) => {
    signedIn = route.request().postDataJSON().email === original.email ? original : second;
    return route.fulfill({ json: signedIn });
  });
  await page.goto("/circles");
  await page.getByRole("button", { name: "Create a circle", exact: true }).click();
  const form = page.getByRole("region", { name: "Create a circle" });
  await form.getByLabel("Circle name").fill(circle.name);
  await form.getByLabel("Contribution per person (₦)").fill("100");
  await form.getByLabel("Circle rules").fill(circle.rules);
  await context.setOffline(true);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await form.getByRole("button", { name: "Create circle", exact: true }).click();
  await expect(page.getByRole("alert").getByText(/request was not sent/)).toBeVisible();
  await expect(form.getByLabel("Circle rules")).toHaveValue(circle.rules);
  expect(posts).toBe(0);
  await context.setOffline(false);
  await form.getByRole("button", { name: "Create circle", exact: true }).click();
  const check = page.getByRole("button", { name: /Check (and retry )?last change/ });
  await expect(check).toBeVisible();
  const savedMetadata = await page.evaluate(() => Object.values(sessionStorage).join(" "));
  expect(savedMetadata).toContain(key);
  expect(savedMetadata).not.toContain(circle.rules);
  expect(savedMetadata).not.toContain(circle.name);

  // A new account in this tab sees neither the operation nor the original circle.
  signedIn = second;
  await page.reload();
  await expect(page.getByRole("heading", { name: "My circles" })).toBeVisible();
  await expect(check).toHaveCount(0);
  await expect(page.getByText(circle.name, { exact: true })).toHaveCount(0);

  signedIn = null;
  await page.reload();
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  const login = page.getByRole("form", { name: "Log in" });
  await login.getByLabel("Email address").fill(original.email!);
  await login.getByLabel("Password", { exact: true }).fill("example password only");
  await login.getByRole("button", { name: "Log in" }).click();
  await expect(check).toBeVisible();
  await check.click();
  if (outcome === "committed") {
    await expect(page).toHaveURL(/\/circles\/committed$/);
    await expect(page.getByRole("heading", { name: circle.name })).toBeVisible();
  } else {
    const discard = page.getByRole("button", { name: "Discard pending request" });
    await expect(discard).toBeVisible();
    await discard.click();
    await expect(discard).toHaveCount(0);
    expect(await page.evaluate(() => Object.values(sessionStorage).join(" "))).not.toContain(key);
    expect(discards).toBe(1);
  }
  expect(posts).toBe(1);
  expect(checks).toBe(1);
});
}
