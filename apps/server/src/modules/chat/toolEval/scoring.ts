/**
 * Оцінювання стенду вибору інструментів - усе, що не потребує мережі.
 *
 * Витягнуто зі `scripts/tool-selection-eval.ts` тією ж логікою, якою у Фазі 2
 * переїхали кейси: `scripts/` не входить у `include` серверного tsconfig, тож
 * ані typecheck, ані vitest туди не дістають. Поки оцінювання жило там, його
 * не міг перевірити жоден тест, а помилка в ньому виглядала б як помилка
 * моделі.
 */

import { TOOLS } from "../tools.js";
import type { AnthropicTool } from "../toolDefs/types.js";
import type { ToolCase } from "../toolSelectionCases/index.js";

/** Блок відповіді моделі у форматі Anthropic (звужено до потрібного стенду). */
export interface EvalBlock {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  input?: unknown;
}

/**
 * Read-only інструменти - усе інше вважаємо записом.
 *
 * AI-CONTEXT: список навмисно інвертований. Перелічити write-дієслова
 * (`create_`, `mark_`, `log_`…) виглядає природніше, але тоді новий інструмент
 * із незнайомим дієсловом мовчки випадає з перевірки - так повз неї проходять
 * `change_category`, `finish_workout`, `reorder_habits`, `forget`. При інверсії
 * незнайоме імʼя за замовчуванням перевіряється: гірше, що може статися -
 * хибне спрацювання на read-і, і воно видно у звіті.
 */
export const READ_ONLY = (name: string): boolean =>
  /^(query_|aggregate_|compare_|get_|list_|find_|export_|suggest_|recall_|my_)/.test(
    name,
  ) ||
  /(_stats|_trend|_progress|_breakdown|_averages|_correlation)$/.test(name);

function idFields(tool: AnthropicTool): string[] {
  const properties = (
    tool.input_schema as { properties?: Record<string, unknown> }
  ).properties;
  return Object.keys(properties ?? {}).filter(
    (k) => k.endsWith("_id") || k.endsWith("_ids"),
  );
}

/**
 * Реєстр «write-інструмент → його поля-ідентифікатори», виведений з `TOOLS`.
 * Список навмисно не захардкоджений: реєстр росте, а забутий у списку
 * інструмент - це мовчазна дірка в перевірці, а не помилка компіляції.
 */
export const WRITE_ID_FIELDS = new Map<string, string[]>(
  TOOLS.filter((t) => !READ_ONLY(t.name))
    .map((t) => [t.name, idFields(t)] as const)
    .filter(([, fields]) => fields.length > 0),
);

/** Імена інструментів, викликаних у цій відповіді, з серіалізованими аргументами. */
export function pickedFrom(blocks: EvalBlock[]): string[] {
  return blocks
    .filter((b) => b.type === "tool_use" && b.name)
    .map((b) => `${b.name}(${JSON.stringify(b.input ?? {})})`);
}

/** Чи названий інструмент `name` серед викликаних. */
function hit(picked: string[], name: string): boolean {
  return picked.some((p) => p.startsWith(`${name}(`));
}

/**
 * Правильність вибору на ПЕРШОМУ ході. Три режими, бо «правильно» означає
 * різне: стриманість (не викликати нічого), повнота (виклик кожного з
 * переліку), і звичайне влучання в один із прийнятних.
 */
export function scoreCase(toolCase: ToolCase, picked: string[]): boolean {
  if (toolCase.expectNoTool) return picked.length === 0;
  if (toolCase.requireAll) return toolCase.accept.every((a) => hit(picked, a));
  if (toolCase.acceptRefusal && picked.length === 0) return true;
  return toolCase.accept.some((a) => hit(picked, a));
}

/** Чи влучив хід ланцюжка в один із очікуваних інструментів. */
export function scoreTurn(accept: string[], picked: string[]): boolean {
  return accept.some((a) => hit(picked, a));
}

/**
 * Чи зробила модель одразу те, заради чого існував увесь ланцюжок.
 *
 * Потрібно, бо годувати модель результатом розвідки після того, як вона вже
 * зробила цільовий виклик, означає міряти діалог, якого не буває. Коротший шлях
 * до тієї самої дії - не помилка, і сценарій на ньому просто зупиняється.
 */
export function reachedFinalTurn(
  toolCase: ToolCase,
  picked: string[],
): boolean {
  const turns = toolCase.turns ?? [];
  const last = turns[turns.length - 1];
  return last ? scoreTurn(last.accept, picked) : false;
}

/**
 * Ідентифікатори у write-викликах, яких моделі ніхто не давав: усе, чого немає
 * дослівно в контексті, вона вигадала.
 *
 * `context` накопичується по ходах - системний промпт, блок ДАНІ, репліка
 * користувача і КОЖЕН уже відданий `tool_result`. Без накопичення id, чесно
 * прочитаний із результату першого ходу, на другому рахувався б як вигаданий,
 * і перевірка звинувачувала б модель рівно за ту поведінку, якої від неї
 * домагаються.
 */
export function hallucinatedIds(
  blocks: EvalBlock[],
  context: string,
): string[] {
  const haystack = context.toLowerCase();
  const found: string[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || !block.name) continue;
    const fields = WRITE_ID_FIELDS.get(block.name);
    if (!fields) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;
    for (const field of fields) {
      const raw = input[field];
      if (raw == null) continue;
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        const asText = String(value).trim();
        if (asText && !haystack.includes(asText.toLowerCase())) {
          found.push(`${block.name}.${field}=${asText}`);
        }
      }
    }
  }
  return found;
}
