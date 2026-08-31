/**
 * Генератор og-картинок (1200×630) для соцмереж.
 *
 * Дві родини картинок:
 * - `public/og.png` – ручний брендовий макет головної;
 * - `public/og/*.png` – per-route варіанти для контентних сторінок: маршрути
 *   з полем `ogImage` у `src/lib/routeMeta.json`, заголовок і опис беруться
 *   звідти ж, щоб превʼю не розходилось із метою сторінки.
 *
 * Картинки комітяться – скрипт потрібен лише щоб їх можна було відтворити
 * після зміни копірайту чи токенів, а не на кожен білд.
 * Запуск: `node scripts/generate-og.mjs` з `apps/landing`.
 *
 * Кольори беруться з `@sergeant/design-tokens`, а не дублюються рядками –
 * інакше картинка тихо розійшлася б із сайтом при наступному ребренді.
 * Шрифт вшивається data-URI, бо сторінка рендериться без мережі.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const { brandColors, inkTheme, moduleColors } =
  await import("@sergeant/design-tokens/tokens");

const routeMeta = JSON.parse(
  readFileSync(path.join(here, "..", "src/lib/routeMeta.json"), "utf8"),
);

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

const BASE_CSS = `
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
.mark span { color: ${brandColors.emerald[700]}; }`;

const WIRE = `<svg class="wire" viewBox="0 0 500 100" fill="none">
  <path d="M18 50 C90 6 130 94 185 50 S290 6 340 50 S430 94 482 50" stroke="${brandColors.emerald[400]}" stroke-width="3"/>
  <circle cx="18" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.finyk.primary}" stroke-width="3"/>
  <circle cx="185" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.routine.primary}" stroke-width="3"/>
  <circle cx="340" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.fizruk.primary}" stroke-width="3"/>
  <circle cx="482" cy="50" r="6" fill="${inkTheme.surface.bg}" stroke="${moduleColors.nutrition.primary}" stroke-width="3"/>
</svg>`;

const homeHtml = `<!doctype html>
<meta charset="utf-8">
<style>
${BASE_CSS}
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
    ${WIRE}
    <div class="insight">Одна підказка замість чотирьох окремих звітів.</div>
  </div>
</div>`;

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Per-route макет: заголовок сторінки великим, опис під ним, брендовий
 * «дріт» звʼязків унизу. Кегль заголовка залежить від довжини, щоб довгі
 * назви гайдів не вилазили за 630px.
 */
/**
 * Родина сторінки за префіксом маршруту. Мапа замість гілки `if`: інакше
 * кожна нова родина сторінок додавала б сюди ще одну умову.
 */
const EYEBROW_BY_PREFIX = [
  ["/guides/", "Гайд"],
  ["/hroshi", "Модуль"],
  ["/yizha", "Модуль"],
  ["/zvychky", "Модуль"],
  ["/trenuvannia", "Модуль"],
];

function eyebrowFor(route) {
  const hit = EYEBROW_BY_PREFIX.find(([prefix]) => route.startsWith(prefix));
  return hit ? hit[1] : null;
}

function routeHtml(route, meta) {
  const h1Size = meta.title.length <= 30 ? 62 : 50;
  // Eyebrow лише там, де сторінка належить родині: на решті він дублював
  // би вордмарку.
  const label = eyebrowFor(route);
  const eyebrow = label ? `<div class="eyebrow">${label}</div>` : "";
  return `<!doctype html>
<meta charset="utf-8">
<style>
${BASE_CSS}
body { display: flex; flex-direction: column; }
.eyebrow {
  margin-top: 46px;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${brandColors.emerald[700]};
}
h1 {
  margin-top: ${label ? 18 : 52}px;
  max-width: 980px;
  font-size: ${h1Size}px;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
}
.desc {
  margin-top: 22px;
  max-width: 900px;
  font-size: 23px;
  line-height: 1.5;
  color: #57534e;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wire { width: 520px; height: 96px; margin-top: auto; }
</style>
<div class="mark">Sergeant<span>.</span></div>
${eyebrow}
<h1>${esc(meta.title)}</h1>
<div class="desc">${esc(meta.description)}</div>
${WIRE}`;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

async function shoot(html, outRel) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const out = path.join(here, "..", "public", outRel);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${outRel} written: ${(png.length / 1024).toFixed(1)} kB`);
}

await shoot(homeHtml, "og.png");
for (const [route, meta] of Object.entries(routeMeta)) {
  if (!meta.ogImage) continue;
  await shoot(routeHtml(route, meta), meta.ogImage.replace(/^\//, ""));
}
await browser.close();
