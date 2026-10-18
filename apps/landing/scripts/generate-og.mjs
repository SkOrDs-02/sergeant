/**
 * Генератор og-картинок (1200×630) для соцмереж.
 *
 * Дві родини картинок:
 * - `public/og.png` – головна: заголовок і лід першого екрана;
 * - `public/og/*.png` – per-route варіанти для контентних сторінок: маршрути
 *   з полем `ogImage` у `src/lib/routeMeta.json`, заголовок і опис беруться
 *   звідти ж, щоб превʼю не розходилось із метою сторінки.
 *
 * Картинки комітяться – скрипт потрібен лише щоб їх можна було відтворити
 * після зміни копірайту чи токенів, а не на кожен білд.
 * Запуск: `node scripts/generate-og.mjs` з `apps/landing`.
 *
 * Вигляд повторює сайт, напрям «Порядок без крику»: папір `background`,
 * знак з личками і вордмарка над чорною лінійкою, як у шапці, заголовок
 * Unbounded 800 капсом, лід Manrope, унизу смуга з чотирьох кольорів
 * модулів. До 2026-10-08 картки лишались у попередньому напрямі (Manrope,
 * «Sergeant.» з крапкою, інший фон) і не впізнавались як сайт (аудит сайту
 * 2026-10-08, V11).
 *
 * Кольори читаються з `src/index.css` – того самого джерела, що й сайт;
 * синхронність CSS з `@sergeant/design-tokens` тримає `tokens.drift.test.ts`.
 * Шрифти вшиваються data-URI, бо сторінка рендериться без мережі.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const routeMeta = JSON.parse(
  readFileSync(path.join(here, "..", "src/lib/routeMeta.json"), "utf8"),
);

const css = readFileSync(path.join(here, "..", "src/index.css"), "utf8");
function color(name) {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8});`));
  if (!m) throw new Error(`generate-og: у index.css немає --color-${name}`);
  return m[1];
}
const C = {
  paper: color("background"),
  strong: color("foreground-strong"),
  muted: color("muted"),
  subtle: color("subtle"),
  inkText: color("ink-text"),
  ink: color("ink"),
  finyk: color("finyk"),
  fizruk: color("fizruk"),
  routine: color("routine"),
  routineStrong: color("routine-strong"),
  nutrition: color("nutrition"),
  nutritionGlow: color("nutrition-glow"),
};

function fontFile(pkg, file) {
  const dir = path.join(
    path.dirname(require.resolve(`${pkg}/package.json`)),
    "files",
  );
  return readFileSync(path.join(dir, file)).toString("base64");
}
const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20B4, U+2122, U+2212";
const face = (family, weight, file, pkg, range) => `
@font-face {
  font-family: "${family}";
  font-weight: ${weight};
  src: url(data:font/woff2;base64,${fontFile(pkg, file)}) format("woff2");
  unicode-range: ${range};
}`;
const FONTS = [
  face(
    "Manrope",
    "400 800",
    "manrope-cyrillic-wght-normal.woff2",
    "@fontsource-variable/manrope",
    CYR,
  ),
  face(
    "Manrope",
    "400 800",
    "manrope-latin-wght-normal.woff2",
    "@fontsource-variable/manrope",
    LAT,
  ),
  ...[500, 800].flatMap((w) => [
    face(
      "Unbounded",
      w,
      `unbounded-cyrillic-${w}-normal.woff2`,
      "@fontsource/unbounded",
      CYR,
    ),
    face(
      "Unbounded",
      w,
      `unbounded-latin-${w}-normal.woff2`,
      "@fontsource/unbounded",
      LAT,
    ),
  ]),
].join("\n");

// Геометрія знака – та сама, що в `src/components/Wordmark.tsx`.
const MARK = `<svg width="40" height="40" viewBox="0 0 512 512" fill="none" stroke="${C.strong}">
  <g stroke-width="46" stroke-linejoin="miter">
    <polyline points="96,180 256,90 416,180" />
    <polyline points="96,260 256,170 416,260" />
  </g>
  <path stroke-width="48" d="M 322,306 A 66 66 0 1 0 256,372 A 66 66 0 1 1 190,438" />
</svg>`;

const BASE_CSS = `
${FONTS}
* { margin: 0; box-sizing: border-box; }
body {
  width: 1200px; height: 630px;
  display: flex; flex-direction: column;
  font-family: "Manrope", sans-serif;
  color: ${C.strong};
  background: ${C.paper};
  -webkit-font-smoothing: antialiased;
}
.top {
  display: flex; align-items: center; gap: 16px;
  margin: 0 64px; padding: 40px 0 22px;
  border-bottom: 3px solid ${C.strong};
}
.top span {
  font-family: "Unbounded"; font-weight: 800; font-size: 24px;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.main { flex: 1; display: flex; flex-direction: column; padding: 40px 64px 0; overflow: hidden; }
.eyebrow {
  font-family: "Unbounded"; font-weight: 500; font-size: 18px;
  letter-spacing: 0.12em; text-transform: uppercase;
}
h1 {
  font-family: "Unbounded"; font-weight: 800; text-transform: uppercase;
  line-height: 1.06; letter-spacing: -0.01em; text-wrap: balance;
}
.desc {
  margin-top: 24px; max-width: 1000px;
  font-size: 25px; line-height: 1.45; color: ${C.muted};
  text-wrap: pretty;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.stripe { display: grid; grid-template-columns: repeat(4, 1fr); }
.stripe div:nth-child(1) { background: ${C.finyk}; color: ${C.inkText}; }
.stripe div:nth-child(2) { background: ${C.fizruk}; color: ${C.inkText}; }
.stripe div:nth-child(3) { background: ${C.routine}; color: ${C.ink}; }
.stripe div:nth-child(4) { background: ${C.nutritionGlow}; color: ${C.ink}; }`;

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const HOME = {
  title: "Порядок без крику",
  lead: "Гроші, тренування, звички і їжа в одному приватному застосунку. Він порівнює твої записи й помічає звʼязки між сферами, коли даних вистачає.",
};

const homeHtml = `<!doctype html>
<meta charset="utf-8">
<style>
${BASE_CSS}
h1 { margin-top: 6px; font-size: 92px; max-width: 900px; }
.desc { max-width: 880px; }
.stripe { height: 92px; }
.stripe div {
  display: flex; align-items: flex-end; padding: 0 24px 20px;
  font-family: "Unbounded"; font-weight: 800; font-size: 22px; text-transform: uppercase;
}
</style>
<div class="top">${MARK}<span>Sergeant</span></div>
<div class="main">
  <h1>${esc(HOME.title)}</h1>
  <div class="desc">${esc(HOME.lead)}</div>
</div>
<div class="stripe"><div>Гроші</div><div>Тренування</div><div>Звички</div><div>Їжа</div></div>`;

/**
 * Мітка над заголовком: родина сторінки і, для модулів, їхній колір – так
 * само, як мітка «Модуль · Фінік» на самій сторінці. Мапа замість гілки
 * `if`: нова родина сторінок додає рядок, а не умову.
 */
