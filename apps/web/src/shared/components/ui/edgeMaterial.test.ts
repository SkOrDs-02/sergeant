/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Вартовий власного матеріалу (анти-слоп П3) на рівні ДЖЕРЕЛА, а не одного
 * компонента: `edge-stub` / `edge-perf` вирізають перфорацію маскою, і
 * маска зрізає будь-яку тінь на своєму вузлі. Підйом мусить жити на
 * батьківському вузлі (`edge-lift*`).
 *
 * AI-DANGER: помилка тут МОВЧАЗНА. Поверхня не ламається — вона просто
 * втрачає глибину, і побачити це можна лише поруч зі звичайною карткою.
 * Саме тому перевірка джерельна: жоден рендер-тест не впаде від того, що
 * тіні немає.
 *
 * Заміряно в headless Chromium 2026-08-06 (яскравість пікселя під нижнім
 * краєм, 0 = чорне, 255 = біле):
 *
 *   filter + mask на одному вузлі  → 255 / 255 (тіні немає)
 *   box-shadow + mask (контроль)   → 255 / 255 (тіні немає)
 *   filter на батьку               → 125 під зубцем, 225 під проміжком
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Класи, що несуть маску, і класи, що несуть підйом. */
const MASKED = ["edge-stub", "edge-perf"];
const LIFT = ["edge-lift", "edge-lift-interactive"];

/** Вміст кожного рядкового літерала у файлі. */
function stringLiterals(source: string): string[] {
  return [...source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}

/**
 * Класи, які опиняться на ОДНОМУ вузлі: вміст кожного `cn(...)`-виклику
 * (усі його рядкові аргументи разом) плюс кожен окремий літерал.
 *
 * Знахідка ревʼю: перша версія дивилась лише на окремі літерали, тож
 * `cn("edge-stub", "edge-lift")` проходила повз — а це рівно та помилка,
 * яку тест і має ловити. Аргументи `cn` склеюються в один рядок класів,
 * отже і перевіряти їх треба разом.
 *
 * Межа чесності: це не розбір JSX. Обчислені класи (змінна, тернарник
 * зі змінними) сюди не потраплять, і повний AST-аналіз із перевіркою
 * ПРЕДКА тут навмисно не робиться — після того, як `Card` став ставити
 * обгортку сам, ручний випадок лишився рідкісним, а вартовий ловить
 * саме його текстову форму. Основний захист — у `Card`, не тут.
 */
function classGroups(source: string): string[] {
  const groups = stringLiterals(source);
  for (const call of source.matchAll(/\bcn\(([\s\S]*?)\)/g)) {
    const args = call[1] ?? "";
    groups.push(stringLiterals(args).join(" "));
  }
  return groups;
}

/**
 * Рекурсивний обхід джерел. Власний, а не `glob`: `globSync` є в Node 22, але
 * не в тутешніх `@types/node`, а тягти залежність заради одного тесту дорожче
 * за десять рядків.
 *
 * Тести не скануються навмисно: вони НАЗИВАЮТЬ класи в асертах, а не
 * рендерять поверхні. Інакше кожен тест на край сам себе й позначав би
 * порушником.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

describe("край і зріз — маска й підйом не живуть на одному вузлі", () => {
  const files = walk(SRC);

  it("жоден className не поєднує масковий край із підйомом", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!LIFT.some((c) => src.includes(c))) continue;
      for (const literal of classGroups(src)) {
        const tokens = literal.split(/\s+/);
        const hasMask = MASKED.some((c) => tokens.includes(c));
        const hasLift = LIFT.some((c) => tokens.includes(c));
        if (hasMask && hasLift) {
          offenders.push(`${relative(SRC, file)}: "${literal}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("кожен масковий край має підйом десь вище — або свідомо не має", () => {
    // Не всі маски зобовʼязані підійматись: `edge-perf` у стосі документів
    // сидить на папері й тіні не потребує. Тест лише вимагає, щоб файл, який
    // ставить масковий край, або згадував `edge-lift`, або пояснював чому ні.
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const usesMask = MASKED.some((c) =>
        classGroups(src).some((l) => l.split(/\s+/).includes(c)),
      );
      if (!usesMask) continue;
      const hasLift = LIFT.some((c) => src.includes(c));
      const hasWaiver = src.includes("edge-no-lift");
      if (!hasLift && !hasWaiver) missing.push(relative(SRC, file));
    }
    expect(missing).toEqual([]);
  });
});
