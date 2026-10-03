/**
 * Регресійний гейт нетекстового контрасту (WCAG 1.4.11): межі полів і треки
 * перемикачів ≥3:1, індикатор фокусу по Tab ≥3:1 і без «голих» зупинок.
 *
 * Status: Active. Дзеркало повного аудиту `contrast-surfaces.audit.ts`, але
 * лише на екранах без бекенду й світу (як `axe.spec.ts`) і лише на метриках,
 * які токенний фікс 2026-10-01 довів до зеленого (знахідки A1-A3 аудиту
 * `docs/work/specs/audits/2026-10-01-contrast-and-surfaces-audit.md`) і
 * follow-up того ж дня (A4: стани вибору модуля — плитки `/welcome`;
 * окремий блок унизу; тиждень Рутини без світу з даними не рендериться, його
 * тримає юніт-тест `WeekDayStrip.test.tsx`). hero-ink A9 тримають храповик
 * `heroInkAlpha` = 0 і `contrast.test.js`: сюди його не тягнемо, бо для
 * hero-тексту потрібен світ із даними, а гейт без нього був би порожнім.
 *
 * Метрики й пороги — у шапці `tests/utils/contrastSurfaces.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  measureFocusInPage,
  measureInPage,
  type FocusFinding,
} from "../utils/contrastSurfaces";
import { seedFTUX } from "../utils/seedFTUX";

type Theme = "light" | "dark";

const SURFACES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "hub", path: "/" },
  { name: "settings", path: "/?tab=settings" },
  { name: "nutrition-plan", path: "/nutrition/menu/plan" },
  { name: "sign-in", path: "/sign-in" },
];

const MAX_TABS = 14;

/** Те саме очікування «тиші», що в `axe.spec.ts`: ліниві чанки й анімації. */
async function settle(page: Page, quietMs = 300) {
  await page.evaluate(async (ms: number) => {
    const deadline = performance.now() + 4_000;
    const quiet = (t: number) =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(done, t);
        const mo = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, t);
        });
        mo.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["class", "style"],
        });
        function done() {
          clearTimeout(timer);
          mo.disconnect();
          resolve();
        }
      });
    for (let pass = 0; pass < 5; pass++) {
      const budget = deadline - performance.now();
      if (budget <= 0) return;
      await Promise.race([
        quiet(ms),
        new Promise((resolve) => setTimeout(resolve, budget)),
      ]);
      const pending = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        );
      if (pending.length === 0) return;
      const left = deadline - performance.now();
      if (left <= 0) return;
      await Promise.race([
        Promise.all(pending.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, left)),
      ]);
    }
  }, quietMs);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { name, path } of SURFACES) {
    test(`non-text contrast: ${name} [${theme}] — поля, треки, фокус ≥ 3:1`, async ({
      page,
    }) => {
      await seedFTUX(page, "post-ftux", {
        theme,
        extra: { hub_theme_v2: theme },
      });
      await page.addInitScript((t: string) => {
        if (t === "dark") document.documentElement.classList.add("dark");
      }, theme);

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => undefined);
      await page
        .locator("main, [role='main'], [data-a11y-root], #root > *")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await settle(page);
      // Автофокус на полі змінює його межу на focus-стан: міряємо спокій.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur?.(),
      );
      // Після blur колір межі ще 220 мс доїжджає з focus-стану (CSS
      // transition): без цього очікування `sign-in` міряв проміжні 2.78:1.
      await settle(page, 150);

      // 1) Межі полів і треки перемикачів (без підписаних radio-кнопок:
      //    їх впізнає текст, а не контур — advisory, не WCAG 1.4.11).
      const measure = await page.evaluate(measureInPage, {});
      const failingBoundaries = measure.boundary.filter(
        (b) =>
          (b.kind === "field" || b.kind === "toggle") &&
          !b.uncertain &&
          b.detail["role"] !== "radio" &&
          b.ratio < b.required,
      );
      expect(
        failingBoundaries.map((b) => `${b.kind} ${b.ratio} ${b.sel}`),
        `поля/треки нижче 3:1 на ${path} [${theme}]`,
      ).toEqual([]);

      // 2) Індикатор фокусу: кожна зупинка має кільце/контур ≥3:1.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur?.(),
      );
      const stops: FocusFinding[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press("Tab");
        await settle(page, 100);
        const stop = await page.evaluate(measureFocusInPage);
        if (!stop) continue;
        const key = `${stop.sel}|${stop.rect.x}|${stop.rect.y}`;
        if (seen.has(key)) break;
        seen.add(key);
        stops.push(stop);
      }
      expect(stops.length, `жодної зупинки Tab на ${path}`).toBeGreaterThan(0);
      const failingFocus = stops.filter(
        (s) =>
          s.mechanism === "none" ||
          s.mechanism === "ua-auto" ||
          (s.ratio !== null && s.ratio < s.required),
      );
      expect(
        failingFocus.map(
          (s) => `${s.mechanism} ${s.ratio} ${s.sel} | ${s.raw.slice(0, 90)}`,
        ),
        `зупинки Tab без індикатора ≥3:1 на ${path} [${theme}]`,
      ).toEqual([]);
    });
  }
}

/**
 * A4 (follow-up аудиту 2026-10-01): обраний стан (`aria-pressed/selected/
 * checked/current`) відрізняється від сусіда ≥3:1 — «тонований фон + контур
 * `{module}-edge`». Екран, де вибір живе поза спільними примітивами й
 * рендериться без бекенду та світу: плитки модулів на `/welcome`
 * (`WelcomeModulePicker`, усі чотири обрані за замовчуванням).
 */
const STATE_SURFACES: ReadonlyArray<{
  name: string;
  path: string;
  mode: "post-ftux" | "cold";
}> = [{ name: "welcome-tiles", path: "/welcome", mode: "cold" }];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { name, path, mode } of STATE_SURFACES) {
    test(`non-text contrast: ${name} [${theme}] — стани вибору ≥ 3:1`, async ({
      page,
    }) => {
      await seedFTUX(page, mode, {
        theme,
        extra: { hub_theme_v2: theme },
      });
      await page.addInitScript((t: string) => {
        if (t === "dark") document.documentElement.classList.add("dark");
      }, theme);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => undefined);
      // Ліниві чанки `/welcome` приходять після `networkidle` (скелет із
      // `SuspenseWithMinDelay`): чекаємо саме на контрол із станом вибору, а
      // не на «тишу» DOM, яка настає ще на скелеті.
      await page
        .locator("button[aria-pressed]")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
      await settle(page);

      const measure = await page.evaluate(measureInPage, {});
      const states = measure.boundary.filter(
        (b) => b.kind === "state" && !b.uncertain,
      );
      // Порожній набір означав би, що екран перестав бути перевіркою.
      expect(states.length, `жодного стану вибору на ${path}`).toBeGreaterThan(
        0,
      );
      expect(
        states
          .filter((b) => b.ratio < b.required)
          .map((b) => `state ${b.ratio} ${b.sel}`),
        `стани вибору нижче 3:1 на ${path} [${theme}]`,
      ).toEqual([]);
    });
  }
}
