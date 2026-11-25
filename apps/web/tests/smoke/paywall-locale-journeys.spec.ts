import { test, expect } from "@playwright/test";

import { getWorld } from "../fixtures/worlds";
import { installWorld } from "../utils/scenario";
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
 *
 * `/billing/providers` is stubbed with an enabled provider: the smoke server
 * has no payment env, and with an empty list the paywall and /pricing switch
 * to the pre-launch «Повідомити про запуск» CTA (ux-29). The pre-launch state
 * has its own test at the bottom of this file.
 */

const withPaymentProvider = (page: Parameters<typeof installWorld>[0]) =>
  installWorld(page, getWorld("empty"), { only: ["/billing/providers"] });

test("@critical paywall: free-user PDF export opens paywall and leads to pricing", async ({
  page,
}) => {
  await withPaymentProvider(page);
  await seedFTUX(page, "post-ftux");
  await page.goto("/insights", { waitUntil: "domcontentloaded" });

  const exportButton = page.getByRole("button", { name: "Експортувати PDF" });
  await expect(exportButton).toBeVisible({ timeout: 15_000 });
  await exportButton.click();

  const paywall = page.getByRole("dialog", { name: "PDF-звіти – у Premium" });
  await expect(paywall).toBeVisible();
  await expect(
    paywall.getByText("Самі звіти й CSV лишаються безкоштовними."),
  ).toBeVisible();

  await paywall.getByRole("button", { name: "Дивитися плани" }).click();
  await expect(page).toHaveURL(/\/pricing\?source=paywall$/);
  await expect(
    page.getByRole("heading", { name: "Плани", exact: true }),
  ).toBeVisible();
});

test("@critical locale: English pricing link renders the English conversion funnel", async ({
  page,
}) => {
  await withPaymentProvider(page);
  await page.goto("/pricing?lang=en", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      name: "Sergeant is free for everyday use. Premium, when you need everything at once.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try Premium" })).toBeVisible();
  await expect(page).toHaveURL(/\/pricing\?lang=en$/);
  await expect(page).toHaveTitle(/.+/);
});

test("@critical pricing: without a payment provider Premium CTA offers the launch waitlist", async ({
  page,
}) => {
  // Real smoke server, no payment env → `GET /billing/providers` is empty.
  await page.goto("/pricing", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Плани", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Повідомити про запуск" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Спробувати Premium" }),
  ).toHaveCount(0);
});
