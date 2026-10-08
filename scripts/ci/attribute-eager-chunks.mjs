#!/usr/bin/env node
/**
 * Атрибуція eager-чанків до модулів-джерел: що саме сидить на критичному
 * шляху і скільки воно важить.
 *
 * AI-CONTEXT: `check-eager-bundle.mjs` каже, СКІЛЬКИ важить критичний шлях і
 * які чанки на ньому, але не каже, ЧОМУ: ім'я чанка Rollup бере з одного
 * модуля, а всередині їх десятки (2026-09-12 чанк `cn` на 25 kB був на 87%
 * UA-каталогом). Цей розбір до 2026-10-08 робили ad-hoc щоразу заново —
 * тепер він тут (playbook `fix-red-bundle-budget.md`, крок 4).
 *
 * Як рахує: бере той самий список, що й гейт (`href`/`src` *.js з
 * `index.html`), для кожного чанка читає сусідню `.map`
 * (`build.sourcemap: "hidden"`), декодує `mappings` і приписує кожен
 * згенерований байт модулю-джерелу сегмента. Тобто це байти ПІСЛЯ
 * tree-shaking і мініфікації, а не розмір файлу-джерела. Brotli на модуль
 * не існує (стиснення спільне), тож колонка `~br` — це частка мініфікованих
 * байтів, помножена на brotli чанка: оцінка, не замір.
 *
 * Використання (з кореня репо, після `pnpm --filter @sergeant/web build`):
 *   node scripts/ci/attribute-eager-chunks.mjs [--dist <шлях>] [--top <N>] [--chunk <підрядок>]
 *   node scripts/ci/attribute-eager-chunks.mjs --modules   # плаский список модулів по всіх чанках
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

function parseArgs(argv) {
  const out = { dist: "apps/server/dist", top: 8, chunk: null, modules: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dist") out.dist = argv[++i] ?? out.dist;
    else if (a === "--top") out.top = Number(argv[++i] ?? out.top);
    else if (a === "--chunk") out.chunk = argv[++i] ?? null;
    else if (a === "--modules") out.modules = true;
  }
  return out;
}

const B64 = new Map(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (c, i) => [c, i],
  ),
);

/** Декодує один сегмент VLQ у масив чисел. */
function decodeSegment(seg) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of seg) {
    const digit = B64.get(ch);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** Байти згенерованого коду на кожне джерело (індекс у `map.sources`). */
function bytesPerSource(code, map) {
  const lines = code.split("\n");
  const sizes = new Array(map.sources.length).fill(0);
  let src = 0;
  map.mappings.split(";").forEach((line, li) => {
    const text = lines[li] ?? "";
    let col = 0;
    const segs = line ? line.split(",").map(decodeSegment) : [];
    segs.forEach((s, si) => {
      col += s[0];
      if (s.length > 1) src += s[1];
      const end = si + 1 < segs.length ? col + segs[si + 1][0] : text.length;
      if (s.length > 1) sizes[src] += Math.max(0, end - col);
    });
  });
  return sizes;
}

function shortName(source) {
  const s = source.replace(/^(\.\.\/)+/, "");
  const nm = s.lastIndexOf("node_modules/");
  return nm >= 0
    ? s
        .slice(nm + "node_modules/".length)
        .replace(/^\.pnpm\/[^/]+\/node_modules\//, "")
    : s;
}

function main() {
  const { dist, top, chunk, modules } = parseArgs(process.argv.slice(2));
  const root = resolve(process.cwd(), dist);
  const html = join(root, "index.html");
  if (!existsSync(html)) {
    console.error(
      `[attribute-eager] немає збірки у ${dist} — спершу \`pnpm --filter @sergeant/web build\`.`,
    );
    process.exit(2);
  }
  const markup = readFileSync(html, "utf8");
  const files = [
    ...new Set(
      [...markup.matchAll(/(?:href|src)="([^"]+\.js)"/g)].map((m) =>
        basename(m[1]),
      ),
    ),
  ].filter((f) => existsSync(join(root, "assets", f)));

  const kb = (n) => (n / 1000).toFixed(1);
  const rows = [];
  const flat = [];
  for (const f of files) {
    const path = join(root, "assets", f);
    const code = readFileSync(path, "utf8");
    const br = brotliCompressSync(Buffer.from(code), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
    let mods = [];
    if (existsSync(`${path}.map`)) {
      const map = JSON.parse(readFileSync(`${path}.map`, "utf8"));
      const sizes = bytesPerSource(code, map);
      // Знаменник — увесь чанк: байти без мапінгу (рантайм-обвʼязка,
      // `__vite__mapDeps` зі списком лінивих чанків) показуємо окремим
      // рядком, а не розмазуємо по модулях.
      const total = code.length || 1;
      const unmapped = code.length - sizes.reduce((a, b) => a + b, 0);
      mods = map.sources
        .map((s, i) => ({
          name: shortName(s),
          min: sizes[i],
          br: (sizes[i] / total) * br,
        }))
        .concat([
          { name: "(без мапінгу)", min: unmapped, br: (unmapped / total) * br },
        ])
        .filter((m) => m.min > 0)
        .sort((a, b) => b.min - a.min);
    }
    rows.push({ file: f, br, min: code.length, mods });
    for (const m of mods) flat.push({ ...m, chunk: f });
  }
  rows.sort((a, b) => b.br - a.br);

  const total = rows.reduce((a, r) => a + r.br, 0);
  console.log(
    `[attribute-eager] ${kb(total)} kB brotli у ${rows.length} preload-чанках`,
  );
  if (modules) {
    flat.sort((a, b) => b.br - a.br);
    for (const m of flat.slice(0, top)) {
      console.log(
        `  ~${kb(m.br).padStart(5)} br ${kb(m.min).padStart(6)} min  ${m.name}  [${m.chunk}]`,
      );
    }
    return;
  }
  for (const r of rows) {
    if (chunk && !r.file.includes(chunk)) continue;
    console.log(
      `\n${kb(r.br).padStart(6)} kB br  ${kb(r.min).padStart(6)} kB min  ${r.file}  (${r.mods.length} модулів)`,
    );
    for (const m of r.mods.slice(0, top)) {
      console.log(
        `    ~${kb(m.br).padStart(5)} br ${kb(m.min).padStart(6)} min  ${m.name}`,
      );
    }
  }
}

main();
