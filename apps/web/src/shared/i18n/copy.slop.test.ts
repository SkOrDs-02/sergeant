// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Гейт тону застосунку: кириличний рядковий літерал, що закінчується окликом.
 *
 * Шукає по всьому `src`, а не лише в `uk.*.ts`: святкова копія
 * `CelebrationModal` («Ти справжня легенда!») пережила два копі-аудити саме
 * тому, що жила в компоненті, а греп дивився в локалі (аудит анти-слопу
 * 2026-09-23, P1-3 і §6). Поріг нуль: оклик у продуктовій копії є
 * регістром згенерованого тексту, а факт із числом каже те саме тихіше.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|stories)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

function exclamations(file: string): string[] {
  const hits: string[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!line.includes("!") || !CYRILLIC.test(line)) return;
      if (/^(\/\/|\*|\/\*)/.test(line.trim())) return;
      for (const m of line.matchAll(LITERAL)) {
        const body = m[1] ?? m[2] ?? m[3] ?? "";
        if (CYRILLIC.test(body) && body.trimEnd().endsWith("!")) {
          hits.push(`${path.relative(SRC, file)}:${i + 1}: ${m[0]}`);
        }
      }
    });
  return hits;
}

describe("копія застосунку без окликів", () => {
  it("жоден кириличний рядок у src не закінчується «!»", () => {
    const hits = sourceFiles(SRC).flatMap(exclamations);
    expect(hits).toEqual([]);
    // Окремо тест іде ~3 с, але синхронно читає ~1 400 файлів, і поруч із
    // паралельними воркерами на слабкій машині 60 с уже бракувало.
  }, 180_000);
});

/**
 * Густинний гейт (анти-слоп раунд 4, A1/A4, рішення власника Q3). Зовнішній
 * консенсус жовтня 2026 (Pew, Wikipedia AICATCH, Graphite): ознака слопу це
 * щільність маркерів на сотню слів, а не окремий символ. Міряємо те саме,
 * що лендінг у `apps/landing/src/copy.slop.test.ts`, на трьох user-facing
 * поверхнях, які жили поза всіма гейтами, бо копія в них не в `uk.*.ts`:
 * «Що нового», порожні стани модулів і перший крок хаба.
 *
 * Що саме ловиться й чому:
 *  - антитеза «не X, а Y» вище 0,3 на 100 слів (стеля лендінгу): «Що
 *    нового» мало 1,38;
 *  - заява про правду замість її показу («насправді», «покаже правду»,
 *    «реальну/чесну картину»): style-guide §7, чотири порожні стани;
 *  - префікс-підказка «Порада:» / «Увага:» / «Важливо:» з лампочкою: «Tip:»
 *    генераторів.
 */
const L = "[а-яіїєґА-ЯІЇЄҐʼ]";
// Лише негативний паралелізм («X, а не Y», «не X, а Y»), той самий, що
// Pew рахує як «not just X, but Y». Нейтральне «, а …» лендінг рахує теж,
// але там копія коротка; у «Що нового» звичайні сполучники («…зі Strong, а
// вправи отримали…») давали 10 хибних на 759 слів.
const ANTITHESIS = new RegExp(
  `(?:,| )а не |(?<!${L})не [^,.;]{2,70}, а `,
  "giu",
);
const TRUTH_CLAIM =
  /(?<![а-яіїєґ])(насправді|покаже правду|реальн(?:у|а|ий) картин|чесн(?:у|а|ий) картин)/giu;
const HINT_PREFIX = /(^|["'`])(Порада|Увага|Важливо|Підказка):/gmu;

const DENSITY_SURFACES = [
  "core/whatsNew/releases.ts",
  "shared/i18n/uk.core.ts",
  "core/onboarding/FirstActionSheet.tsx",
  "shared/components/ui/EmptyState.tsx",
];

function cyrillicLiterals(file: string): string {
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of src.matchAll(LITERAL)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    if (CYRILLIC.test(body)) out.push(body);
  }
  return out.join("\n");
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

describe("густина маркерів слопу на поверхнях поза uk.*.ts", () => {
  for (const rel of DENSITY_SURFACES) {
    it(rel, () => {
      const text = cyrillicLiterals(path.join(SRC, rel));
      const words = (text.match(/[а-яіїєґА-ЯІЇЄҐa-zA-Z0-9ʼ-]+/gu) ?? []).length;
      const problems: string[] = [];
      const antitheses = count(text, ANTITHESIS);
      const ceiling = Math.max(1, Math.floor(words * 0.003));
      if (antitheses > ceiling)
        problems.push(`антитез «X, а не Y»: ${antitheses} > ${ceiling}`);
      const truth = text.match(TRUTH_CLAIM) ?? [];
      if (truth.length > 0)
        problems.push(`заяв про правду: ${truth.join(", ")}`);
      const prefixes = text.match(HINT_PREFIX) ?? [];
      if (prefixes.length > 0)
        problems.push(`префіксів-підказок: ${prefixes.length}`);
      expect(problems, `${rel} (${words} слів)`).toEqual([]);
    });
  }
});
