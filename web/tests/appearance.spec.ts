import { expect, test } from "@playwright/test";

test("light is the default and appearance choices survive navigation and reload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Small contributions. Shared possibilities." })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath("onboarding-desktop.png"), fullPage: true });

  await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
  const theme = page.getByRole("combobox", { name: "Theme", exact: true });
  await expect(theme).toHaveValue("light");
  await theme.selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(theme).toHaveValue("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await theme.selectOption("light");
  await page.getByRole("link", { name: "View financial insights", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("navigation", { name: "Financial insights", exact: true })).toBeVisible();
});

test("tablet and mobile navigation supports Escape, focus return, and route changes", async ({ page }, testInfo) => {
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Small contributions. Shared possibilities." })).toBeVisible();
    const menu = page.getByRole("button", { name: "Open menu", exact: true });
    await menu.click();
    await expect(page.getByRole("button", { name: "Close menu", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#main")).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
    await menu.click();
    await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: /Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Small contributions. Shared possibilities." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("onboarding-mobile.png"), fullPage: true });
  await page.goto("/insights");
  await expect(page.getByRole("combobox", { name: "Select persona" })).toBeEnabled();
  for (const width of [320, 390, 900]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.locator("#insights-navigation")).toHaveAttribute("inert", "");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(page.locator("#insights-navigation a:focus")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#insights-navigation")).not.toHaveAttribute("inert", "");
});
