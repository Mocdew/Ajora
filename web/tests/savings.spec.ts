import { expect, test, type Page } from "@playwright/test";
import type { Circle } from "../lib/api/savings";
import type { components } from "../lib/api/engine-schema";

const base = "/api/engine/savings";
type BankFeed = components["schemas"]["BankFeed"];

async function profile(page: Page, name: string) {
  // Keep this walkthrough exercising recovery for pre-account browser profiles.
  const response = await page.request.post(`${base}/session`, {
    data: { display_name: name },
  });
  expect(response.status()).toBe(201);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Save together. Grow together." }),
  ).toBeVisible();
}

async function saveRecoveryKey(page: Page) {
  await page.getByText(/Account access ·/).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Create or replace recovery key" })
    .click();
  const field = page.getByLabel("Your new recovery key");
  await expect(field).toBeVisible();
  const key = await field.inputValue();
  await page.getByRole("button", { name: "I saved my key" }).click();
  await expect(field).toBeHidden();
  return key;
}

for (const mode of ["manual", "demo"] as const) {
test(`a recoverable ${mode} circle reconciles instalments and waits for recipient receipt`, async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const memberContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 320, height: 720 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const member = await memberContext.newPage();
  try {
    await profile(page, "Ada Organiser");
    await page.goto("/circles");
    await page
      .getByRole("button", { name: "Create a circle", exact: true })
      .click();
    const form = page.getByRole("region", {
      name: "Create a circle",
      exact: true,
    });
    await form.getByLabel("Circle name").fill("Friends savings circle");
    await form.getByLabel("Circle type").selectOption(mode);
    await form.getByLabel("Contribution per person (₦)").fill("10000");
    await form.getByLabel("Number of members").fill("2");
    await form
      .getByLabel("Circle rules")
      .fill("Review contributions and confirm receipt before each new round.");
    await form
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await expect(page).toHaveURL(/\/circles\/[^/]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const path = `${base}/circles/${id}`;
    const read = async () => {
      const response = await page.request.get(path);
      expect(response.ok()).toBeTruthy();
      return response.json() as Promise<Circle>;
    };
    const initial = await read();
    const setDemo = page.getByRole("button", { name: "Set demo collection account" });
    if (mode === "demo") {
      await setDemo.click();
      await expect(page.getByText("Demo collection account", { exact: true })).toBeVisible();
    } else {
      await expect(setDemo).toHaveCount(0);
    }

    await profile(member, "Bisi Member");
    const memberRecoveryKey = await saveRecoveryKey(member);
    // A shared invitation prefills the code. Rules become visible after joining.
    await member.goto(`/circles?invite=${initial.invite_code}`);
    await expect(member.getByLabel("Invite code", { exact: true })).toHaveValue(
      initial.invite_code,
    );
    await member
      .getByRole("button", { name: "Review invitation", exact: true })
      .click();
    await expect(member.getByText(initial.rules, { exact: true })).toHaveCount(0);
    await member.getByRole("checkbox").check();
    await member
      .getByRole("button", { name: "Accept and join circle", exact: true })
      .click();
    await expect(member).toHaveURL(new RegExp(`/circles/${id}$`));
    await expect(member.getByText(initial.rules, { exact: true })).toBeVisible();
    // Polling updates the organiser's already-open page without a reload.
    await expect(
      page.getByRole("button", { name: "Move Bisi Member earlier" }),
    ).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole("button", { name: "Move Bisi Member earlier" })
      .click();
    await expect
      .poll(async () => (await read()).members[0].display_name)
      .toBe("Bisi Member");
    await expect(
      page.getByRole("button", { name: "Start circle", exact: true }),
    ).toBeDisabled();
    const finalVersion = (await read()).agreement_version;
    await expect(
      page.getByText(new RegExp(`Agreement version ${finalVersion} ·`)),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Accept rules and payout order",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "You accepted this agreement",
        exact: true,
      }),
    ).toBeVisible();
    await member
      .getByRole("button", { name: "Refresh circle", exact: true })
      .click();
    await expect(
      member.getByText(new RegExp(`Agreement version ${finalVersion} ·`)),
    ).toBeVisible();
    await member
      .getByRole("button", {
        name: "Accept rules and payout order",
        exact: true,
      })
      .click();
    await expect(
      member.getByRole("button", {
        name: "You accepted this agreement",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start circle", exact: true }),
    ).toBeEnabled({ timeout: 20_000 });
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Start circle", exact: true })
      .click();
    await expect(
      page.getByLabel("Contribution reference", { exact: true }),
    ).toBeVisible();

    for (const round of [1, 2]) {
      let receipts: Pick<BankFeed["transactions"][number], "sender_name" | "reference" | "amount_kobo">[];
      if (mode === "demo") {
        const feedResponse = await page.request.get(`${path}/bank-feed`);
        expect(feedResponse.ok()).toBeTruthy();
        const feed: BankFeed = await feedResponse.json();
        expect(feed.source).toBe("demo");
        receipts = feed.transactions;
      } else {
        receipts = ["Ada Organiser", "Bisi Member"].flatMap((sender_name) =>
          [400_000, 600_000].map((amount_kobo) => ({
            sender_name, amount_kobo, reference: `test-${round}-${sender_name.slice(0, 3)}-${amount_kobo}`,
          })),
        );
      }
      await member
        .getByRole("button", { name: "Refresh circle", exact: true })
        .click();
      for (const [actor, name] of [
        [page, "Ada Organiser"],
        [member, "Bisi Member"],
      ] as const) {
        const transfers = receipts.filter(
          (receipt) => receipt.sender_name === name,
        );
        expect(transfers).toHaveLength(2);
        for (const receipt of transfers) {
          await actor
            .getByLabel("Amount paid (₦)", { exact: true })
            .fill(String(receipt.amount_kobo / 100));
          await actor
            .getByLabel("Contribution reference", { exact: true })
            .fill(receipt.reference);
          await actor
            .getByRole("button", { name: "Submit contribution", exact: true })
            .click();
          await expect
            .poll(async () =>
              (await read()).contributions
                .flatMap((c) => c.payments ?? [])
                .some((payment) => payment.reference === receipt.reference),
            )
            .toBeTruthy();
        }
      }
      await page
        .getByRole("button", { name: "Refresh circle", exact: true })
        .click();
      for (const receipt of receipts) {
        await page
          .getByRole("button", {
            name: `${mode === "demo" ? "Approve demo match" : "Manually confirm"} ${receipt.reference}`,
            exact: true,
          })
          .click();
        await expect
          .poll(
            async () =>
              (await read()).contributions
                .flatMap((c) => c.payments ?? [])
                .find((payment) => payment.reference === receipt.reference)
                ?.status,
          )
          .toBe("confirmed");
      }
      const funded = await read();
      expect(
        funded.contributions
          .filter((c) => c.round_number === round)
          .map((c) => c.confirmed_kobo),
      ).toEqual([1_000_000, 1_000_000]);
      if (mode === "manual" && round === 1) {
        await member.getByRole("button", { name: "Flag payment for organiser", exact: true }).first().click();
        const reason = member.getByLabel("Reason", { exact: true });
        await expect(reason).toBeFocused();
        await reason.fill("Check this external receipt before payout.");
        await member.getByRole("button", { name: "Save explanation", exact: true }).click();
        await expect(member.getByRole("region", { name: "Payment cases" })).toContainText("Open");
        await page.getByRole("button", { name: "Refresh circle", exact: true }).click();
        await expect(page.getByRole("button", { name: "Record payout sent", exact: true })).toBeDisabled();
        await expect(page.getByText(/Payout is on hold/)).toBeVisible();
        await member.getByRole("button", { name: "Resolve my payment case" }).click();
        await member.getByLabel("Reason", { exact: true }).fill("The organiser reconciled the payment with me.");
        await member.getByRole("button", { name: "Save explanation", exact: true }).click();
        await expect(member.getByRole("region", { name: "Payment cases" })).toContainText("Resolved");
        await page.getByRole("button", { name: "Refresh circle", exact: true }).click();
      }
      await page
        .getByLabel("External payout reference", { exact: true })
        .fill(`external-payout-${round}`);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Record payout sent", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await read()).payouts.find(
              (payout) => payout.round_number === round,
            )?.status,
        )
        .toBe("sent");
      expect((await read()).current_round).toBe(round);
      const recipient = round === 1 ? member : page;
      await recipient
        .getByRole("button", { name: "Refresh circle", exact: true })
        .click();
      if (round === 1) {
        await recipient
          .getByRole("button", { name: "Report payout problem", exact: true })
          .click();
        await recipient
          .getByRole("textbox", { name: "Reason", exact: true })
          .fill("The bank transfer has not arrived yet.");
        await recipient
          .getByRole("button", { name: "Save explanation", exact: true })
          .click();
        await expect
          .poll(async () => (await read()).payouts[0].status)
          .toBe("disputed");
        expect((await read()).current_round).toBe(1);
      }
      recipient.once("dialog", (dialog) => dialog.accept());
      await recipient
        .getByRole("button", { name: "Confirm payout received", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await read()).payouts.find(
              (payout) => payout.round_number === round,
            )?.status,
        )
        .toBe("received");
      if (round === 1) {
        // Recover on a cleared browser; circle membership and the original user survive.
        const memberId = await member.request.get(`${base}/session`);
        const originalIdentity = await memberId.json();
        await memberContext.clearCookies();
        await member.goto(`/circles/${id}`);
        await member.getByText("Recover an existing profile", { exact: true }).click();
        await member
          .getByLabel("Recovery key", { exact: true })
          .fill(memberRecoveryKey);
        await member
          .getByRole("button", { name: "Restore my profile", exact: true })
          .click();
        await expect(
          member.getByRole("heading", { name: initial.name, exact: true }),
        ).toBeVisible();
        const restored = await member.request.get(`${base}/session`);
        expect((await restored.json()).user_id).toBe(originalIdentity.user_id);
        await page
          .getByRole("button", { name: "Refresh circle", exact: true })
          .click();
      }
    }
    const completed = await read();
    expect(completed.status).toBe("completed");
    expect(completed.payouts.map((payout) => payout.status)).toEqual([
      "received",
      "received",
    ]);
    await page
      .getByRole("button", { name: "Refresh circle", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Circle history", exact: true }),
    ).toContainText("The bank transfer has not arrived yet.");
    await page.screenshot({
      path: testInfo.outputPath("savings-circle.png"),
      fullPage: true,
    });
    await page.goto("/activity");
    await expect(
      page.getByText("Ref: external-payout-2", { exact: true }),
    ).toBeVisible();
    await member.goto("/dashboard");
    await expect(
      member.getByText("Your received payouts", { exact: true }),
    ).toBeVisible();
    await expect(member.getByText("Your received payouts", { exact: true })).toBeVisible();
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await member.setViewportSize({ width: 390, height: 844 });
    await member.screenshot({
      path: testInfo.outputPath("savings-mobile.png"),
      fullPage: true,
    });
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    await memberContext.close();
  }
});
}
