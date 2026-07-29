/**
 * Генератор og-картинки (1200×630) для соцмереж.
 *
 * Картинка комітиться в `public/og.png` — скрипт потрібен лише щоб її можна
 * було відтворити після зміни копірайту чи токенів, а не на кожен білд.
 * Запуск: `node scripts/generate-og.mjs` з `apps/landing`.
 *
 * Кольори беруться з `@sergeant/design-tokens`, а не дублюються рядками —
 * інакше картинка тихо розійшлася б із сайтом при наступному ребренді.
 * Шрифт вшивається data-URI, бо сторінка рендериться без мережі.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const { brandColors, inkTheme, moduleColors } =
  await import("@sergeant/design-tokens/tokens");

const fontDir = path.join(
  path.dirname(require.resolve("@fontsource-variable/manrope/package.json")),
  "files",
);
const b64 = (f) => readFileSync(path.join(fontDir, f)).toString("base64");
const FACE = (subset, range) => `
@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 400 800;
  src: url(data:font/woff2;base64,${b64(`manrope-${subset}-wght-normal.woff2`)}) format("woff2");
  unicode-range: ${range};
}`;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
${FACE("cyrillic", "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116")}
${FACE("latin", "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2122, U+2212")}
* { margin: 0; box-sizing: border-box; }
body {
  width: 1200px; height: 630px;
  font-family: "Manrope", sans-serif;
  color: ${"#1c1917"};
  background: #fdf9f3;
  padding: 58px 64px;
}
.mark { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
.mark span { color: ${brandColors.emerald[700]}; }
.layout {
  height: 470px;
  margin-top: 34px;
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 54px;
  align-items: center;
}
h1 { font-size: 60px; font-weight: 800; line-height: 1.04; letter-spacing: -0.035em; }
.copy p { margin-top: 24px; font-size: 22px; line-height: 1.5; color: #57534e; }
.visual {
  height: 390px;
  padding: 42px 38px;
  border-radius: 24px;
  color: ${inkTheme.text.strong};
  background: ${inkTheme.surface.bg};
  box-shadow: 0 28px 70px rgb(13 21 18 / 18%);
}
.visual h2 { font-size: 24px; }
.visual p { margin-top: 8px; font-size: 16px; color: ${inkTheme.text.muted}; }
.domains { margin-top: 48px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; }
.wire { width: 100%; height: 98px; margin-top: -10px; }
.insight { margin-top: 10px; padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; font-size: 18px; line-height: 1.5; background: ${inkTheme.surface.surface}; }
</style>
<div class="mark">Sergeant<span>.</span></div>
<div class="layout">
  <div class="copy">
    <h1>Бачить звʼязки між усім, що важливо</h1>
    <p>Гроші, тіло, звички й харчування в одному приватному просторі.</p>
  </div>
  <div class="visual">
    <h2>Одна картина</h2>
    <p>Звʼязок між сферами життя</p>
    <div class="domains"><span>Фінік</span><span>Рутина</span><span>Тренування</span><span>Харчування</span></div>
    <svg class="wire" viewBox="0 0 500 100" fill="none">
      <path d="M18 50 C90 6 130 94 185 50 S290 6 340 50 S430 94 482 50" stroke="${brandColors.emerald[400]}" stroke-width="3"/>
      <circle cx="18" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.finyk.primary}" stroke-width="3"/>
      <circle cx="185" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.routine.primary}" stroke-width="3"/>
      <circle cx="340" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.fizruk.primary}" stroke-width="3"/>
      <circle cx="482" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.nutrition.primary}" stroke-width="3"/>
    </svg>
    <div class="insight">Одна підказка замість чотирьох окремих звітів.</div>
  </div>
</div>`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });
await browser.close();

const out = path.join(here, "..", "public", "og.png");
writeFileSync(out, png);
console.log(`og.png written: ${(png.length / 1024).toFixed(1)} kB → ${out}`);
