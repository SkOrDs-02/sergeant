import { test, expect } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

/**
 * Reduced-motion guard (WCAG 2.3.3) — design-audit F1.
 *
 * Під `prefers-reduced-motion: reduce` глобальний шар у `animations.css`
 * має колапсувати RESPONSE-анімації в opacity-fade (одноразово, 100 мс)
 * і зупиняти AMBIENT-loop-и. Тобто через секунду після маунту хаба
 * running CSS-АНІМАЦІЙ має бути ~0 (бюджет ≤ 2 на transient-хвіст).
 *
 * Рахуємо ЛИШЕ CSSAnimation: `document.getAnimations()` повертає й
 * CSSTransition-обʼєкти, а універсальне правило reduce-шару
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
  // Рейок модулів — перший блок головної під віссю дії (спека
  // `hub-action-axis.md`); до неї тут чекали заголовок сітки «Модулі».
  await expect(page.getByTestId("module-rail")).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(1_200);

  // Збираємо не лише ІМЕНА, а й носіїв. Самі імена нечитабельні: падіння
  // виглядало як «pulse, pulse, pulse» і не називало жодного елемента, тож
  // причину доводилось вгадувати. Тег + класи + псевдоелемент кажуть, який
  // саме скелетон не догас.
  const runningCssAnimations = await page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a) =>
          a.constructor.name === "CSSAnimation" && a.playState === "running",
      )
      .map((a) => {
        const name = (a as CSSAnimation).animationName;
        const effect = a.effect as KeyframeEffect | null;
        const el = effect?.target ?? null;
        const pseudo = effect?.pseudoElement ?? "";
        if (!el) return `${name}@<без елемента>${pseudo}`;
        const cls =
          typeof el.className === "string" ? el.className.slice(0, 120) : "";
        return `${name}@${el.tagName.toLowerCase()}${pseudo}[${cls}]`;
      }),
  );

  expect(
    runningCssAnimations.length,
    `Під prefers-reduced-motion бігли CSS-анімації: ${runningCssAnimations.join(", ")}`,
  ).toBeLessThanOrEqual(2);
});
