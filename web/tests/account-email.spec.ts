import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Circle, SavingsSession } from "../lib/api/savings";

const password = "A new private savings passphrase";
const token = "test-link-token-kept-out-of-request-urls";
const account = { user_id: "email-test-user", display_name: "Ada Email", email: "ada@example.com", google_linked: false };

async function sessionRoutes(page: Page, signedIn = false) {
  await page.route("**/api/engine/health", (route) => route.fulfill({ json: { status: "ok", users: [] } }));
  await page.route("**/api/engine/savings/session", (route) => route.fulfill(signedIn
    ? { json: account }
    : { status: 401, json: { detail: "Sign in to continue." } }));
  await page.route("**/api/engine/savings/circles", (route) => route.fulfill({ json: [] }));
}

test("forgot password is reachable from login and keeps the generic request result", async ({ page }) => {
  await sessionRoutes(page);
  const requests: unknown[] = [];
  await page.route("**/api/engine/auth/password/forgot", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: { message: "If that email belongs to a password account, a reset link has been requested." } });
  });
  await page.goto("/dashboard?login=1");
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  const form = page.getByRole("form", { name: "Request password reset" });
  await form.getByLabel("Email address", { exact: true }).fill("unknown@example.com");
  await form.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("If that email belongs to a password account");
  expect(requests).toEqual([{ email: "unknown@example.com" }]);
  await expect(form.getByLabel("Email address")).toHaveValue("unknown@example.com");
});

test("password reset strips the fragment, validates confirmation, and returns to signed-out login", async ({ page }) => {
  await sessionRoutes(page);
  const requests: unknown[] = [];
  const requestURLs: string[] = [];
  page.on("request", (request) => requestURLs.push(request.url()));
  await page.route("**/api/engine/auth/password/reset", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: "Your password has been reset." } });
  });
  await page.goto(`/reset-password#token=${token}`);
  const form = page.getByRole("form", { name: "Reset password", exact: true });
  await expect(form).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  expect(requests).toEqual([]);
  await form.getByLabel("New password", { exact: true }).fill("short");
  await form.getByLabel("Confirm new password", { exact: true }).fill("short");
  await form.getByRole("button", { name: "Reset password", exact: true }).click();
  expect(requests).toEqual([]);
  await form.getByLabel("New password", { exact: true }).fill(password);
  await form.getByLabel("Confirm new password", { exact: true }).fill("Different private passphrase");
  await form.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Your passwords do not match.");
  expect(requests).toEqual([]);
  await form.getByLabel("Confirm new password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("all previous sessions have been signed out");
  expect(requests).toEqual([{ token, password }]);
  expect(requestURLs.filter((url) => url.includes("/api/engine/")).every((url) => !url.includes(token))).toBeTruthy();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByText(/Account access ·/)).toHaveCount(0);
});

test("verification only consumes a fragment token after explicit confirmation", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/engine/auth/email/verify", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: "Email address verified." } });
  });
  await page.goto(`/verify-email#token=${token}`);
  const form = page.getByRole("form", { name: "Verify email", exact: true });
  await expect(form).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  expect(requests).toEqual([]);
  await form.getByRole("button", { name: "Verify email address", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your email address is verified.");
  expect(requests).toEqual([{ token }]);
});

