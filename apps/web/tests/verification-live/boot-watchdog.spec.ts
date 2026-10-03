import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("boot-watchdog піднімає застосунок після обірваного vendor-чанка", async ({
  page,
}) => {
  let aborted = 0;
  await page.route(/\/assets\/vendor-react-[^/]*\.js$/, async (route) => {
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
  await page.route(/\/boot-watchdog\.js$/, (route) => route.abort("aborted"));
  await page.route(/\/assets\/vendor-react-[^/]*\.js$/, async (route) => {
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
