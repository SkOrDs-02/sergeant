/**
 * Інваріант політики ризику (аудит 2026-10-01, `logic-03`): кожен
 * стейт-мутуючий інструмент HubChat АБО зареєстрований у `TOOL_RISK`
 * (тобто має явно названий режим: підтвердження чи undo через UI), АБО
 * його виконавець повертає `undo`. Інакше модель, зокрема через інʼєкцію в
 * чужому тексті (B21), переписує дані без кліку людини й без способу
 * скасувати — так `edit_habit`, `set_habit_schedule` і `pause_habit`
 * переписували звичку, поки ця перевірка не зʼявилась.
 *
 * Перевірка статична, як у `toolParity.test.ts`: тіло `case "<tool>":` у
 * диспетчерах `chatActions/**` (або тіло функції, якій `case` делегує
 * однорядковим `return fn(...)`) має містити `undo`. Запускати всі
 * виконавці тут означало б дублювати модульні моки кожного `*Actions.test.ts`;
 * поведінку самого undo перевіряють ті набори.
 *
 * Слабке місце свідоме: слово `undo` у тілі ще не доводить, що undo
 * правильний або повертається в кожній гілці. Тест ловить головне —
 * мутуючий тул, про скасування якого автор не подумав узагалі.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALL_HUBCHAT_TOOL_NAMES,
  TOOL_RISK,
  isStateMutatingTool,
} from "@sergeant/shared";

const CHAT_ACTIONS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Відомі мутуючі інструменти без undo і поза `TOOL_RISK`. Кожен запис —
 * причина, а не «потім». Новий тул сюди не додається мовчки: спершу undo
 * або рішення про `TOOL_RISK`.
 */
const KNOWN_NO_UNDO: Readonly<Record<string, string>> = {
  // Потребує компенсуючої події журналу комори (ADR-0077): знімок позиції
  // назад у стан не відновить історію споживання.
  consume_from_pantry: "компенсуюча подія журналу комори, ADR-0077",
  // Вимикає адаптивну ціль; відновлення теж іде через журнал цілей
  // (ADR-0077), а не через запис старого blob-а префів.
  set_goal: "компенсуюча подія журналу цілей, ADR-0077",
  // Лише порядок: даних не губить, той самий тул повертає будь-який порядок.
  reorder_habits: "лише порядок, той самий тул відновлює",
  // Додають новий запис (план, підхід, тренування, замір) і нічого не
  // переписують; прибрати зайвий запис можна в модулі Фізрук.
  plan_workout: "адитивний запис, прибирається в UI Фізрука",
  log_set: "адитивний запис, прибирається в UI Фізрука",
  start_workout: "адитивний запис, прибирається в UI Фізрука",
  finish_workout: "закриває тренування, перевідкривається в UI Фізрука",
  log_measurement: "адитивний запис, прибирається в UI Фізрука",
  // Пише рецепт на сервер (`saveRecipeToBook`), DELETE з чату немає;
  // рецепт видаляється в книзі рецептів.
  add_recipe: "серверний запис без DELETE з чату, прибирається в книзі",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const SOURCES: ReadonlyArray<{ file: string; text: string }> = walk(
  CHAT_ACTIONS_DIR,
).map((file) => ({
  file: relative(CHAT_ACTIONS_DIR, file),
  text: stripComments(readFileSync(file, "utf8")),
}));

/** Брейс-збалансований блок, що починається з `{` на позиції `start`. */
function balancedBlock(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("toolUndoInvariant: незбалансовані дужки");
}

/** Тіло `export function <name>(...)` у будь-якому файлі `chatActions/**`. */
function functionBody(name: string): string | null {
  const decl = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`);
  for (const { text } of SOURCES) {
    const m = decl.exec(text);
    if (!m) continue;
    // Пропускаємо параметри (у них можуть бути `{}` деструктуризації).
    let i = m.index + m[0].length;
    for (let depth = 1; depth > 0 && i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
    }
    return balancedBlock(text, text.indexOf("{", i));
  }
  return null;
}

/** Тіла виконавців тула: блок `case`, або тіло функції, якій він делегує. */
function executorBodies(tool: string): string[] {
  const label = new RegExp(`case\\s+"${tool}"\\s*:`, "g");
  const bodies: string[] = [];
  for (const { text } of SOURCES) {
    for (const m of text.matchAll(label)) {
      let rest = text.slice((m.index ?? 0) + m[0].length);
      // Кілька міток над спільним тілом.
      rest = rest.replace(/^(\s*case\s+"[^"]+"\s*:)*\s*/, "");
      if (rest.startsWith("{")) {
        bodies.push(balancedBlock(rest, 0));
        continue;
      }
      const delegate = /^return\s+(?:await\s+)?(\w+)\(/.exec(rest);
      const body = delegate?.[1] ? functionBody(delegate[1]) : null;
      bodies.push(body ?? rest.slice(0, rest.indexOf(";") + 1));
    }
  }
  return bodies;
}

function returnsUndo(tool: string): boolean {
  return executorBodies(tool).some((body) => /\bundo\b/.test(body));
}

const MUTATING = ALL_HUBCHAT_TOOL_NAMES.filter(isStateMutatingTool);

describe("logic-03: мутуючий тул або в TOOL_RISK, або з undo", () => {
  it("sanity: екстрактор бачить undo там, де він точно є", () => {
    expect(returnsUndo("create_habit")).toBe(true);
    expect(returnsUndo("set_budget_limit")).toBe(true);
    expect(executorBodies("query_habits").length).toBeGreaterThan(0);
  });

  it.each(MUTATING)(
    "%s: TOOL_RISK, undo або причина в KNOWN_NO_UNDO",
    (tool) => {
      expect(
        executorBodies(tool).length,
        `не знайшов виконавця для "${tool}" у chatActions/**`,
      ).toBeGreaterThan(0);
      if (tool in TOOL_RISK) return;
      if (tool in KNOWN_NO_UNDO) {
        expect(
          returnsUndo(tool),
          `"${tool}" уже повертає undo — прибери запис із KNOWN_NO_UNDO`,
        ).toBe(false);
        return;
      }
      expect(
        returnsUndo(tool),
        `"${tool}" мутує стан, але не повертає undo і не має режиму в ` +
          "TOOL_RISK (packages/shared/src/lib/toolRisk.ts). Додай undo " +
          "(reverse-snapshot з канонічного кешу) або зареєструй ризик.",
      ).toBe(true);
    },
  );

  it("KNOWN_NO_UNDO містить лише мутуючі тули поза TOOL_RISK", () => {
    for (const tool of Object.keys(KNOWN_NO_UNDO)) {
      expect(MUTATING, tool).toContain(tool);
      expect(tool in TOOL_RISK, `${tool} уже в TOOL_RISK`).toBe(false);
    }
  });
});
