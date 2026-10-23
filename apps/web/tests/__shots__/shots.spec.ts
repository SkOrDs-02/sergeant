/**
 * Знімальний сценарій інвентарю редизайну v3.1: 31 маршрут і аркуш, 390 × 844,
 * світла й темна. Не тест і не гейт: асертів немає, лише кадри для порівняння
 * «до / після» (спека docs/work/specs/planning/redesign-v3-1.md § Верифікація).
 * Як запускати: README.md поруч.
 *
 * Паузи (`waitForTimeout`) тут навмисні: кадр має зловити екран після
 * анімацій і лінивих чанків, а асерту, на який можна було б чекати, у
 * знімального прогону немає.
 *
 * Status: Scaffolded
 */
import { test, type Page } from "@playwright/test";
import { applyScenario } from "../utils/scenario";
import { seedFTUX } from "../utils/seedFTUX";

const OUT = process.env["SHOTS_OUT"] ?? "test-results/shots";
type Step = (page: Page) => Promise<void>;
const pause = (page: Page) => page.waitForTimeout(900);
const click =
  (name: string | RegExp, exact = false): Step =>
  async (page) => {
    await page.getByRole("button", { name, exact }).first().click();
    await pause(page);
  };
const addThen =
  (row: RegExp): Step =>
  async (page) => {
    await page
      .getByTestId("corner-action")
      .getByRole("button", { name: "Додати" })
      .click();
    await pause(page);
    await page
      .getByTestId("add-sources")
      .getByRole("button", { name: row })
      .click();
    await pause(page);
  };
const scrollEnd: Step = async (page) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("*"))) {
        if (
          el.scrollHeight > el.clientHeight + 10 &&
          /auto|scroll/.test(getComputedStyle(el).overflowY)
        )
          el.scrollTop = el.scrollHeight;
      }
    });
    await page.waitForTimeout(700);
  }
};

type World = Parameters<typeof applyScenario>[1];
const ROUTES: Array<[string, World, string, Step?]> = [
  ["hub", "finyk-month", "/"],
  ["hub-end", "finyk-month", "/", scrollEnd],
  ["hub-reports", "finyk-month", "/?tab=reports"],
  ["hub-settings", "finyk-month", "/?tab=settings"],
  ["finyk", "finyk-month", "/finyk"],
  ["finyk-end", "finyk-month", "/finyk", scrollEnd],
  ["finyk-tx", "finyk-month", "/finyk/transactions"],
  ["finyk-analytics", "finyk-month", "/finyk/analytics"],
  ["finyk-analytics-end", "finyk-month", "/finyk/analytics", scrollEnd],
  ["finyk-budgets", "finyk-month", "/finyk/budgets"],
  ["finyk-assets", "finyk-month", "/finyk/assets"],
  ["finyk-expense-form", "finyk-month", "/finyk", addThen(/^Вручну/)],
  [
    "finyk-expense-form-end",
    "finyk-month",
    "/finyk",
    async (p) => {
      await addThen(/^Вручну/)(p);
      await scrollEnd(p);
    },
  ],
  ["nutrition", "nutrition-day", "/nutrition"],
  ["nutrition-log", "nutrition-day", "/nutrition/log"],
  ["nutrition-pantry", "nutrition-day", "/nutrition/pantry"],
  ["nutrition-menu", "nutrition-day", "/nutrition/menu"],
  [
    "nutrition-meal-form",
    "nutrition-day",
    "/nutrition",
    addThen(/^Ввести вручну/),
  ],
  ["nutrition-meal-search", "nutrition-day", "/nutrition", addThen(/^Пошук/)],
  ["routine", "routine-streaks", "/routine"],
  ["routine-end", "routine-streaks", "/routine", scrollEnd],
  ["routine-habits", "routine-streaks", "/routine/habits"],
  ["routine-stats", "routine-streaks", "/routine/stats"],
  [
    "routine-new-habit",
    "routine-streaks",
    "/routine",
    click("Нова звичка", true),
  ],
  ["fizruk", "fizruk-active-session", "/fizruk"],
  ["fizruk-workouts", "fizruk-active-session", "/fizruk/workouts"],
  ["fizruk-progress", "fizruk-active-session", "/fizruk/progress"],
  ["fizruk-body", "fizruk-active-session", "/fizruk/body"],
  ["fizruk-plan", "fizruk-active-session", "/fizruk/plan"],
  ["empty-finyk", "empty", "/finyk"],
  ["empty-nutrition", "empty", "/nutrition/log"],
];

const only = process.env["SHOTS_ONLY"];
for (const scheme of ["light", "dark"] as const) {
  for (const [name, world, path, step] of ROUTES) {
    if (only && !only.split(",").includes(name)) continue;
    test(`${name} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await seedFTUX(page, "post-ftux", { theme: scheme });
      await applyScenario(page, world, path);
      const decline = page.getByRole("button", { name: "Ні, дякую" });
      if (await decline.isVisible().catch(() => false)) await decline.click();
      await page.waitForTimeout(1500);
      if (step) await step(page);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
    });
  }
}
