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
