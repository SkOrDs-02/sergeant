import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { mockApi } from "./audit";

/**
 * Гейт на ОБРІЗКУ підпису в нижній навігації.
 *
 * Чому окремий спек, а не рядок у `mobile-ui-audit.spec.ts`: той свіп міряє
 * touch-targets (44px) і бічний overflow, і робить це на одній ширині — 393px
 * (Pixel 5). Обрізка підпису — інший клас дефекту й інша ширина: підпис може
 * різатись і там, де жоден бокс не переповнює viewport, бо `text-ellipsis`
 * ховає це за трьома крапками. Саме тому «Планування» в Фініку різалось на
 * ВСІХ ширинах, включно з 393, а свіп лишався зеленим (знахідка R1,
 * 2026-09-13).
 *
 * Що робить гейт. Для кожного нава: вмикає підпис усіх табів так, як його
 * бачить активний (`max-width: 100%`, `opacity: 1` — неактивні згорнуті в
 * `max-w-0` за задумом і без цього завжди «переповнювали» б), і порівнює
 * `scrollWidth` із `clientWidth`. Різниця > 1px = три крапки на екрані.
 *
 * Поріг 1px, не 0: subpixel-округлення `getBoundingClientRect` дає ±0.5px на
 * дробових ширинах колонки, і нульовий поріг червонив би від зміни шрифтового
 * рендера, а не від реального дефекту.
 *
 * Лікування дефекту — `visibleLabel` у відповідному `*Nav`-файлі (коротшає
 * ЛИШЕ видима копія, доступна назва лишається повною). НЕ послаблюй цей гейт
 * і не піднімай поріг: він існує рівно тому, що обрізку не ловив жоден інший.
 */

const TRUNCATION_TOLERANCE_PX = 1;

// 320px — найвужчий екран, який продукт обслуговує (iPhone SE 1-го покоління,
// бюджетні Android). 393px — Pixel 5, ширина основного свіпу: тримаємо її тут
// теж, щоб дефект на типовому телефоні не проліз повз обидва гейти.
const WIDTHS = [320, 393] as const;

const NAVS: ReadonlyArray<{ id: string; path: string }> = [
  { id: "HUB", path: "/" },
  { id: "FINYK", path: "/finyk" },
  { id: "FIZRUK", path: "/fizruk" },
  { id: "ROUTINE", path: "/routine" },
  { id: "NUTRITION", path: "/nutrition/menu" },
];

type Overflow = { text: string; scrollWidth: number; clientWidth: number };

test.describe("nav labels fit their column", () => {
  for (const nav of NAVS) {
    for (const width of WIDTHS) {
      test(`${nav.id} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 780 });
        await mockApi(page);
        await seedFTUX(page, "post-ftux");
        await page.goto(nav.path, { waitUntil: "domcontentloaded" });

        const labels = page.locator("[data-nav-label]");
        await expect(labels.first()).toBeAttached();

        const overflowing = await page.evaluate((tolerance) => {
          const found: Overflow[] = [];
          for (const el of Array.from(
            document.querySelectorAll<HTMLElement>("[data-nav-label]"),
          )) {
            // Розгортаємо підпис так, як його показує активний таб. Без цього
            // неактивні (`max-w-0`) рахувались би переповненими завжди.
            //
            // `transition: none` тут ОБОВ'ЯЗКОВЕ, і це не перестраховка:
            // на підписі висить `transition-[max-width,opacity]`, тож одразу
            // після присвоєння інлайн-стилю анімоване значення ще 0 — і замір
            // повертав `clientWidth: 0` для КОЖНОГО табу, тобто гейт червонив
            // усе підряд (перевірено прогоном, 10/10 упало). Читання
            // `scrollWidth` форсує лейаут, але не завершує перехід.
            // Пілюля теж мусить перейти в колонку. У НЕактивному стані вона
            // `flex-row`, тобто іконка й підпис ділять рядок, і підпису
            // лишається ~28px замість ~51 — розгорнувши лише сам підпис,
            // гейт міряв би лейаут, якого активний таб ніколи не показує
            // (перевірено: Фізрук червонів на 43px при реальних 67).
            const pill = el.parentElement;
            const prev = {
              max: el.style.maxWidth,
              opacity: el.style.opacity,
              transition: el.style.transition,
              dir: pill?.style.flexDirection ?? "",
            };
            el.style.transition = "none";
            el.style.maxWidth = "100%";
            el.style.opacity = "1";
            if (pill) pill.style.flexDirection = "column";
            const { scrollWidth, clientWidth } = el;
            el.style.maxWidth = prev.max;
            el.style.opacity = prev.opacity;
            el.style.transition = prev.transition;
            if (pill) pill.style.flexDirection = prev.dir;
            if (scrollWidth - clientWidth > tolerance) {
              found.push({
                text: el.textContent ?? "",
                scrollWidth,
                clientWidth,
              });
            }
          }
          return found;
        }, TRUNCATION_TOLERANCE_PX);

        expect(
          overflowing,
          overflowing.length
            ? `Підпис не влазить у колонку — на екрані буде три крапки. ` +
                `Скороти ВИДИМУ копію через \`visibleLabel\` у *Nav-файлі ` +
                `(доступна назва лишається повною): ` +
                overflowing
                  .map(
                    (o) =>
                      `«${o.text}» ${o.scrollWidth}px при ${o.clientWidth}px`,
                  )
                  .join("; ")
            : undefined,
        ).toEqual([]);
      });
    }
  }
});