const EYEBROW_BY_PREFIX = [
  ["/guides/", "Гайд", C.subtle],
  ["/hroshi", "Модуль · Фінік", C.finyk],
  ["/yizha", "Модуль · Харчування", C.nutrition],
  ["/zvychky", "Модуль · Рутина", C.routineStrong],
  ["/trenuvannia", "Модуль · Фізрук", C.fizruk],
];

function routeHtml(route, meta) {
  const hit = EYEBROW_BY_PREFIX.find(([prefix]) => route.startsWith(prefix));
  const eyebrow = hit
    ? `<div class="eyebrow" style="color:${hit[2]}">${esc(hit[1])}</div>`
    : "";
  return `<!doctype html>
<meta charset="utf-8">
<style>
${BASE_CSS}
h1 { margin-top: ${hit ? 18 : 0}px; font-size: 64px; }
.stripe { height: 16px; margin-top: auto; }
</style>
<div class="top">${MARK}<span>Sergeant</span></div>
<div class="main">
  ${eyebrow}
  <h1>${esc(meta.title)}</h1>
  <div class="desc">${esc(meta.description)}</div>
</div>
<div class="stripe"><div></div><div></div><div></div><div></div></div>`;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

/**
 * Кегль заголовка підбирається під текст: найбільший, за якого заголовок
 * займає не більше трьох рядків і разом з описом вміщається над смугою.
 * Фіксований кегль або обрізав довгі назви гайдів, або дрібнив короткі.
 */
async function fitHeading() {
  await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const main = document.querySelector(".main");
    if (!h1 || !main) return;
    let size = parseFloat(getComputedStyle(h1).fontSize);
    const fits = () => {
      const lines = Math.round(
        h1.getBoundingClientRect().height / (size * 1.06),
      );
      return lines <= 3 && main.scrollHeight <= main.clientHeight;
    };
    while (!fits() && size > 34) {
      size -= 2;
      h1.style.fontSize = `${size}px`;
    }
  });
}

async function shoot(html, outRel) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await fitHeading();
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
