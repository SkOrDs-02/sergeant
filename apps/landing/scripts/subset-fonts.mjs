/**
 * Підмножини шрифтів сайту і метрики фолбеку (аудит сайту 2026-10-08, F5, F9).
 *
 * Навіщо. Fontsource ріже шрифт на `latin`, `latin-ext`, `cyrillic`,
 * `cyrillic-ext`, і браузер тягне ВЕСЬ файл підмножини, щойно на сторінці
 * трапився хоч один її символ. Латиницю тягнуло кожне «Sergeant», кожна цифра
 * й кожні «лапки» (U+00AB лежить у `latin`), тож сторінка вантажила вісім
 * файлів на 107–140 КБ, більшість гліфів яких сайт не показує ніколи.
 *
 * Що робить. Бере ті самі файли fontsource і лишає в кожному лише символи
 * набору `CHARSET`: ASCII, повний український алфавіт, типографіка і все, що
 * реально трапляється в пререндері (`dist/**`/*.html`). Пише:
 *
 * - `src/fonts/*.woff2` – підмножини;
 * - `src/fonts/fonts.css` – `@font-face` для них і фолбек-обличчя з
 *   `size-adjust` / `*-override`, щоб заміна системного шрифту на Manrope й
 *   Unbounded не зсувала рядки (F9);
 * - `src/fonts/charset.json` – набір, проти якого `fontCoverage.test.ts`
 *   звіряє текст усіх сторінок.
 *
 * Коли запускати. Коли `fontCoverage.test.ts` червоний (у копії зʼявився
 * символ поза набором) або оновився пакет шрифту:
 *
 *   pnpm --filter @sergeant/landing build
 *   pnpm --filter @sergeant/landing fonts:subset
 *
 * Потрібен `pyftsubset` і `python3` з модулем `fontTools` (пакети pip
 * `fonttools` і `brotli`). У збірку й CI цей крок не входить: результат
 * закомічено, тож білду fonttools не потрібен.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "src", "fonts");
const require = createRequire(import.meta.url);
const PYTHON = process.env.PYTHON ?? "python3";
const PYFTSUBSET = process.env.PYFTSUBSET ?? "pyftsubset";

const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

/** Обличчя сайту: звідки брати файли і з якими дескрипторами їх оголосити. */
const FACES = [
  {
    family: "Manrope Variable",
    weight: "200 800",
    pkg: "@fontsource-variable/manrope",
    css: "index.css",
    file: (subset) => `manrope-${subset}-wght-normal.woff2`,
    out: (subset) => `manrope-${subset}.woff2`,
  },
  ...[500, 700, 800].map((weight) => ({
    family: "Unbounded",
    weight: String(weight),
    pkg: "@fontsource/unbounded",
    css: `${weight}.css`,
    file: (subset) => `unbounded-${subset}-${weight}-normal.woff2`,
    out: (subset) => `unbounded-${subset}-${weight}.woff2`,
  })),
];

const SUBSETS = ["cyrillic-ext", "cyrillic", "latin-ext", "latin"];

const UA_LETTERS =
  "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя";
const TYPOGRAPHY = "ʼ’‘«»“”„–—…№₴€%·×≈→←↑↓✓±°  ";

/** Текст пререндеру без скриптів і стилів, з атрибутами (alt, aria-label). */
function siteChars() {
  const chars = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".html")) {
        const html = readFileSync(full, "utf8").replace(
          /<(script|style)[\s\S]*?<\/\1>/g,
          "",
        );
        for (const ch of html) chars.add(ch);
      }
    }
  };
  walk(DIST);
  return chars;
}

function buildCharset() {
  const set = new Set();
  for (let c = 0x20; c <= 0x7e; c += 1) set.add(String.fromCodePoint(c));
  for (const ch of UA_LETTERS + TYPOGRAPHY) set.add(ch);
  for (const ch of siteChars()) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0)) set.add(ch);
  }
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/** `unicode-range` кожної підмножини з CSS пакета fontsource. */
function ranges(face) {
  const css = readFileSync(path.join(pkgDir(face.pkg), face.css), "utf8");
  const map = {};
  for (const block of css.split("@font-face").slice(1)) {
    const file = block.match(/files\/([^)]+\.woff2)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (file && range) map[file] = range.trim();
  }
  return map;
}