test("expired reset links offer a fresh request and missing fragments cannot submit", async ({ page }) => {
  await page.route("**/api/engine/auth/password/reset", (route) => route.fulfill({ status: 400, json: { detail: "This reset link has expired or has already been used. Request a new link." } }));
  await page.goto(`/reset-password#token=${token}`);
  const form = page.getByRole("form", { name: "Reset password", exact: true });
  await form.getByLabel("New password", { exact: true }).fill(password);
  await form.getByLabel("Confirm new password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("expired or has already been used");
  await form.getByRole("link", { name: "Request a new reset link", exact: true }).click();
  await expect(page.getByRole("form", { name: "Request password reset" })).toBeVisible();
  await page.goto("/verify-email");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("missing its code");
  await expect(page.getByRole("button", { name: "Verify email address" })).toHaveCount(0);
  await page.goto("/reset-password");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("missing its code");
  await expect(page.getByRole("form", { name: "Reset password", exact: true })).toHaveCount(0);
});

test("account email verification can be requested without blocking circle access", async ({ page }) => {
  await sessionRoutes(page, true);
  let verified = false;
  let sends = 0;
  await page.route("**/api/engine/auth/email/status", (route) => route.fulfill({ json: { email: account.email, verified, delivery_available: true } }));
  await page.route("**/api/engine/auth/email/request", (route) => {
    sends++;
    return route.fulfill({ status: 202, json: { message: "A verification email has been requested." } });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Save together. Grow together." })).toBeVisible();
  const status = page.getByRole("region", { name: "Email verification", exact: true });
  await expect(status).toContainText("Confirm ada@example.com belongs to you");
  await status.getByRole("button", { name: "Send verification email", exact: true }).click();
  await expect(status.getByRole("status")).toContainText("Check your inbox and spam folder");
  expect(sends).toBe(1);
  verified = true;
  await page.reload();
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Email verification", exact: true })).toHaveCount(0);
});

test("unavailable delivery gives useful feedback without a false sent message", async ({ page }) => {
  await sessionRoutes(page, true);
  await page.route("**/api/engine/auth/email/status", (route) => route.fulfill({ json: { email: account.email, verified: false, delivery_available: false } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Email verification" })).toContainText("temporarily unavailable");
  await expect(page.getByRole("button", { name: "Send verification email", exact: true })).toHaveCount(0);
  await page.route("**/api/engine/auth/password/forgot", (route) => route.fulfill({ status: 503, json: { detail: "Email delivery is temporarily unavailable. Please try again later." } }));
  await page.goto("/forgot-password");
  const form = page.getByRole("form", { name: "Request password reset" });
  await form.getByLabel("Email address").fill(account.email);
  await form.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(form.getByRole("status")).toHaveCount(0);
  await expect(form.getByLabel("Email address")).toHaveValue(account.email);
});

// The CI test server uses the real mail renderer and intercepts only Resend's
// HTTPS transport. Its private mailbox file is never exposed by an API route.
async function renderedEmailLink(mailboxPath: string, email: string, path: "verify-email" | "reset-password") {
  let link = "";
  await expect.poll(async () => {
    let contents = "";
    try {
      contents = await readFile(mailboxPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const line of contents.trim().split("\n").reverse()) {
      let message: { to?: string[]; text?: string };
      try { message = JSON.parse(line); } catch { continue; }
      if (!message.to?.includes(email)) continue;
      const match = message.text?.match(new RegExp(`https?:\\/\\/[^\\s]+\\/${path}#token=[A-Za-z0-9_-]+`));
      if (match) { link = match[0]; break; }
    }
    // Keep the secret link out of assertion output if delivery fails.
    return Boolean(link);
  }, { message: `The local test mailbox receives the ${path} email`, timeout: 15_000 }).toBe(true);
  return link;
}

test("real account emails verify a mailbox and reset access without losing its circle", async ({ page, browser }, testInfo) => {
  const mailboxPath = process.env.AJORA_TEST_MAILBOX_PATH;
  if (!mailboxPath) {
    test.skip(true, "The isolated account-mail test server is not configured.");
    return;
  }
  const email = `ajora-email-${randomUUID()}@example.invalid`;
  const newPassword = "A different private savings passphrase";
  const registered = await page.request.post("/api/engine/auth/register", {
    data: { display_name: "Email recovery member", email, password },
  });
  expect(registered.status()).toBe(201);
  const original = await registered.json() as SavingsSession;
  const created = await page.request.post("/api/engine/savings/circles", { data: {
    name: `Recovery circle ${randomUUID().slice(0, 8)}`,
    contribution_kobo: 10_000,
    frequency: "monthly",
    member_limit: 2,
    start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  } });
  expect(created.status()).toBe(201);
  const circle = await created.json() as Circle;
  const requested = await page.request.post("/api/engine/auth/email/request", { data: {} });
  expect(requested.status()).toBe(202);
  const verifyLink = await renderedEmailLink(mailboxPath, email, "verify-email");
  const verificationContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const resetContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const verificationPage = await verificationContext.newPage();
    await verificationPage.goto(verifyLink);
    await expect(verificationPage).toHaveURL(/\/verify-email$/);
    expect((await (await page.request.get("/api/engine/auth/email/status")).json()).verified).toBe(false);
    await verificationPage.getByRole("button", { name: "Verify email address", exact: true }).click();
    await expect(verificationPage.getByRole("status")).toContainText("Your email address is verified.");
    expect((await (await page.request.get("/api/engine/auth/email/status")).json()).verified).toBe(true);

    const resetPage = await resetContext.newPage();
    await resetPage.goto("/forgot-password");
    await resetPage.getByLabel("Email address", { exact: true }).fill(email);
    await resetPage.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(resetPage.getByRole("status")).toContainText("If an account uses this email");
    const resetLink = await renderedEmailLink(mailboxPath, email, "reset-password");
    await resetPage.goto(resetLink);
    await expect(resetPage).toHaveURL(/\/reset-password$/);
    await resetPage.getByLabel("New password", { exact: true }).fill(newPassword);
    await resetPage.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await resetPage.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(resetPage.getByRole("status")).toContainText("all previous sessions have been signed out");
    expect((await page.request.get("/api/engine/savings/session")).status()).toBe(401);
    expect((await resetContext.request.post("/api/engine/auth/login", { data: { email, password } })).status()).toBe(401);
    await resetPage.getByRole("link", { name: "Log in", exact: true }).click();
    const login = resetPage.getByRole("form", { name: "Log in", exact: true });
    await login.getByLabel("Email address", { exact: true }).fill(email);
    await login.getByLabel("Password", { exact: true }).fill(newPassword);
    await login.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(resetPage.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
    const restored = await (await resetContext.request.get("/api/engine/savings/session")).json() as SavingsSession;
    expect(restored.user_id).toBe(original.user_id);
    const restoredCircle = await resetContext.request.get(`/api/engine/savings/circles/${circle.id}`);
    expect(restoredCircle.status()).toBe(200);
    const saved = await restoredCircle.json() as Circle;
    expect(saved.id).toBe(circle.id);
    expect(saved.organizer_id).toBe(original.user_id);
    expect(saved.members.map((member) => member.user_id)).toContain(original.user_id);
  } finally {
    await verificationContext.close();
    await resetContext.close();
  }
});
