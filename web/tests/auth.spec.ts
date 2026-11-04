import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { Circle, SavingsSession } from "../lib/api/savings";

const password = "Our circle saves together 2026";
const emailAddress = () => `ajora-${randomUUID()}@example.com`;

async function register(page: Page, name: string, email: string) {
  const form = page.getByRole("form", { name: "Create account", exact: true });
  await form.getByLabel("What should your circle call you?").fill(name);
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Confirm password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save together. Grow together." })).toBeVisible();
}

async function login(page: Page, email: string, secret = password) {
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const form = page.getByRole("form", { name: "Log in", exact: true });
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(secret);
  await form.getByRole("button", { name: "Log in", exact: true }).click();
}

async function signOut(page: Page) {
  await page.getByText(/Account access ·/).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Create account", exact: true })).toBeVisible();
}

async function circle(page: Page, name: string) {
  const response = await page.request.post("/api/engine/savings/circles", {
    data: {
      name,
      contribution_kobo: 1_000_000,
      frequency: "monthly",
      member_limit: 2,
      start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<Circle>;
}

test("registration validates confirmation, login returns the same circles, and signout clears private data", async ({ page }, testInfo) => {
  const email = emailAddress();
  await page.goto("/dashboard");
  const form = page.getByRole("form", { name: "Create account", exact: true });
  await form.getByLabel("What should your circle call you?").fill("Ada Account");
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Confirm password", { exact: true }).fill("Different password words");
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Your passwords do not match.");
  await form.getByLabel("Confirm password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save together. Grow together." })).toBeVisible();
  const identity = await (await page.request.get("/api/engine/savings/session")).json() as SavingsSession;
  const savedCircle = await circle(page, "Ada private savings circle");
  await page.reload();
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
  await signOut(page);
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toHaveCount(0);

  await login(page, email, "These are the wrong words");
  await expect(page.getByRole("form", { name: "Log in", exact: true }).getByRole("alert")).toContainText(/email or password/i);
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toHaveCount(0);
  const loginForm = page.getByRole("form", { name: "Log in", exact: true });
  await loginForm.getByLabel("Password", { exact: true }).fill(password);
  await loginForm.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/engine/savings/session")).json()).user_id).toBe(identity.user_id);

  await signOut(page);
  await register(page, "Bisi Separate Account", emailAddress());
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/engine/savings/circles/${savedCircle.id}`)).status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await signOut(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("registration-mobile.png"), fullPage: true });
});

test("login on another device keeps a circle deep link and an invitation", async ({ page, browser }, testInfo) => {
  const email = emailAddress();
  await page.goto("/dashboard");
  await register(page, "Cross Device Member", email);
  const savedCircle = await circle(page, "Cross device savings");
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const other = await context.newPage();
  try {
    await other.goto(`/circles/${savedCircle.id}`);
    await login(other, email);
    await expect(other.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
    await expect(other).toHaveURL(new RegExp(`/circles/${savedCircle.id}$`));
    await signOut(other);
    const invitedEmail = emailAddress();
    const account = await other.request.post("/api/engine/auth/register", {
      data: { display_name: "Invited Member", email: invitedEmail, password },
    });
    expect(account.status()).toBe(201);
    await other.request.post("/api/engine/savings/logout", { data: {} });
    await other.goto(`/circles?invite=${savedCircle.invite_code}`);
    await login(other, invitedEmail);
    await expect(other.getByLabel("Invite code", { exact: true })).toHaveValue(savedCircle.invite_code);
    await expect(other).toHaveURL(new RegExp(`/circles\\?invite=${savedCircle.invite_code}$`));
  } finally {
    await context.close();
  }
});

test("an existing browser profile adds a login without losing its circle or keeping its old recovery key", async ({ page, browser }, testInfo) => {
  const guest = await page.request.post("/api/engine/savings/session", { data: { display_name: "Existing Ada" } });
  expect(guest.status()).toBe(201);
  const identity = await guest.json() as SavingsSession;
  const savedCircle = await circle(page, "Existing profile savings");
  const recovery = await page.request.post("/api/engine/savings/recovery-key", { data: {} });
  const { recovery_key } = await recovery.json();
  await page.goto("/dashboard");
  await page.getByText(/Account access ·/).click();
  const form = page.getByRole("form", { name: "Upgrade your profile", exact: true });
  await expect(form.getByLabel("What should your circle call you?")).toHaveValue("Existing Ada");
  const email = emailAddress();
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Confirm password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("form", { name: "Upgrade your profile", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: savedCircle.name, exact: true })).toBeVisible();
  const current = await (await page.request.get("/api/engine/savings/session")).json();
  expect(current.user_id).toBe(identity.user_id);
  expect(current.email).toBe(email);
  await page.getByText(/Account access ·/).click();
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create or replace recovery key" })).toHaveCount(0);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await context.request.post("/api/engine/savings/recover", { data: { recovery_key } });
    expect(response.status()).toBe(401);
  } finally {
    await context.close();
  }
});