function inRange(cp, rangeList) {
  return rangeList.split(",").some((part) => {
    const [lo, hi] = part
      .trim()
      .replace(/^U\+/i, "")
      .split("-")
      .map((h) => parseInt(h, 16));
    return cp >= lo && cp <= (hi ?? lo);
  });
}

const py = (code, args) =>
  execFileSync(PYTHON, ["-c", code, ...args], { encoding: "utf8" });

/**
 * Символи, яких у шрифті немає, але є гліф, що виглядає так само. У Manrope
 * немає U+02BC (ʼ, канонічний апостроф копії, style-guide §1 п. 10), і
 * браузер малював кожне «звʼязки» системним апострофом посеред Manrope.
 * Апостроф U+2019 у Manrope є і має ту саму форму, тож у підмножині ʼ
 * отримує його гліф.
 */
const ALIASES = { 0x02bc: 0x2019 };

const ALIAS_PY = `
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
src, dst = int(sys.argv[2]), int(sys.argv[3])
glyph = font.getBestCmap().get(src)
if glyph is None:
    sys.exit("alias source missing")
for table in font["cmap"].tables:
    if table.isUnicode():
        table.cmap[dst] = glyph
font.save(sys.argv[1])
`;

const CMAP_PY = `
import sys
from fontTools.ttLib import TTFont
print(" ".join(str(c) for c in TTFont(sys.argv[1]).getBestCmap()))
`;

/**
 * Метрики фолбеку за формулою next/font і capsize: \`size-adjust\` вирівнює
 * середню ширину символу під частоти саме цього сайту (кирилиця, а не
 * англійський текст), \`*-override\` переносить вертикальні метрики шрифту на
 * масштабований фолбек. Фолбек – Arial; Liberation Sans має ті самі метрики і
 * стоїть замість нього там, де Arial немає (Linux, CI).
 */
const METRICS_PY = `
import sys, json
from fontTools.ttLib import TTFont
freq = json.loads(sys.argv[3])
def avg(path):
    f = TTFont(path)
    cmap, hmtx, upm = f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm
    total = weight = 0
    for ch, n in freq.items():
        g = cmap.get(ord(ch))
        if g is None: continue
        total += hmtx[g][0] / upm * n; weight += n
    return total / weight, f
fa, font = avg(sys.argv[1])
fb, _ = avg(sys.argv[2])
size = fa / fb
upm = font["head"].unitsPerEm
hhea = font["hhea"]
print(json.dumps({
  "size": round(size * 100, 2),
  "ascent": round(hhea.ascent / upm / size * 100, 2),
  "descent": round(abs(hhea.descent) / upm / size * 100, 2),
  "lineGap": round(hhea.lineGap / upm / size * 100, 2),
}))
`;

function fallbackFont(bold) {
  const out = execFileSync(
    "fc-match",
    ["-f", "%{file}", `Liberation Sans:style=${bold ? "Bold" : "Regular"}`],
    { encoding: "utf8" },
  );
  if (!out.includes("LiberationSans")) {
    throw new Error(
      "subset-fonts: потрібен Liberation Sans (метрики Arial) для фолбеку",
    );
  }
  return out;
}

function charFrequency() {
  const freq = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".html")) {
        const main =
          readFileSync(full, "utf8").match(
            /<main[^>]*>([\s\S]*)<\/main>/,
          )?.[1] ?? "";
        const text = main.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        for (const ch of text) freq[ch] = (freq[ch] ?? 0) + 1;
      }
    }
  };
  walk(DIST);
  return freq;
}

