import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

/**
 * Reduced-motion guard (Hard Rule #17, WCAG 2.3.3) — design-audit F1.
 *
 * Під `prefers-reduced-motion: reduce` глобальний шар у `animations.css`
 * має колапсувати RESPONSE-анімації в opacity-fade (одноразово, 100 мс)
 * і зупиняти AMBIENT-loop-и. Тобто через секунду після маунту хаба
 * running CSS-АНІМАЦІЙ має бути ~0 (бюджет ≤ 2 на transient-хвіст).
 *
 * Рахуємо ЛИШЕ CSSAnimation: `document.getAnimations()` повертає й
 * CSSTransition-об'єкти, а універсальне правило reduce-шару
 * (`transition-duration: 100ms` на `*`) породжує сотні короткоживучих
 * scrollbar-color-транзишнів на маунті — це кольорові інтерполяції без
 * руху, не motion (зафіксовано в аудиті 2026-07 як false positive).
 */
test.use({ reducedMotion: "reduce" });

test("@critical a11y: reduced-motion зупиняє анімації хаба (≤ 2 running)", async ({
  page,
}) => {
  await seedFTUX(page, "post-ftux");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Дочекатись маунту хаба, потім дати reduce-шару догасити fade-и.
  // «Модулі» — заголовок сітки HubModulesGrid (в UI капслочиться через CSS).
  await expect(page.getByText("Модулі", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(1_200);

  const runningCssAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.constructor.name === "CSSAnimation" && a.playState === "running",
        )
        .map((a) => (a as CSSAnimation).animationName), // імена — у повідомлення асерта
  );

  expect(
    runningCssAnimations.length,
    `Під prefers-reduced-motion бігли CSS-анімації: ${runningCssAnimations.join(", ")}`,
  ).toBeLessThanOrEqual(2);
});
