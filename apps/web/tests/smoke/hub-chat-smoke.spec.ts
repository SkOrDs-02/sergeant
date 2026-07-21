import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors } from "./smokeHelpers";

/**
 * Module smoke — Hub chat (the dedicated `/chat` route).
 *
 * S10-X1: cold-load mount + quick-action chip → composer prefilled.
 * Audit `2026-05-13-testing-devx-roast.md` §P1-3.
 */

test("@critical hub-chat: cold-load mounts the /chat assistant surface", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  const chatRegion = page
    .getByRole("region")
    .filter({ has: page.locator("#hub-chat-title") });
  await expect(chatRegion).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#hub-chat-title")).toHaveText("Асистент");

  const input = page.getByLabel("Повідомлення асистенту");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("");

  // Fresh sessions seed an intro assistant message via
  // `normalizeStoredMessages`, so `<ChatEmpty>` never renders on cold load.
  // Exercise the composer prefill path through a quick-action chip instead.
  await page.getByTestId("chat-quick-action-create_transaction").click();
  await expect(input).toHaveValue("Додай витрату: ");

  expect(errors, "Uncaught page errors on /chat cold load").toEqual([]);
});

test("@critical hub-chat: chat API failure renders a retryable assistant message", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  const chatRegion = page
    .getByRole("region")
    .filter({ has: page.locator("#hub-chat-title") });
  await expect(chatRegion).toBeVisible({ timeout: 10_000 });

  const input = page.getByLabel("Повідомлення асистенту");
  await input.fill("Production readiness degraded-chat smoke ping.");

  const chatResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/chat") && response.request().method() === "POST"
      );
    },
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Надіслати" }).click();

  const response = await chatResponse;
  expect(response.status(), "POST /api/chat degraded status").toBe(503);
  await expect(chatRegion).toContainText(/Помилка|сервер|AI|503/i, {
    timeout: 15_000,
  });
  await expect(input).toBeEnabled({ timeout: 10_000 });

  expect(errors, "Uncaught page errors on degraded /chat send").toEqual([]);
});
