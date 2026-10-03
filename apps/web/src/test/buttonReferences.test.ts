/**
 * Last validated: 2026-09-24. Status: Active.
 *
 * §2.13 аудиту копі (`docs/work/specs/audits/2026-09-23-web-copy-audit.md`):
 * інструкція називає кнопку поіменно («Спочатку натисни «+ Нове»»), а такої
 * кнопки в кодовій базі немає — підпис існував лише в коментарі.
 *
 * **Чому тест, а не правило ESLint.** Перевірка вимагає зіставити рядок з
 * усім деревом `apps/web/src` (чи існує підпис X десь іще як реальний
 * лейбл), а не проаналізувати один файл ізольовано — ESLint-правило працює
 * по AST одного файла й такого крос-файлового зіставлення не робить. До того
 * ж єдиний законний дім для копі-правил, `sergeant-design/ukrainian-copy`,
 * закритий снапшот-гейтом `pnpm lint:eslint-config-diff`, тож ціна нового
 * правила там вища за ціну гейту тут, поруч зі сканером на кшталт
 * `noReplacementChar.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "..");

/** Інструкція називає кнопку/дію поіменно: «кнопку «X»», «натисни «X»». */
const REFERENCE = /(?:кнопк(?:у|а|и|ою|ці)|натисни|тапни)\s*«([^»]+)»/giu;

/** Зірочка чи плейсхолдер у назві — не справжній підпис, пропускаємо. */
const PLACEHOLDER = /[*{…]/;

/**
 * Легітимні випадки, яких гейт розпізнати не може: `file::normalized-text`.
 *
 * Обидва записи — «Натисни «Повернути» у тості» в undo-підказках. Справжній
 * підпис кнопки не рядковий літерал у apps/web, а константа
 * `UNDO_TOAST_DEFAULT_LABEL = "Повернути"` з `packages/shared/src/lib/undoToast.ts`
 * (`showUndoToast` підставляє її як `undoLabel` за замовчуванням) — гейт
 * сканує лише `apps/web/src/**`, тож цей пакет поза його межами.
 */
const ALLOWED = new Set<string>([
  "modules/fizruk/components/WorkoutTemplatesSection.tsx::Повернути",
  "modules/nutrition/components/meal-sheet/MealTemplatesRow.tsx::Повернути",
]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      if (entry === "DesignShowcase") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

/** Прибирає коментарі, щоб підпис, згаданий лише в них, не рахувався доказом. */
/**
 * Коментарі замінюються пробілами тієї самої довжини, а не вирізаються:
 * інакше номери рядків у звіті зсуваються на кожен блок-коментар вище.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) =>
      p.concat(" ".repeat(m.length - p.length)),
    );
}

function normalize(text: string): string {
  return text.replace(/[ʼ'’]/g, "'").trim().replace(/\s+/g, " ");
}

/**
 * Множина всіх «справжніх» підписів у дереві: рядкові літерали (покриває і
 * i18n-каталог `ключ: "X"`, і `aria-label="X"` / `title="X"`) та самостійні
 * рядки JSX-тексту (`^\s*X\s*$` у .tsx).
 */
function collectKnownLabels(files: string[]): Set<string> {
  const labels = new Set<string>();
  for (const file of files) {
    const clean = stripComments(readFileSync(file, "utf8"));
    for (const match of clean.matchAll(
      /"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`/g,
    )) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value) labels.add(normalize(value));
    }
    if (file.endsWith(".tsx")) {
      for (const line of clean.split(/\r?\n/)) {
        const trimmed = normalize(line);
        if (trimmed) labels.add(trimmed);
      }
    }
  }
  return labels;
}

interface Offender {
  file: string;
  line: number;
  text: string;
}

function findOffenders(files: string[], knownLabels: Set<string>): Offender[] {
  const offenders: Offender[] = [];
  for (const file of files) {
    const rel = relative(WEB_SRC, file).replace(/\\/g, "/");
    const clean = stripComments(readFileSync(file, "utf8"));
    for (const match of clean.matchAll(REFERENCE)) {
      const raw = match[1];
      if (raw == null || PLACEHOLDER.test(raw)) continue;
      const name = normalize(raw);
      if (knownLabels.has(name)) continue;
      if (ALLOWED.has(`${rel}::${name}`)) continue;
      offenders.push({
        file: rel,
        line: clean.slice(0, match.index).split("\n").length,
        text: name,
      });
    }
  }
  return offenders;
}

describe("інструкція називає підпис кнопки, який справді існує (§2.13 аудиту копі)", () => {
  const files = collectSourceFiles(WEB_SRC);

  it("сканер бачить достатньо файлів, щоб перевірка щось означала", () => {
    expect(files.length).toBeGreaterThan(1000);
  });

  it("кожен підпис у «кнопку «X»» / «натисни «X»» існує як реальний лейбл", () => {
    const knownLabels = collectKnownLabels(files);
    const offenders = findOffenders(files, knownLabels);
    expect(
      offenders.map(
        (o) =>
          `${o.file}:${o.line} — «${o.text}» (назви кнопку так, як вона підписана, або прибери назву)`,
      ),
    ).toEqual([]);
  });
});
