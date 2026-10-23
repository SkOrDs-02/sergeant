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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Лічильник `addActionsPerRoute` (redesign v3.2 § Гейти): видимі кнопки з
 * текстом, що починається з «Додати» або «+», на маршрут. Статично по JSX
 * це не порахувати, тож число бере знімальний прогін і пише у файл, який
 * читає `scripts/check-ui-canon-ratchet.mjs`. Лише світла тема: розмітка
 * обох тем однакова. Воркер один (`playwright.shots.config.ts`), тож
 * читати-дописувати файл між тестами безпечно.
 */
const ADD_OUT = process.env["ADD_ACTIONS_OUT"];
async function recordAddActions(page: Page, name: string) {
  if (!ADD_OUT) return;
  // «+ Актив» - дія, «+250» / «+ 250 мл» - сума швидкого вводу, не дія
  // «Додати»: після «+» має йти слово (redesign v3.2, PR2).
  // Під відкритим модальним аркушем фон інертний: рахуємо лише в ньому.
  const texts = await page.evaluate(() =>
    Array.from(
      (
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"][aria-modal="true"]',
          ),
        ).at(-1) ?? document
      ).querySelectorAll("button"),
    )
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const text = (b.innerText || "").trim();
        return (
          r.width > 0 && r.height > 0 && /^(Додати|\+\s*\p{L})/u.test(text)
        );
      })
      .map((b) => (b.innerText || "").trim().replace(/\s+/g, " ")),
  );
  if (texts.length > 1) console.log(`addActions ${name}: ${texts.join(" | ")}`);
  const count = texts.length;
  const prev = existsSync(ADD_OUT)
    ? (JSON.parse(readFileSync(ADD_OUT, "utf8")) as Record<string, number>)
    : {};
  prev[name] = count;
  const sorted = Object.fromEntries(
    Object.entries(prev).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(ADD_OUT, JSON.stringify(sorted, null, 2) + "\n");
}

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
      if (scheme === "light") await recordAddActions(page, name);
    });
  }
}
