/**
 * Regression gate — аудит `2026-09-13-product-full-review.md`, знахідка PR-R1
 * («вихід із модуля вимикає dual-write для всього застосунку»).
 *
 * Status: Active. Last validated: 2026-09-13.
 *
 * Реєстр dual-write (`./index.ts`) — ОДНОСЛОТОВИЙ: `registerRoutineDualWrite
 * Context` пише `registeredContext = ctx`, а teardown обнуляє слот, якщо там
 * досі його власний контекст. Лічильника посилань немає навмисно.
 *
 * Поки реєстрант один, це коректно. Щойно їх стає двоє, реєстр тихо ламається:
 * пізніший перекриває слот, і його teardown обнуляє реєстрацію, хоча перший
 * реєстрант ще живий. Саме так і було — `useRoutineDualWriteBoot()` кликали
 * і `RoutineBootCluster` (змонтований на всю сесію через `RootLayout`), і
 * `useRoutineAppState` (живе лише поки відкритий екран `/routine`). Вихід із
 * модуля обнуляв слот, `isRoutineDualWriteRegistered()` віддавав `false` до
 * кінця сесії, і `core/lib/chatActions/routinePersistence.ts` мовчки писав
 * відмітки звичок лише в localStorage.
 *
 * Тест статичний навмисно: поведінковий варіант вимагав би змонтувати весь
 * екран модуля (18 `vi.mock`, гейт `lint:vi-mock-cap` таке відкидає — і має
 * рацію, бо такий тест перевіряє власні стаби). Інваріант же формулюється
 * точно і без моків: **у продакшн-коді рівно один виклик хука**. Це ловить
 * повернення дубля будь-де, а не лише у файлі, де він був.
 *
 * Ламається цей тест — не додавай виняток. Або прибери другий виклик, або
 * спершу переведи реєстр на лічильник посилань і онови цей докстрінг.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HOOK = "useRoutineDualWriteBoot";
const MODULE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Єдиний дозволений продакшн-виклик. Шлях відносно `modules/routine`. */
const SOLE_REGISTRANT = "hooks/RoutineBootCluster.tsx";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|stories)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/** Виклик хука, а не згадка в коментарі чи в його власному оголошенні. */
function callsHook(source: string): boolean {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  return new RegExp(`(?<!function\\s)\\b${HOOK}\\s*\\(`).test(withoutComments);
}

describe("dual-write registry: рівно один реєстрант (PR-R1)", () => {
  const callers = sourceFiles(MODULE_ROOT)
    .filter((file) => callsHook(readFileSync(file, "utf8")))
    .map((file) => relative(MODULE_ROOT, file).split("\\").join("/"));

  it(`${HOOK}() викликається рівно з одного продакшн-файла`, () => {
    expect(callers).toEqual([SOLE_REGISTRANT]);
  });

  it("useRoutineAppState не реєструє dual-write (він живе лише поки відкритий модуль)", () => {
    const source = readFileSync(
      join(MODULE_ROOT, "useRoutineAppState.ts"),
      "utf8",
    );
    expect(callsHook(source)).toBe(false);
  });

  it("реєстр лишається односклотовим — інакше цей гейт більше не описує ризик", () => {
    const registry = readFileSync(
      join(MODULE_ROOT, "lib/sqliteWriter/index.ts"),
      "utf8",
    );
    expect(registry).toContain("registeredContext = ctx");
    expect(registry).not.toMatch(/refCount|referenceCount/i);
  });
});
