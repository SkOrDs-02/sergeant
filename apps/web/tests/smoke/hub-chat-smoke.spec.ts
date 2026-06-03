import { test, expect, type Page } from "@playwright/test";

/**
 * Module smoke — Hub chat (the dedicated `/chat` route).
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-3. The assistant surface is
 * reached either via the in-process `openChat` hub-bus event
 * (`HubChatOverlay`) or by deep-linking the full-screen `/chat` route
 * (`HubChatPage`). The deep-link is the deterministic, attacker-neutral
 * entry (per the `?autoSend=1` note in `HubChatPage.tsx`), so the smoke
 * spec drives it directly and asserts the chat region mounts.
 *
 * Minimal: cold-load `/chat`, assert the `role="region"` /
 * `aria-labelledby="hub-chat-title"` container from `HubChat.tsx` is
 * present and no uncaught page error fired.
 */

const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_done_v1: "1",
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

async function seedLocalStorage(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, SEEDED_LS);
}

test("@critical hub-chat: cold-load mounts the /chat assistant surface", async ({
  page,
}) => {
  await seedLocalStorage(page);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  // `HubChat.tsx` renders `<div role="region" aria-labelledby="hub-chat-title">`.
  // The lazy chunk resolves through `SuspenseWithMinDelay`, so allow the
  // standard 10s mount budget used across the smoke lane.
  await expect(
    page.getByRole("region").filter({ has: page.locator("#hub-chat-title") }),
  ).toBeVisible({ timeout: 10_000 });

  expect(errors, "Uncaught page errors on /chat cold load").toEqual([]);
});
