/**
 * Кадри лендінгу: hero головної (Огляд Фініка й Огляд Рутини) і по кадру на
 * сторінку кожного модуля та «Звʼязків». Світла тема, 390 × 844. Пише webp
 * просто в `apps/landing/public/screens`, тож лендінг бере вигляд
 * застосунку, а не малює його (спека
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

// Годинник пристрою в Києві, як у користувача. На UTC-хості біля
// півночі Фінік (київська доба) і Рутина (доба пристрою) розходились на
// день, і картка звʼязку на «Звʼязках» зникала.
test.use({ timezoneId: "Europe/Kyiv" });

const OUT =
  process.env["LANDING_OUT"] ?? path.resolve("../landing/public/screens");

/** Світ анонімний, тож банер «Дані лише на цьому пристрої» не належить кадру. */
async function dropAnonymousBanner(page: Page) {
  await page
    .getByRole("status")
    .filter({ hasText: "Дані лише на цьому пристрої" })
    .evaluateAll((els) => els.forEach((el) => el.remove()));
}

/**
 * Сід світу пишеться в чергу синхронізації, а бекенду в знімальному прогоні
 * немає, тож у шапці висить кнопка «Синхронізація · N в черзі». У живого
 * користувача черга порожня, і кнопки там немає.
 */
async function dropSyncQueueButton(page: Page) {
  // Стилем, а не видаленням вузла: шапка перемальовує кнопку при кожному
  // тіку черги, і видалений вузол повертається ще до кадру.
  await page.addStyleTag({
    content:
      'button[aria-label^="Синхронізація"] { display: none !important; }',
  });
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

/**
 * Денний звіт Рутини за вчора: у світі `routine-streaks` звичка «Розтяжка»
 * вчора пропущена з причиною, тож звіт показує і виконані, і пропуск, який
 * не ламає серію. Сьогодні пропуску немає, тому спершу обираємо вчорашній
 * день у стрічці тижня.
 */
async function routineDayReport(page: Page) {
  await applyScenario(page, "routine-streaks", "/routine");
  const week = page.getByRole("group", { name: "Тиждень" });
  const days = week.getByRole("button");
  await week.getByRole("button", { name: /\(сьогодні\)$/ }).waitFor();
  const labels = await days.evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  const today = labels.findIndex((l) => l.endsWith("(сьогодні)"));
  if (today > 0) {
    await days.nth(today - 1).click();
  } else {
    // Сьогодні понеділок: учора лежить у попередньому тижні.
    await page.getByRole("button", { name: "Попередній тиждень" }).click();
    await days.last().click();
  }
  await page.getByRole("button", { name: /денного звіту/ }).click();
  await page.getByRole("dialog").waitFor();
}

const FRAMES: Array<[string, (page: Page) => Promise<void>]> = [
  ["hero-finyk", finykWithPlan],
  ["hero-routine", (page) => applyScenario(page, "landing-world", "/routine")],
  ["finyk", finykWithPlan],
  ["nutrition", (page) => applyScenario(page, "nutrition-day", "/nutrition")],
  ["routine", routineDayReport],
  [
    "fizruk",
    (page) =>
      applyScenario(page, "landing-world", "/fizruk/workout/e2e-workout-full"),
  ],
  ["zvyazky", (page) => applyScenario(page, "landing-world", "/?tab=reports")],
];

const ONLY = process.env["LANDING_ONLY"]?.split(",");

for (const [name, open] of FRAMES) {
  if (ONLY && !ONLY.includes(name)) continue;
  test(`landing ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await seedFTUX(page, "post-ftux", { theme: "light" });
    await open(page);
    const decline = page.getByRole("button", { name: "Ні, дякую" });
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await dropAnonymousBanner(page);
    await dropSyncQueueButton(page);
    await page.waitForTimeout(1500);
    const png = await page.screenshot();
    await sharp(png).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
  });
}
