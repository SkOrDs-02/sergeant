/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Гейт на одне: обведена іконкова кнопка Рутини має ОДИН рецепт.
 *
 * До зведення їх було три (розбір — у докстрінгу `routineIconButton.ts`), і
 * розбіжності були випадкові: зайвий `.focus-ring`, який ПІДМІНЯВ колір і
 * ширину фокуса замість підсилити, загублений `rounded-xl`, довільний
 * `shadow-sm`. Жодна з них не коментувалась як задум — саме так виглядає
 * копіпаст, а не рішення.
 *
 * Тест не забороняє інший вигляд там, де він виправданий; він забороняє
 * ЗБИРАТИ той самий вигляд руками поруч із наявною константою.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// `URL.pathname` на Windows дає `/D:/…`, і `join` склеював `D:\D:\…`.
const ROOT = fileURLToPath(new URL(".", import.meta.url));

/** `border border-line` разом із `rounded-xl` або `bg-panel/90` у className. */
const HAND_ROLLED = /className=(?:"|\{cn\()[^"}]*\bborder border-line\b[^"}]*/g;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

describe("обведена іконкова кнопка Рутини має один рецепт", () => {
  it("жоден IconButton у Рутині не збирає рецепт руками", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(ROOT)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(HAND_ROLLED)) {
        const cls = m[0];
        // Тільки іконкові кнопки: рецепт має нести і радіус, і підкладку.
        if (!/rounded-xl/.test(cls) || !/bg-panel\/90/.test(cls)) continue;
        // Знайти найближчий відкривний тег вище — цікавлять лише IconButton.
        const before = src.slice(0, m.index);
        const tagStart = before.lastIndexOf("<");
        if (!/^<IconButton\b/.test(src.slice(tagStart, tagStart + 12)))
          continue;
        offenders.push(
          `${relative(ROOT, file)}:${before.split("\n").length} — ${cls.slice(0, 90)}\n` +
            `      → візьми ROUTINE_OUTLINE_ICON_BUTTON з ./routineIconButton`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("константа лишається єдиним джерелом рецепта", async () => {
    const { ROUTINE_OUTLINE_ICON_BUTTON } = await import("./routineIconButton");
    expect(ROUTINE_OUTLINE_ICON_BUTTON).toBe(
      "rounded-xl border border-line bg-panel/90 text-muted",
    );
  });
});
