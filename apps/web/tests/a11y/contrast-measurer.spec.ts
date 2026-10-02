/**
 * Регресія самого вимірювача `tests/utils/contrastSurfaces.ts` (не додатка):
 * `gradientBackdrops` мусить складати з градієнтом-предком і напівпрозорі
 * заливки МІЖ ним та елементом.
 *
 * Status: Active. Знахідка CodeRabbit на #1317: кнопка «Зрозуміло» підказки
 * `MonthStrip` лежить у блоці `bg-hero-ink/5` усередині hero-градієнта, а
 * вимірювач брав голі зупинки градієнта й завищував контраст кільця
 * (5.22 проти ≈4.7). Знахідка CodeRabbit на #1320: `opacity` обгортки
 * притушує не лише фон, а й саме кільце, тож кільце мусить лягати на зупинку
 * з груповою альфою (кейс `faded`). Тест статичний: власна розмітка через `setContent`, без
 * бекенду й світів, тож не залежить від стану додатка.
 */
import { expect, test } from "@playwright/test";

import { measureFocusInPage } from "../utils/contrastSurfaces";

const RING = "#fdf9f3";
const STOPS = ["#115e59", "#0f766e"] as const;
// 50% замість реальних 5%: різниця має бути помітною на кроці 0.05, а не
// ховатись у допуску порівняння.
const WASH = { r: 253, g: 249, b: 243, a: 0.5 } as const;
// Вкладені групи: темне кільце на білій заливці батька. Колір кільця тут
// навмисно інший, ніж заливка: з однаковими кольорами злипла й правильна
// моделі дають майже одне число (1.32 проти 1.33) і тест їх не розрізнив би.
const DARK_RING = "#000000";
const VEIL_A = 0.9;

type Rgb = readonly [number, number, number];

const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const rgbOf = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b };
};

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` з альфою поверх непрозорого `bottom`. */
function over(
  top: { r: number; g: number; b: number; a: number },
  bottom: Rgb,
): Rgb {
  return [
    top.r * top.a + bottom[0] * (1 - top.a),
    top.g * top.a + bottom[1] * (1 - top.a),
    top.b * top.a + bottom[2] * (1 - top.a),
  ];
}

const HTML = `
<style>
  body { margin: 0; background: #e7e5df; }
  .hero { width: 300px; padding: 24px; background-image: linear-gradient(135deg, ${STOPS[0]}, ${STOPS[1]}); }
  .wash { padding: 8px; border-radius: 8px; background-color: rgba(${WASH.r}, ${WASH.g}, ${WASH.b}, ${WASH.a}); }
  .fade { opacity: 0.5; }
  .veil { padding: 8px; border-radius: 8px; background-color: rgba(255, 255, 255, ${VEIL_A}); }
  button { width: 44px; height: 44px; border: 0; background: none; outline: 3px solid ${RING}; outline-offset: 0; }
  #nested { outline-color: ${DARK_RING}; }
</style>
<div class="hero"><button id="bare" aria-label="без обгортки"></button></div>
<div class="hero"><div class="wash"><button id="washed" aria-label="в напівпрозорій обгортці"></button></div></div>
<div class="hero"><div class="wash fade"><button id="faded" aria-label="обгортка з opacity предка"></button></div></div>
<div class="hero"><div class="veil fade"><button id="nested" class="fade" aria-label="вкладені групи opacity"></button></div></div>
`;

test.describe("вимірювач: градієнт-предок із проміжною напівпрозорою заливкою", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(HTML);
  });

  async function measure(page: import("@playwright/test").Page, id: string) {
    await page.focus(`#${id}`);
    const f = await page.evaluate(measureFocusInPage);
    expect(f, `вимірювач нічого не повернув для #${id}`).not.toBeNull();
    expect(f!.mechanism).toBe("outline");
    expect(f!.ratio).not.toBeNull();
    return f!.ratio!;
  }

  /**
   * Найгірший коефіцієнт кільця проти зупинок з опційною обгорткою.
   * `outlineAlpha` — непрозорість групи, у якій лежить кільце: група
   * притушує й саме кільце, тож воно лягає на зупинку з цією альфою.
   */
  function expected(wash: { a: number } | null, outlineAlpha = 1): number {
    return Math.min(
      ...STOPS.map((stop) => {
        const base = hexToRgb(stop);
        const bg = wash ? over({ ...WASH, a: wash.a }, base) : base;
        const fg = over({ ...rgbOf(RING), a: outlineAlpha }, base);
        return contrast(fg, bg);
      }),
    );
  }

  test("без обгортки — голі зупинки градієнта (контрольний випадок)", async ({
    page,
  }) => {
    const got = await measure(page, "bare");
    expect(got).toBeCloseTo(expected(null), 1);
  });

  test("напівпрозора обгортка між градієнтом і кнопкою входить у виміряний фон", async ({
    page,
  }) => {
    const bare = await measure(page, "bare");
    const washed = await measure(page, "washed");
    // Світла заливка 50% освітлює фон під світлим кільцем: контраст падає.
    // До виправлення вимірювач ігнорував обгортку й повертав bare.
    expect(washed).toBeLessThan(bare - 1);
    expect(washed).toBeCloseTo(expected({ a: WASH.a }), 1);
  });

  test("opacity обгортки множить її альфу (накопичена непрозорість)", async ({
    page,
  }) => {
    const faded = await measure(page, "faded");
    // Фон: 0.5 (альфа заливки) × 0.5 (opacity обгортки) = 0.25. Кільце
    // лежить у тій самій групі, тож теж притушене до 0.5 — на екрані ≈1.6:1,
    // а не ≈4 (знахідка CodeRabbit на #1320: раніше кільце бралось
    // непрозорим проти притушеного фону).
    expect(faded).toBeLessThan(3);
    expect(faded).toBeCloseTo(expected({ a: WASH.a * 0.5 }, 0.5), 1);
  });

  test("вкладені групи opacity складаються кожна окремо", async ({ page }) => {
    // Батько: біла заливка 0.9 і opacity 0.5; кнопка всередині теж 0.5.
    // Браузер спершу кладе кільце (0.5) на заливку батька, і лише ЦЕЙ вміст
    // множить на 0.5 батька; сама заливка батька притушена тільки до 0.45.
    // Злиплий добуток 0.25 притушував заливку двічі і давав ≈2.33 замість
    // ≈2.17 (друга знахідка CodeRabbit на #1320). Еталон рахується тут
    // напряму за моделлю CSS Compositing, незалежно від вимірювача.
    const nested = await measure(page, "nested");
    const ring = { ...rgbOf(DARK_RING), a: 1 };
    const veil = { r: 255, g: 255, b: 255, a: VEIL_A };
    const want = Math.min(
      ...STOPS.map((stop) => {
        const base = hexToRgb(stop);
        // Група батька: кільце × 0.5 поверх заливки, у прозорому буфері.
        const ringA = ring.a * 0.5;
        const groupA = ringA + veil.a * (1 - ringA);
        const groupRgb = (k: "r" | "g" | "b") =>
          (ring[k] * ringA + veil[k] * veil.a * (1 - ringA)) / groupA;
        const fg = over(
          {
            r: groupRgb("r"),
            g: groupRgb("g"),
            b: groupRgb("b"),
            a: groupA * 0.5,
          },
          base,
        );
        const bg = over({ ...veil, a: veil.a * 0.5 }, base);
        return contrast(fg, bg);
      }),
    );
    expect(nested).toBeCloseTo(want, 1);
  });
});
