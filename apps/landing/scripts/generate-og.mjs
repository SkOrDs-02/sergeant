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

const { brandColors, moduleColors } =
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
  background:
    radial-gradient(60% 60% at 50% 0%, ${brandColors.emerald[50]} 0%, rgba(236,253,245,0) 70%),
    #fdf9f3;
  padding: 72px 80px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.mark { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
.mark span { color: ${brandColors.emerald[700]}; }
h1 { font-size: 84px; font-weight: 800; line-height: 1.03; letter-spacing: -0.035em; max-width: 15ch; }
h1 em { font-style: normal; color: ${brandColors.emerald[700]}; }
.row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.chip {
  display: flex; align-items: center; gap: 10px;
  font-size: 22px; font-weight: 700;
  padding: 10px 20px; border-radius: 999px;
  background: #fff; border: 1px solid #ebe4da;
}
.dot { width: 13px; height: 13px; border-radius: 999px; }
.foot { font-size: 22px; color: #57534e; font-weight: 500; }
</style>
<div class="mark">Sergeant<span>.</span></div>
<h1>Бачить усе твоє життя <em>разом</em></h1>
<div class="row">
  <div class="chip"><i class="dot" style="background:${moduleColors.finyk.primary}"></i>Гроші</div>
  <div class="chip"><i class="dot" style="background:${moduleColors.fizruk.primary}"></i>Тіло</div>
  <div class="chip"><i class="dot" style="background:${moduleColors.routine.primary}"></i>Звички</div>
  <div class="chip"><i class="dot" style="background:${moduleColors.nutrition.primary}"></i>Їжа</div>
  <div class="foot">· Local-first · українською</div>
</div>`;

const browser = await chromium.launch();
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