function toRanges(cps) {
  const sorted = [...cps].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");
    out.push(
      i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`,
    );
    i = j;
  }
  return out.join(",");
}

const charset = buildCharset();
const charsetCps = charset.map((ch) => ch.codePointAt(0));

// Лише власні виходи: старі підмножини з попереднього запуску, нічого іншого.
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) {
  if (name.endsWith(".woff2")) rmSync(path.join(OUT, name));
}

const faceCss = [];
let before = 0;
let after = 0;
for (const face of FACES) {
  const rangeMap = ranges(face);
  for (const subset of SUBSETS) {
    const src = path.join(pkgDir(face.pkg), "files", face.file(subset));
    const range = rangeMap[face.file(subset)];
    if (!range) throw new Error(`subset-fonts: немає unicode-range для ${src}`);
    const has = new Set(py(CMAP_PY, [src]).trim().split(" ").map(Number));
    const keep = charsetCps.filter((cp) => has.has(cp) && inRange(cp, range));
    const aliases = Object.entries(ALIASES)
      .map(([dst, src]) => [Number(dst), src])
      .filter(
        ([dst, src]) =>
          !has.has(dst) &&
          has.has(src) &&
          charsetCps.includes(dst) &&
          inRange(dst, range) &&
          keep.includes(src),
      );
    if (keep.length === 0) continue;
    const dest = path.join(OUT, face.out(subset));
    execFileSync(PYFTSUBSET, [
      src,
      `--unicodes=${keep.map((cp) => cp.toString(16)).join(",")}`,
      "--flavor=woff2",
      "--layout-features=*",
      "--no-hinting",
      "--desubroutinize",
      `--output-file=${dest}`,
    ]);
    for (const [dst, aliasSrc] of aliases) {
      py(ALIAS_PY, [dest, String(aliasSrc), String(dst)]);
      keep.push(dst);
    }
    before += statSync(src).size;
    after += statSync(dest).size;
    faceCss.push(`@font-face {
  font-family: "${face.family}";
  font-style: normal;
  font-display: swap;
  font-weight: ${face.weight};
  src: url("./${face.out(subset)}") format("woff2");
  unicode-range: ${toRanges(keep)};
}`);
  }
}

const freq = charFrequency();
const metric = (src, bold) =>
  JSON.parse(py(METRICS_PY, [src, fallbackFont(bold), JSON.stringify(freq)]));
const manrope = metric(
  path.join(
    pkgDir("@fontsource-variable/manrope"),
    "files",
    "manrope-cyrillic-wght-normal.woff2",
  ),
  false,
);
const unbounded = metric(
  path.join(
    pkgDir("@fontsource/unbounded"),
    "files",
    "unbounded-cyrillic-800-normal.woff2",
  ),
  true,
);
const fallbackCss = (family, m, local) => `@font-face {
  font-family: "${family}";
  src: ${local};
  size-adjust: ${m.size}%;
  ascent-override: ${m.ascent}%;
  descent-override: ${m.descent}%;
  line-gap-override: ${m.lineGap}%;
}`;

writeFileSync(
  path.join(OUT, "fonts.css"),
  `/* AI-GENERATED: scripts/subset-fonts.mjs – не правити руками, перезапусти скрипт. */

${faceCss.join("\n\n")}

/* Фолбеки з метриками шрифтів (F9): поки вантажиться Manrope чи Unbounded,
   Arial масштабований під їхню ширину і висоту рядка, тож заміна не зсуває
   текст. Де Arial немає (Android), правило пропускається і працює
   ui-sans-serif із \`--font-sans\`. */
${fallbackCss("Manrope Fallback", manrope, 'local("Arial"), local("ArialMT"), local("Liberation Sans")')}

${fallbackCss("Unbounded Fallback", unbounded, 'local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold")')}
`,
);

writeFileSync(
  path.join(OUT, "charset.json"),
  `${JSON.stringify(charset.join(""))}\n`,
);

console.log(
  `subset-fonts: ${faceCss.length} файлів, ${Math.round(before / 1024)} → ${Math.round(after / 1024)} КБ, набір ${charset.length} символів`,
);
console.log(`  Manrope Fallback ${JSON.stringify(manrope)}`);
console.log(`  Unbounded Fallback ${JSON.stringify(unbounded)}`);
