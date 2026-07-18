import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

/**
 * Conversion-critical browser journeys that are not covered by the direct
 * pricing checkout smoke:
 *
 * - a free user reaches the PDF paywall from the real reports surface;
 * - a shared pricing URL with ?lang=en renders the English funnel copy.
 *
 * The smoke config supplies the authenticated free-user storage state. The
 * tests do not call external payment or translation services.
 */

test("@critical paywall: free-user PDF export opens paywall and leads to pricing", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  const exportButton = page.getByRole("button", { name: "Експортувати PDF" });
  await expect(exportButton).toBeVisible({ timeout: 15_000 });
  await exportButton.click();

  const paywall = page.getByRole("dialog", { name: "PDF-звіти — у Premium" });
  await expect(paywall).toBeVisible();
  await expect(
    paywall.getByText(
      "Розширені звіти між модулями та експорт PDF — у Premium підписці.",
    ),
  ).toBeVisible();

  await paywall.getByRole("button", { name: "Перейти до Pro" }).click();
  await expect(page).toHaveURL(/\/pricing\?source=paywall$/);
  await expect(page.getByRole("heading", { name: "Тарифи" })).toBeVisible();
});

test("@critical locale: English pricing link renders the English conversion funnel", async ({
  page,
}) => {
  await page.goto("/pricing?lang=en", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      name: "Sergeant is free for everyday use. Premium — when you need everything at once.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try Premium" })).toBeVisible();
  await expect(page).toHaveURL(/\/pricing\?lang=en$/);
  await expect(page).toHaveTitle(/.+/);
});
