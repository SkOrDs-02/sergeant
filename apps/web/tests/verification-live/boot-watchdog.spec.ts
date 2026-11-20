import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

// Обриваємо ВХІДНИЙ чанк (`index-*.js` зі `<script src>`; перший запит під
// цей патерн — саме він). До 2026-11-20 тут обривався `vendor-react`, але його
// тепер рятує `chunkReload` (одноразове перезавантаження з вхідного бандла) ще
// до сторожа: тест перестав перевіряти сторожа, а «контроль» — давати білий
// екран (прогін `full-2026-11-20`). Без вхідного чанка жоден JS застосунку не
// стартує, тож врятувати може лише інлайн-сторож з `index.html`.
test("boot-watchdog піднімає застосунок після обірваного вхідного чанка", async ({
  page,
}) => {
  let aborted = 0;
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    if (aborted === 0) {
      aborted++;
      await route.abort("aborted");
      return;
    }
    await route.continue();
  });
  let navigations = 0;
  page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);

  const t0 = Date.now();
  await page.goto("/", { waitUntil: "commit" });
  await expect
    .poll(
      () =>
        page
          .evaluate(
            () => document.getElementById("root")?.childElementCount ?? -1,
          )
          .catch(() => -2),
      {
        timeout: 40_000,
      },
    )
    .toBeGreaterThan(0);
  const stamp = await page.evaluate(() =>
    sessionStorage.getItem("sergeant.boot_watchdog_at"),
  );
  console.log(
    `[WD] aborted=${aborted} navigations=${navigations} mountedAfterMs=${Date.now() - t0} stamp=${stamp}`,
  );
  expect(aborted).toBe(1);
  expect(navigations).toBeGreaterThanOrEqual(2);
  expect(stamp).not.toBeNull();
});

test("контроль: без сторожа той самий обрив лишає білий екран", async ({
  page,
}) => {
  let aborted = 0;
  // Сторож тепер inline: «вимикаємо» його міткою cooldown (спрацює лише звіт).
  await page.addInitScript(() =>
    sessionStorage.setItem("sergeant.boot_watchdog_at", String(Date.now())),
  );
  await page.route(/\/assets\/index-[^/]*\.js$/, async (route) => {
    if (aborted === 0) {
      aborted++;
      await route.abort("aborted");
      return;
    }
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForTimeout(25_000);
  const children = await page.evaluate(
    () => document.getElementById("root")?.childElementCount ?? -1,
  );
  console.log(`[WD-control] aborted=${aborted} rootChildren=${children}`);
  expect(children).toBe(0);
});
