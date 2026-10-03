/**
 * Регресія: декоративний шар підписів атласа не має забирати тапи.
 *
 * `geometry.labels` малюється ОСТАННІМ у `<svg>` (виноска + `<circle>` у
 * центроїді + підпис у полі), тобто лежить над обома шарами мʼязів. Він
 * `aria-hidden`, але це ховає його лише від AT — на hit-testing не
 * впливає. Без `pointer-events: none` кружечок забирав тап рівно в центрі
 * групи: клік у середину грудей не обирав нічого (браузерний свіп
 * 2026-09-16).
 *
 * Чому саме такий замір, а не 44px-флор з `auditPage`: розширена зона
 * атласа зроблена ПРОЗОРИМ ШТРИХОМ (`atlasHitStroke`), а
 * `getBoundingClientRect()` тієї групи штрих не показує — свіп бачить
 * голий bbox мʼяза і рапортує «менше 44px» навіть коли зона працює. Тож
 * тут перевіряється те, що справді відчуває користувач: чи тап обирає
 * групу.
 */
import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { mockApi } from "./audit";

test("ATLAS: тап у центр групи мʼязів обирає саме її", async ({ page }) => {
  await mockApi(page);
  await seedFTUX(page, "post-ftux");
  await page.goto("/fizruk/atlas", { waitUntil: "domcontentloaded" });

  const svg = page.locator("svg[aria-label]").first();
  await svg.waitFor({ state: "visible", timeout: 15_000 });

  // Груди — показовий випадок: група з ДВОХ полігонів і проміжком між
  // половинами, тобто центр bbox лежить поза видимою заливкою. Саме на
  // ньому дефект і проявлявся.
  const chest = page.locator(
    'svg[aria-label] g[role="button"][aria-label="Груди"]',
  );
  await expect(chest).toHaveCount(1);

  const box = await chest.boundingBox();
  expect(box, "chest group must have a box").not.toBeNull();
  if (!box) return;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(
    page.locator('svg[aria-label] g[role="button"][aria-pressed="true"]'),
  ).toHaveAttribute("aria-label", "Груди");
});

test("ATLAS: декоративний шар підписів не перехоплює вказівник", async ({
  page,
}) => {
  await mockApi(page);
  await seedFTUX(page, "post-ftux");
  await page.goto("/fizruk/atlas", { waitUntil: "domcontentloaded" });
  await page
    .locator("svg[aria-label]")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });

  // Прямий інваріант замість наслідку: кожен `aria-hidden` шар підписів
  // усередині SVG атласа мусить бути інертним для вказівника. Ловить і ті
  // випадки, де кружечок випадково не збігся з центром групи.
  const interceptors = await page.evaluate(() => {
    const svg = document.querySelector("svg[aria-label]");
    if (!svg) return ["no svg"];
    const bad: string[] = [];
    for (const g of Array.from(
      svg.querySelectorAll<SVGGElement>('g[aria-hidden="true"]'),
    )) {
      // Шар підписів упізнаємо за наявністю виноски `<polyline>`.
      if (!g.querySelector("polyline")) continue;
      if (getComputedStyle(g).pointerEvents !== "none") {
        bad.push(g.getAttribute("class") ?? "<label layer>");
      }
    }
    return bad;
  });

  expect(
    interceptors,
    "шар підписів атласа мусить мати pointer-events: none",
  ).toEqual([]);
});
