import { expect, test, type Page } from "@playwright/test";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const identity = {
  user_id: "ada-google", display_name: "Ada Google", email: "ada@gmail.com", google_linked: true,
};
const circle = {
  id: "saved-google-circle", name: "Ada's saved circle", status: "draft", current_round: 1,
  contribution_kobo: 1_000_000, frequency: "monthly", member_limit: 2,
  members: [{ user_id: identity.user_id, display_name: identity.display_name, position: 1 }],
  contributions: [], payouts: [],
};

const googleScript = `(() => {
  let configuration;
  window.google = { accounts: { id: {
    initialize(options) { configuration = options; window.googleTestConfiguration = options; },
    renderButton(element) {
      const callback = configuration.callback;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Continue with Google';
      button.addEventListener('click', () => callback({ credential: 'mock-google-id-token' }));
      element.replaceChildren(button);
    }
  } } };
})();`;

async function mockGoogle(page: Page, options: {
  initial?: { user_id: string; display_name: string; email: string | null; google_linked: boolean };
  rejectFirst?: boolean;
  failScriptOnce?: boolean;
  scriptReady?: Promise<void>;
} = {}) {
  let session = options.initial ?? null;
  let challenges = 0;
  let submissions = 0;
  let scriptLoads = 0;
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    await options.scriptReady;
    if (options.failScriptOnce && scriptLoads++ === 0) await route.abort();
    else await route.fulfill({ contentType: "application/javascript", body: googleScript });
  });
  await page.route("**/api/engine/savings/session", (route) => route.fulfill(session
    ? { json: session }
    : { status: 401, json: { detail: "Sign in to continue." } }));
  await page.route("**/api/engine/savings/circles", (route) => route.fulfill({ json: session ? [circle] : [] }));
  await page.route("**/api/engine/auth/google/challenge", (route) => route.fulfill({
    json: { client_id: clientId, nonce: `test-nonce-${++challenges}` },
  }));
  await page.route("**/api/engine/auth/google", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ credential: "mock-google-id-token" });
    if (options.rejectFirst && submissions++ === 0) {
      await route.fulfill({ status: 409, json: { detail: "An account already uses this email. Sign in with your password, then connect Google." } });
      return;
    }
    session = { ...identity, ...(session ?? {}), email: session?.email ?? identity.email, google_linked: true };
    await route.fulfill({ json: session });
  });
  await page.route("**/api/engine/savings/logout", async (route) => {
    session = null;
    await route.fulfill({ status: 204 });
  });
  return { challenges: () => challenges };
}

test.describe("Google sign-in", () => {
  test.skip(!clientId, "Build and test with NEXT_PUBLIC_GOOGLE_CLIENT_ID to exercise Google sign-in.");

  test("loading Google keeps the email form in place and preserves its focus", async ({ page }) => {
    let releaseScript!: () => void;
    const scriptReady = new Promise<void>((resolve) => { releaseScript = resolve; });
    await mockGoogle(page, { scriptReady });
    await page.goto("/dashboard");
    await expect(page.getByText("Loading Google sign-in…", { exact: true })).toBeVisible();
    const form = page.getByRole("form", { name: "Create account", exact: true });
    const email = form.getByLabel("Email address", { exact: true });
    await email.fill("ada-form@example.com");
    const before = await form.boundingBox();
    releaseScript();
    await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
    const after = await form.boundingBox();
    expect(after?.y).toBe(before?.y);
    await expect(email).toHaveValue("ada-form@example.com");
    await expect(email).toBeFocused();
  });

  test("uses the server nonce, keeps the invitation and restores the account on reload", async ({ page }) => {
    await mockGoogle(page);
    await page.goto("/circles?invite=GOOGLE-INVITE");
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
    await expect(page.getByLabel("Invite code", { exact: true })).toHaveValue("GOOGLE-INVITE");
    await expect(page).toHaveURL(/\/circles\?invite=GOOGLE-INVITE$/);
    const configuration = await page.evaluate(() => (window as Window & {
      googleTestConfiguration?: { client_id: string; nonce: string; ux_mode: string; auto_select: boolean };
    }).googleTestConfiguration);
    expect(configuration).toMatchObject({ client_id: clientId, nonce: "test-nonce-1", ux_mode: "popup", auto_select: false });
    await page.reload();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
    await page.getByText(/Account access ·/).click();
    await expect(page.getByText("Google is connected to your account.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("form", { name: "Create account", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toHaveCount(0);
  });

  test("connects Google to a signed-in password account and keeps the same circles", async ({ page }) => {
    await mockGoogle(page, { initial: { ...identity, google_linked: false } });
    await page.goto("/dashboard");
    await page.getByText(/Account access ·/).click();
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByText("Google is connected to your account.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${identity.email}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("form", { name: "Create account", exact: true })).toBeVisible();
  });

  test("upgrades a browser-only profile and removes its recovery-key controls", async ({ page }) => {
    await mockGoogle(page, { initial: { ...identity, email: null, google_linked: false } });
    await page.goto("/dashboard");
    await page.getByText(/Account access ·/).click();
    await expect(page.getByRole("button", { name: "Create or replace recovery key", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByRole("form", { name: "Upgrade your profile", exact: true })).toHaveCount(0);
    await page.getByText(/Account access ·/).click();
    await expect(page.getByText("Google is connected to your account.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create or replace recovery key", exact: true })).toHaveCount(0);
  });

  test("shows a collision error without clearing the form and refreshes the challenge for retry", async ({ page }) => {
    const mock = await mockGoogle(page, { rejectFirst: true });
    await page.goto("/dashboard");
    const email = page.getByLabel("Email address", { exact: true });
    await email.fill("existing@example.com");
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign in with your password, then connect Google.");
    await expect(email).toHaveValue("existing@example.com");
    await expect(email).toBeEnabled();
    await expect.poll(() => mock.challenges()).toBe(2);
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.getByRole("heading", { name: circle.name, exact: true })).toBeVisible();
  });

  test("retries a blocked Google script while email access remains usable on mobile", async ({ page }) => {
    await mockGoogle(page, { failScriptOnce: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Google sign-in could not load");
    await expect(page.getByLabel("Email address", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Retry Google sign-in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
