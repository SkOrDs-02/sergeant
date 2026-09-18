import { test, expect, type Page } from "@playwright/test";

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

test("@critical dashboard: renders without console errors", async ({
  page,
}) => {
  await seedLocalStorage(page);

  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();
  await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

  const fatal = errors.filter(
    (e) =>
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR_") &&
      !e.includes("service-worker"),
  );
  expect(fatal, "Unexpected console errors on dashboard").toEqual([]);
});

test("@critical dashboard: API health endpoint responds", async ({
  request,
}) => {
  const res = await request.get(
    (process.env.VITE_API_BASE_URL || "http://127.0.0.1:3000") + "/health",
  );
  expect(res.ok()).toBeTruthy();
});
