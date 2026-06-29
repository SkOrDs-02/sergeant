import { expect, test, type Page } from "@playwright/test";

const WARM_STORAGE: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_done_v1: "1",
  hub_first_real_entry_done_v1: "1",
  hub_onboarding_vibes_v1: JSON.stringify([
    "finyk",
    "fizruk",
    "nutrition",
    "routine",
  ]),
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
  "sergeant.onboarding.module_first_seen.finyk.v1": "1",
  "sergeant.onboarding.module_first_seen.fizruk.v1": "1",
  "sergeant.onboarding.module_first_seen.nutrition.v1": "1",
  "sergeant.onboarding.module_first_seen.routine.v1": "1",
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

type AuthMode = "anon" | "user";

interface StoryRoute {
  id: string;
  path: string;
  auth?: AuthMode;
  storage?: Record<string, string> | null;
}

const STORY_ROUTES: StoryRoute[] = [
  { id: "WEB-HUB-001", path: "/", auth: "user" },
  { id: "WEB-HUB-002", path: "/", auth: "anon", storage: null },
  { id: "WEB-ONBOARD-001", path: "/onboarding", auth: "anon", storage: null },
  { id: "WEB-ONBOARD-002", path: "/welcome", auth: "anon", storage: null },
  { id: "WEB-AUTH-001", path: "/sign-in", auth: "anon", storage: null },
  { id: "WEB-AUTH-002", path: "/login", auth: "anon", storage: null },
  { id: "WEB-AUTH-003", path: "/reset-password", auth: "anon", storage: null },
  { id: "WEB-PROFILE-001", path: "/profile", auth: "user" },
  { id: "WEB-PRICING-001", path: "/pricing", auth: "anon", storage: null },
  { id: "WEB-LEGAL-001", path: "/privacy", auth: "anon", storage: null },
  { id: "WEB-STATUS-001", path: "/status", auth: "anon", storage: null },
  { id: "WEB-ASSISTANT-001", path: "/assistant", auth: "user" },
  { id: "WEB-CHAT-001", path: "/chat", auth: "user" },
  {
    id: "WEB-NOTFOUND-001",
    path: "/definitely-not-a-real-route",
    auth: "anon",
  },
  { id: "WEB-DEV-001", path: "/design", auth: "user" },
  { id: "WEB-FINYK-001", path: "/finyk", auth: "user" },
  { id: "WEB-FINYK-002", path: "/finyk", auth: "user" },
  { id: "WEB-FINYK-003", path: "/finyk/transactions", auth: "user" },
  { id: "WEB-FINYK-004", path: "/finyk/transactions", auth: "user" },
  { id: "WEB-FINYK-005", path: "/finyk/budgets", auth: "user" },
  { id: "WEB-FINYK-006", path: "/finyk/analytics", auth: "user" },
  { id: "WEB-FINYK-007", path: "/finyk/assets", auth: "user" },
  { id: "WEB-FINYK-008", path: "/finyk", auth: "user" },
  { id: "WEB-FIZRUK-001", path: "/fizruk", auth: "user" },
  { id: "WEB-FIZRUK-002", path: "/fizruk", auth: "user" },
  { id: "WEB-FIZRUK-003", path: "/fizruk/workouts", auth: "user" },
  { id: "WEB-FIZRUK-004", path: "/fizruk/programs", auth: "user" },
  { id: "WEB-FIZRUK-005", path: "/fizruk/progress", auth: "user" },
  { id: "WEB-FIZRUK-006", path: "/fizruk/body", auth: "user" },
  { id: "WEB-NUTRITION-001", path: "/nutrition", auth: "user" },
  { id: "WEB-NUTRITION-002", path: "/nutrition", auth: "user" },
  { id: "WEB-NUTRITION-003", path: "/nutrition/pantry", auth: "user" },
  { id: "WEB-NUTRITION-004", path: "/nutrition/log", auth: "user" },
  { id: "WEB-NUTRITION-005", path: "/nutrition/menu", auth: "user" },
  { id: "WEB-NUTRITION-006", path: "/nutrition/menu", auth: "user" },
  { id: "WEB-ROUTINE-001", path: "/routine", auth: "user" },
  { id: "WEB-ROUTINE-002", path: "/routine", auth: "user" },
  { id: "WEB-ROUTINE-003", path: "/routine/stats", auth: "user" },
  { id: "WEB-ROUTINE-004", path: "/routine", auth: "user" },
  { id: "WEB-INSIGHTS-001", path: "/insights", auth: "user" },
  { id: "WEB-SETTINGS-001", path: "/settings", auth: "user" },
  { id: "WEB-FINYK-009", path: "/finyk/transactions", auth: "user" },
  {
    id: "WEB-FINYK-010",
    path: "/finyk",
    auth: "user",
    storage: { ...WARM_STORAGE, pwa_pending_action: "add-expense" },
  },
  {
    id: "WEB-FINYK-011",
    path: "/finyk?sync=https%3A%2F%2Fexample.test%2Fbackup",
    auth: "user",
  },
  { id: "WEB-NUTRITION-007", path: "/nutrition", auth: "user" },
  { id: "WEB-NUTRITION-008", path: "/nutrition", auth: "user" },
  { id: "WEB-NUTRITION-009", path: "/nutrition", auth: "user" },
  { id: "WEB-FIZRUK-007", path: "/fizruk/workouts", auth: "user" },
  { id: "WEB-ROUTINE-005", path: "/routine", auth: "user" },
];

async function seedLocalStorage(
  page: Page,
  storage: Record<string, string> | null,
) {
  if (!storage) return;
  await page.addInitScript((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, value);
    }
  }, storage);
}

async function mockApi(page: Page, auth: AuthMode) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.includes("/me")) {
      if (auth === "anon") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, code: "UNAUTHENTICATED" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: {
            id: "qa-user",
            name: "QA User",
            email: "qa@example.com",
            emailVerified: true,
          },
        }),
      });
      return;
    }

    if (path.includes("/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          generatedAt: new Date().toISOString(),
          overall: "operational",
          components: [],
        }),
      });
      return;
    }

    if (path.includes("/billing/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, plan: "free", features: {} }),
      });
      return;
    }

    if (path.includes("/mono/sync-state")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, connected: false, sync: null }),
      });
      return;
    }

    if (path.includes("/push/vapid-public")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, publicKey: "test-key" }),
      });
      return;
    }

    await route.fulfill({
      status: method === "POST" ? 204 : 200,
      contentType: "application/json",
      body: method === "POST" ? "" : JSON.stringify({ ok: true }),
    });
  });
}

test.describe("user-story ledger browser smoke", () => {
  for (const story of STORY_ROUTES) {
    test(`${story.id}: ${story.path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(msg.text());
        }
      });

      await mockApi(page, story.auth ?? "user");
      await seedLocalStorage(page, story.storage ?? WARM_STORAGE);
      await page.goto(story.path, { waitUntil: "domcontentloaded" });
      await page
        .locator("main, [role='main'], [data-a11y-root], #root > *")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });

      const fatal = errors.filter(
        (error) =>
          !error.includes("Failed to load resource") &&
          !error.includes("workbox") &&
          !error.includes("Service worker"),
      );
      expect(fatal, `browser errors for ${story.id}`).toEqual([]);
    });
  }
});
