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

// AI-DANGER: емуляцію вмикає `contextOptions.reducedMotion`, а НЕ
// `test.use({ reducedMotion })`.
//
// `reducedMotion` не є тест-опцією Playwright (у `@playwright/test` 1.61.1 з
// lockfile серед опцій контексту є `colorScheme`, `locale`, `viewport` тощо,
// а `reducedMotion` і `forcedColors` немає). Тож
// `test.use({ reducedMotion: "reduce" })` не давало ні помилки, ні
// попередження, а просто нічого не робило: `matchMedia` на reduce лишався
// `false`, і хаб міряли БЕЗ емуляції. Це видно і в trace впалого CI-прогону:
// у `context-options` є `colorScheme`, але немає `reducedMotion`.
//
// Звідси флейк у PR #1272, #1276, #1277. Без емуляції `motion-safe:` діє, а
// reduce-шар не підміняє keyframes, тож бюджет «≤ 2» залежав не від CSS, а від
// секунди заміру: приблизно на 4-й секунді після завантаження сервіс-воркер
// добігає з install і зʼявляється тост «Додаток готовий до роботи офлайн»
// (`toast-countdown`). Разом зі скелетоном `motion-safe:animate-pulse` і
// `fadeIn` кнопки це давало 3 > 2. Усі три мали оригінальні імена keyframes,
// а не `rm-opacity-fade`, чого під справжнім reduce бути не може.
//
// `contextOptions` ЗАМІНЮЄ, а не доповнює `contextOptions` з конфігу. Зараз
// `playwright.smoke.config.ts` їх не задає; зʼявляться там — перенеси їх сюди.
test.use({ contextOptions: { reducedMotion: "reduce" } });

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

  // Один `evaluate` на передумову й замір: матчимо `matchMedia` у тому самому
  // JS-таску, де читаємо `getAnimations()`, тож «емуляція була активна» і
  // «ось що бігло» стосуються однієї миті, а не двох різних.
  //
  // Збираємо не лише ІМЕНА, а й носіїв. Самі імена нечитабельні: падіння
  // виглядало як «pulse, pulse, pulse» і не називало жодного елемента, тож
  // причину доводилось вгадувати. Тег + класи + псевдоелемент кажуть, який
  // саме скелетон не догас.
  const { reduceMatches, runningCssAnimations } = await page.evaluate(() => ({
    reduceMatches: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    runningCssAnimations: document
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
  }));

  // Передумова йде ПЕРЕД бюджетом. Без неї тест можна пройти (або завалити),
  // так і не перевіривши reduce-шар: саме так він і працював, поки опція не
  // діяла. Падіння тут означає зламану ЕМУЛЯЦІЮ в тесті, а не CSS: дивись
  // `contextOptions.reducedMotion` вище, а не `animations.css`.
  expect(
    reduceMatches,
    "Передумова не виконана: сторінка не бачить prefers-reduced-motion: reduce. " +
      "Це збій емуляції в самому тесті (`contextOptions.reducedMotion` не " +
      "діє), а не регрес CSS у `animations.css`. Бюджет анімацій нижче без " +
      "емуляції нічого не доводить, тому його не перевіряємо.",
  ).toBe(true);

  expect(
    runningCssAnimations.length,
    `Під prefers-reduced-motion бігли CSS-анімації: ${runningCssAnimations.join(", ")}`,
  ).toBeLessThanOrEqual(2);
});
