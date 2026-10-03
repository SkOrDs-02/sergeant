/**
 * Гейт покриття: КОЖНЕ пошукове поле несе autofill-guard.
 *
 * Фікс 2026-08-11 (`210a6cf`) закрив девʼять полів і пропустив чотири —
 * `LogCardSearch`, пошук продукту в шторці їжі, ключове слово підписки та
 * палітру команд. Пропустив не через недбалість: список полів ніде не
 * існував, тож «усі» означало «ті, що знайшлись». Цей тест і є той список,
 * тільки такий, що рахує себе сам.
 *
 * Правило: якщо в елемента є `aria-label` або `placeholder`, що згадує
 * пошук, то він мусить або мати `type="search"` (тоді guard домішує
 * спільний `Input`), або спредити `searchFieldProps(...)`.
 *
 * Розбір, чому самого `autocomplete="off"` мало, — у `searchFieldProps.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Підказка на пошукове призначення поля у видимому тексті атрибута.
 *
 * `знайд` тут не для краси: палітра команд підписана «Знайди команду…», і
 * без цієї гілки гейт лишався зеленим навіть зі знятим guard-ом — тобто не
 * покривав рівно одне з чотирьох полів, заради яких його й писали. Спіймано
 * на ревʼю CodeRabbit.
 */
const SEARCH_HINT = /(пошук|шука|знайд|search)/i;

/** `aria-label="…"` або `placeholder="…"` з підказкою на пошук. */
const LABELLED_ATTR = /(?:aria-label|placeholder)="([^"]*)"/g;

/**
 * Скільки рядків навколо атрибута вважати «тим самим JSX-елементом».
 * Пропси одного інпута в цьому репо вкладаються у такий проміжок; ширше
 * вікно почало б зараховувати guard сусіднього елемента.
 */
const ELEMENT_WINDOW = 14;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!full.endsWith(".tsx")) continue;
    if (full.includes(".test.") || full.includes(".stories.")) continue;
    out.push(full);
  }
  return out;
}

interface UnguardedField {
  file: string;
  line: number;
  label: string;
}

/**
 * Тег елемента, якому належить атрибут на рядку `index` — перший
 * відкривальний JSX-тег вище по тексту. Потрібен, щоб гейт не чіплявся до
 * кнопок «Пошук» і «Очистити поле пошуку»: у них теж є `aria-label` зі
 * словом «пошук», але вводу вони не приймають, тож і красти їх нема чого.
 */
function owningTag(lines: readonly string[], index: number): string | null {
  for (let i = index; i >= 0 && index - i <= ELEMENT_WINDOW; i -= 1) {
    const open = /<([A-Za-z][\w.]*)/.exec(lines[i] ?? "");
    if (open) return open[1] ?? null;
  }
  return null;
}

function findUnguardedSearchFields(): UnguardedField[] {
  const found: UnguardedField[] = [];
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Коментар — не розмітка: пояснення «чому тут guard» саме й містить
      // слово «пошук», і без цієї відсічі гейт ловив би власні нотатки.
      if (line.trimStart().startsWith("//")) return;
      for (const match of line.matchAll(LABELLED_ATTR)) {
        const label = match[1] ?? "";
        if (!SEARCH_HINT.test(label)) continue;
        const tag = owningTag(lines, index);
        if (tag !== "input" && tag !== "Input") continue;
        const from = Math.max(0, index - ELEMENT_WINDOW);
        // Коментарі викидаємо ДО перевірки, а не лише на рядку атрибута:
        // пояснення поруч із полем згадують і `searchFieldProps`, і
        // `type="search"` дослівно, тож інакше гейт зараховував би власну
        // документацію за реалізацію. Спіймано на собі ж під час перевірки,
        // що тест червоніє без фіксу.
        const element = lines
          .slice(from, index + ELEMENT_WINDOW)
          .filter((l) => !l.trimStart().startsWith("//"))
          .join("\n");
        const guarded =
          element.includes("searchFieldProps(") ||
          element.includes('type="search"');
        if (!guarded) {
          found.push({
            file: file.slice(SRC_ROOT.length),
            line: index + 1,
            label,
          });
        }
      }
    });
  }
  return found;
}

describe("покриття autofill-guard на пошукових полях", () => {
  it('жодне пошукове поле не лишилось без searchFieldProps чи type="search"', () => {
    const unguarded = findUnguardedSearchFields();
    expect(
      unguarded,
      unguarded.length === 0
        ? ""
        : `Ці поля менеджер паролів може взяти за логін. Додай ` +
            `{...searchFieldProps("<щось>-search")} або type="search":\n` +
            unguarded
              .map((f) => `  ${f.file}:${f.line} — «${f.label}»`)
              .join("\n"),
    ).toEqual([]);
  });

  it("сам гейт щось знаходить — інакше він зелений через порожній обхід", () => {
    // Без цієї перевірки зламаний glob дав би «0 незахищених» і тест
    // світився б зеленим, нічого не перевіряючи.
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(100);
    const labelled = files.filter((f) =>
      Array.from(readFileSync(f, "utf8").matchAll(LABELLED_ATTR)).some((m) =>
        SEARCH_HINT.test(m[1] ?? ""),
      ),
    );
    expect(labelled.length).toBeGreaterThanOrEqual(8);
  });
});
