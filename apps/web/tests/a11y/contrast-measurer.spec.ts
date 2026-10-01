/**
 * Регресія самого вимірювача `tests/utils/contrastSurfaces.ts` (не додатка):
 * `gradientBackdrops` мусить складати з градієнтом-предком і напівпрозорі
 * заливки МІЖ ним та елементом.
 *
 * Status: Active. Знахідка CodeRabbit на #1317: кнопка «Зрозуміло» підказки
 * `MonthStrip` лежить у блоці `bg-hero-ink/5` усередині hero-градієнта, а
 * вимірювач брав голі зупинки градієнта й завищував контраст кільця
 * (5.22 проти ≈4.7). Тест статичний: власна розмітка через `setContent`, без
 * бекенду й світів, тож не залежить від стану додатка.
 */
import { expect, test } from "@playwright/test";

import { measureFocusInPage } from "../utils/contrastSurfaces";

const RING = "#fdf9f3";
const STOPS = ["#115e59", "#0f766e"] as const;
// 50% замість реальних 5%: різниця має бути помітною на кроці 0.05, а не
// ховатись у допуску порівняння.
const WASH = { r: 253, g: 249, b: 243, a: 0.5 } as const;

type Rgb = readonly [number, number, number];

const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

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
  button { width: 44px; height: 44px; border: 0; background: none; outline: 3px solid ${RING}; outline-offset: 0; }
</style>
<div class="hero"><button id="bare" aria-label="без обгортки"></button></div>
<div class="hero"><div class="wash"><button id="washed" aria-label="в напівпрозорій обгортці"></button></div></div>
<div class="hero"><div class="wash fade"><button id="faded" aria-label="обгортка з opacity предка"></button></div></div>
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

  /** Найгірший коефіцієнт кільця проти зупинок з опційною обгорткою. */
  function expected(wash: { a: number } | null): number {
    return Math.min(
      ...STOPS.map((stop) => {
        const base = hexToRgb(stop);
        const bg = wash ? over({ ...WASH, a: wash.a }, base) : base;
        return contrast(hexToRgb(RING), bg);
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
    // 0.5 (альфа заливки) × 0.5 (opacity обгортки) = 0.25.
    expect(faded).toBeCloseTo(expected({ a: WASH.a * 0.5 }), 1);
  });
});
