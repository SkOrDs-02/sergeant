import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Гейт тону копії, яку сервер шле людині: листи, Telegram-бот, нагадування.
 *
 * Дзеркало `apps/web/src/shared/i18n/copy.slop.test.ts`: кириличний рядковий
 * літерал, що закінчується окликом. Веб-гейт дивився лише на `apps/web`, тож
 * «Шкода!», «Дякую!» і «Привіт!» прожили поза ним (анти-слоп раунд 4, A7,
 * рішення власника Q3). Поріг нуль: оклик у продуктовій копії є регістром
 * згенерованого тексту, а факт із числом каже те саме тихіше.
 *
 * Скоуп навмисно вузький: три теки з копією для людини. Промпти для моделі
 * тримає `lib/promptVoice.test.ts`, алерти для розробника (`obs/`) сюди не
 * входять.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));
const SURFACES = ["email", "modules/telegram", "lib/reminders"];

const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
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

describe("копія сервера для людини без окликів", () => {
  for (const surface of SURFACES) {
    it(surface, () => {
      const hits = sourceFiles(path.join(SRC, surface)).flatMap(exclamations);
      expect(hits).toEqual([]);
    });
  }
});
