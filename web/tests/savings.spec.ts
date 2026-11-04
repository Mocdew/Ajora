import { expect, test, type Page } from "@playwright/test";
import type { Circle } from "../lib/api/savings";

const base = "/api/engine/savings";

async function profile(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.getByRole("textbox", { name: "What should your circle call you?" }).fill(name);
  await page.getByRole("button", { name: "Start saving together" }).click();
  await expect(page.getByRole("heading", { name: "Save together. Grow together." })).toBeVisible();
}

test("two members create a circle, confirm contributions and complete payout turns", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const memberContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const member = await memberContext.newPage();
  try {
    await profile(page, "Ada Organiser");
    await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "My circles" }).click();
    await page.getByRole("button", { name: "Create a circle", exact: true }).click();
    const form = page.getByRole("region", { name: "Create a circle", exact: true });
    await form.getByLabel("Circle name").fill("Friends savings circle");
    await form.getByLabel("Contribution per person (₦)").fill("10000");
    await form.getByLabel("Number of members").fill("2");
    await form.getByLabel("Circle rules").fill("Send contributions externally. The organiser verifies receipts before recording each payout.");
    await form.getByRole("button", { name: "Create circle", exact: true }).click();
    await expect(page).toHaveURL(/\/circles\/[^/]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const path = `${base}/circles/${id}`;
    const read = async () => {
      const response = await page.request.get(path);
      expect(response.ok()).toBeTruthy();
      return response.json() as Promise<Circle>;
    };
    const circle = await read();
    expect(circle.contribution_kobo).toBe(1_000_000);
    await profile(member, "Bisi Member");
    // The member sees the invitation's rules before committing membership.
    await member.goto("/circles");
    await member.getByRole("button", { name: "Join a circle", exact: true }).click();
    await member.getByLabel("Invite code").fill(circle.invite_code);
    await member.getByRole("button", { name: /review|preview/i }).click();
    await expect(member.getByText(circle.rules, { exact: true })).toBeVisible();
    await member.getByRole("checkbox").check();
    await member.getByRole("button", { name: /accept.*join|agree.*join/i }).click();
    await expect(member).toHaveURL(new RegExp(`/circles/${id}$`));

    await page.reload();
    await expect(page.getByText("Bisi Member", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Move Bisi Member earlier" }).click();
    await expect.poll(async () => (await read()).members[0].display_name).toBe("Bisi Member");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Start circle", exact: true }).click();
    await expect(page.getByLabel("Contribution reference")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record payout", exact: true })).toBeDisabled();
    for (const round of [1, 2]) {
      for (const [actor, name] of [[page, "Ada Organiser"], [member, "Bisi Member"]] as const) {
        await actor.reload();
        await actor.getByLabel("Contribution reference").fill(`external-${round}-${name}`);
        await actor.getByRole("button", { name: "Submit contribution", exact: true }).click();
        await expect(actor.getByText("Awaiting organiser confirmation", { exact: true })).toBeVisible();
      }
      await page.reload();
      if (round === 1) {
        await page.getByRole("button", { name: "Reject reference from Bisi Member", exact: true }).click();
        await page.getByLabel("Reason for rejection").fill("Please correct the payment reference.");
        await page.getByRole("button", { name: "Reject reference", exact: true }).click();
        await member.reload();
        await expect(member.getByText(/Your reference was rejected/)).toBeVisible();
        await member.getByLabel("Contribution reference").fill("corrected-member-reference");
        await member.getByRole("button", { name: "Submit contribution", exact: true }).click();
        await expect(member.getByText("Awaiting organiser confirmation", { exact: true })).toBeVisible();
        await page.reload();
      }
      await page.getByRole("button", { name: "Confirm contribution from Ada Organiser", exact: true }).click();
      await page.getByRole("button", { name: "Confirm contribution from Bisi Member", exact: true }).click();
      await page.getByLabel("External payout reference").fill(`external-payout-${round}`);
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Record payout", exact: true }).click();
      await expect.poll(async () => (await read()).payouts.length).toBe(round);
    }
    const completed = await read();
    expect(completed.status).toBe("completed");
    expect(completed.payouts.map(p => p.amount_kobo)).toEqual([2_000_000, 2_000_000]);
    await page.reload();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("savings-circle.png"), fullPage: true });
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: /activity/i })).toBeVisible();
    await expect(page.getByText("Ref: external-payout-2", { exact: true })).toBeVisible();
    await member.goto("/dashboard");
    await expect(member.getByText("Your confirmed contributions", { exact: true })).toBeVisible();
    await member.setViewportSize({ width: 390, height: 844 });
    await member.screenshot({ path: testInfo.outputPath("savings-mobile.png"), fullPage: true });
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  } finally {
    await memberContext.close();
  }
});
