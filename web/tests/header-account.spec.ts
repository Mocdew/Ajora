import { expect, test, type Page } from "@playwright/test";
import type { SavingsSession } from "../lib/api/savings";

const identity: SavingsSession = {
  user_id: "header-ada",
  display_name: "Ada Account",
  email: "ada@example.com",
  google_linked: false,
};
const password = "Our circle saves together 2026";
const savedCircle = {
  id: "header-circle", name: "Ada's saved circle", status: "draft", current_round: 1,
  contribution_kobo: 1_000_000, frequency: "monthly", member_limit: 2,
  members: [{ user_id: identity.user_id, display_name: identity.display_name, position: 1 }],
  contributions: [], payouts: [],
};

async function accountRoutes(page: Page, options: {
  initial?: SavingsSession | null;
  logoutStatus?: number;
} = {}) {
  let session = options.initial === undefined ? identity : options.initial;
  let logoutStatus = options.logoutStatus ?? 204;
  let logoutCalls = 0;
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.route("**/api/engine/savings/session", (route) => route.fulfill(session
    ? { json: session }
    : { status: 401, json: { detail: "Sign in to continue." } }));
  await page.route("**/api/engine/savings/circles", (route) => route.fulfill({ json: session ? [savedCircle] : [] }));
  await page.route("**/api/engine/auth/email/status", (route) => route.fulfill({
    json: { email: session?.email, verified: true, delivery_available: false },
  }));
  await page.route("**/api/engine/savings/logout", async (route) => {
    logoutCalls++;
    expect(route.request().method()).toBe("POST");
    if (logoutStatus === 204 || logoutStatus === 401) session = null;
    await route.fulfill(logoutStatus === 204
      ? { status: 204 }
      : { status: logoutStatus, json: { detail: logoutStatus === 401 ? "Your session has expired." : "Could not log out. Please try again." } });
  });
  await page.route("**/api/engine/auth/login", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: identity.email, password });
    session = identity;
    await route.fulfill({ json: session });
  });
  return {
    logoutCalls: () => logoutCalls,
    allowLogout: () => { logoutStatus = 204; },
  };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`header logout from Settings returns to login and restores circles at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const account = await accountRoutes(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
    await page.goto("/settings");
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings-account.png"), fullPage: true });
    await header.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?login=1$/);
    expect(account.logoutCalls()).toBe(1);
    const form = page.getByRole("form", { name: "Log in", exact: true });
    await expect(form).toBeVisible();
    await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
    await form.getByLabel("Email address", { exact: true }).fill(identity.email!);
    await form.getByLabel("Password", { exact: true }).fill(password);
    await form.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
}

test("a signed-out visitor can open login directly from Settings", async ({ page }) => {
  await accountRoutes(page, { initial: null });
  await page.goto("/settings");
  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?login=1$/);
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
});

test("the header login link switches the existing Home form to login", async ({ page }) => {
  await accountRoutes(page, { initial: null });
  await page.goto("/dashboard");
  await expect(page.getByRole("form", { name: "Create account", exact: true })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
});

test("header logout on Home opens login after removing private circle content", async ({ page }) => {
  await accountRoutes(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toHaveCount(0);
});

for (const action of ["Log in", "Log out"] as const) {
  test(`${action} closes the mobile menu and leaves the login form usable`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await accountRoutes(page, { initial: action === "Log in" ? null : identity });
    await page.goto("/dashboard?login=1");
    if (action === "Log in") {
      await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Create account", exact: true }).first().click();
      await expect(page.getByRole("form", { name: "Create account", exact: true })).toBeVisible();
    }
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeVisible();
    await header.getByRole(action === "Log in" ? "link" : "button", { name: action, exact: true }).click();
    await expect(header.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
    await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
    const email = page.getByRole("form", { name: "Log in", exact: true }).getByLabel("Email address", { exact: true });
    await email.fill(identity.email!);
    await expect(email).toBeFocused();
  });
}

test("failed logout keeps the account active and offers a working retry", async ({ page }) => {
  const account = await accountRoutes(page, { logoutStatus: 503 });
  await page.goto("/settings");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(header.getByRole("alert")).toContainText("Could not log out. Please try again.");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(header.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
  account.allowLogout();
  await header.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
  expect(account.logoutCalls()).toBe(2);
});

test("logout from an expired session still opens login", async ({ page }) => {
  await accountRoutes(page, { logoutStatus: 401 });
  await page.goto("/settings");
  await page.getByRole("banner").getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
});

test("browser-only profiles keep the recovery-key reminder before logout", async ({ page }) => {
  const account = await accountRoutes(page, { initial: { ...identity, email: null } });
  await page.goto("/settings");
  const logout = page.getByRole("banner").getByRole("button", { name: "Log out", exact: true });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("recovery key");
    await dialog.dismiss();
  });
  await logout.click();
  expect(account.logoutCalls()).toBe(0);
  await expect(logout).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await logout.click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
  expect(account.logoutCalls()).toBe(1);
});
