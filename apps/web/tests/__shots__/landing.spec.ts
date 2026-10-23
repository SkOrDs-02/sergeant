/**
 * Кадри hero лендінгу: Огляд Фініка й Огляд Рутини зі світу `landing-world`,
 * світла тема, 390 × 844. Пише webp просто в `apps/landing/public/screens`,
 * тож лендінг бере вигляд застосунку, а не малює його (спека
 * docs/work/specs/planning/redesign-v3-2.md § Лендінг). Не тест і не гейт.
 * Як запускати: README.md поруч.
 *
 * Status: Scaffolded
 */
import path from "node:path";
import { test, type Page } from "@playwright/test";
import sharp from "sharp";
import { applyScenario } from "../utils/scenario";
import { seedFTUX } from "../utils/seedFTUX";

const OUT =
  process.env["LANDING_OUT"] ?? path.resolve("../landing/public/screens");

/** Світ анонімний, тож банер «Дані лише на цьому пристрої» не належить кадру. */
async function dropAnonymousBanner(page: Page) {
  await page
    .getByRole("status")
    .filter({ hasText: "Дані лише на цьому пристрої" })
    .evaluateAll((els) => els.forEach((el) => el.remove()));
}

/** Огляд Фініка із заданим планом: без плану hero показує «Денний бюджет не задано». */
async function finykWithPlan(page: Page) {
  await applyScenario(page, "landing-world", "/finyk/budgets");
  await page.getByRole("button", { name: /^План на місяць/ }).click();
  await page.getByRole("button", { name: "Задати план", exact: true }).click();
  await page.getByLabel("План доходу").fill("60000");
  await page.getByLabel("План витрат").fill("45000");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.getByRole("button", { name: "Огляд", exact: true }).click();
  await page.waitForTimeout(1500);
  const hint = page.getByRole("button", { name: "Зрозуміло", exact: true });
  if (await hint.isVisible().catch(() => false)) await hint.click();
}

const FRAMES: Array<[string, (page: Page) => Promise<void>]> = [
  ["hero-finyk", finykWithPlan],
  ["hero-routine", (page) => applyScenario(page, "landing-world", "/routine")],
];

for (const [name, open] of FRAMES) {
  test(`landing ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await seedFTUX(page, "post-ftux", { theme: "light" });
    await open(page);
    const decline = page.getByRole("button", { name: "Ні, дякую" });
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await dropAnonymousBanner(page);
    await page.waitForTimeout(1500);
    const png = await page.screenshot();
    await sharp(png).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
  });
}
