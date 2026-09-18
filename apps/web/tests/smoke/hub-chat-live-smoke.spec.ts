import { expect, test, type Page } from "@playwright/test";

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
    for (const [key, value] of Object.entries(entries)) {
      window.localStorage.setItem(key, value);
    }
  }, SEEDED_LS);
}

test("@live-chat hub-chat: sends a real prompt and renders assistant reply", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedLocalStorage(page);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  const chatRegion = page
    .getByRole("region")
    .filter({ has: page.locator("#hub-chat-title") });
  await expect(chatRegion).toBeVisible({ timeout: 10_000 });

  const input = page.getByLabel("Повідомлення асистенту");
  const speakButtons = page.getByRole("button", {
    name: "Озвучити відповідь",
  });
  const initialReplyCount = await speakButtons.count();

  await input.fill(
    "Відповідай одним коротким реченням українською: live QA ping.",
  );

  const chatResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/chat") && response.request().method() === "POST"
      );
    },
    { timeout: 90_000 },
  );

  await page.getByRole("button", { name: "Надіслати" }).click();

  const response = await chatResponse;
  expect(response.status(), "POST /api/chat status").toBe(200);

  await expect(speakButtons).toHaveCount(initialReplyCount + 1, {
    timeout: 90_000,
  });

  const fatal = errors.filter(
    (error) =>
      !error.includes("Failed to load resource") &&
      !error.includes("workbox") &&
      !error.includes("Service worker"),
  );
  expect(fatal).toEqual([]);
});
