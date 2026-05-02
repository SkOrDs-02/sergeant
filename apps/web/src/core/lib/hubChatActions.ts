import { handleFinykAction } from "./chatActions/finykActions";
import { handleFizrukAction } from "./chatActions/fizrukActions";
import { handleRoutineAction } from "./chatActions/routineActions";
import { handleNutritionAction } from "./chatActions/nutritionActions";
import { handleCrossAction } from "./chatActions/crossActions";
import {
  handleAsyncChatAction,
  ASYNC_CHAT_ACTION_NAMES,
} from "./chatActions/serverActions";
import type { ChatActionResult } from "./chatActions/types";

export type { ChatAction, ChatActionResult } from "./chatActions/types";

type ChatAction = import("./chatActions/types").ChatAction;

/**
 * Внутрішній уніфікований результат: завжди є `result` (текст для
 * Anthropic-`tool_result`), опційно є `undo` (reverse-snapshot, який
 * `HubChat` пропускає у `showUndoToast`).
 */
interface ExecutedAction {
  result: string;
  undo?: () => void;
}

function normalize(out: ChatActionResult | undefined): ExecutedAction | null {
  if (out == null) return null;
  if (typeof out === "string") return { result: out };
  return { result: out.result, undo: out.undo };
}

function dispatch(action: ChatAction): ExecutedAction {
  try {
    return (
      normalize(handleFinykAction(action)) ??
      normalize(handleFizrukAction(action)) ??
      normalize(handleRoutineAction(action)) ??
      normalize(handleNutritionAction(action)) ??
      normalize(handleCrossAction(action)) ?? {
        result: `Невідома дія: ${action.name}`,
      }
    );
  } catch (e) {
    return {
      result: `Помилка виконання: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Виконати один tool-call. Повертає лише текстовий результат для
 * сумісності з існуючими тестами та `tool_result`-протоколом.
 *
 * AI-CONTEXT: для отримання `undo`-функції використовуй `executeActions`
 * (множина), яка прокидає її далі у `HubChat.tsx → showUndoToast`. Тут
 * undo навмисно "проковтується" — single-tool path-у в продакшні нема,
 * а контракт `string` критичний для ~30+ існуючих юніт-тестів.
 *
 * **Async-tools** (`recall_memory` тощо, з whitelist `ASYNC_CHAT_ACTION_NAMES`)
 * не можна виконати через цю sync-функцію — вони вимагають мережевого
 * round-trip-у. Повертаємо явну помилку замість silent fallback-у на
 * "Невідома дія", щоб прод-callers (`hubChatActions.executeActions`)
 * та тести бачили однозначну інструкцію — використовувати async-API.
 */
export function executeAction(action: ChatAction): string {
  if (ASYNC_CHAT_ACTION_NAMES.has(action.name)) {
    return `Tool ${action.name} вимагає async виконання — викличте executeActions().`;
  }
  return dispatch(action).result;
}

/**
 * Execute multiple tool calls and return their results in the same order.
 *
 * Today every handler is synchronous (writes go to localStorage) so this is
 * effectively the same as `actions.map(dispatch)` — the value is in
 * pinning the API shape now. As soon as a handler needs to hit the network
 * (e.g. `compare_weeks` aggregating from `/api/...` snapshots), we can flip
 * its `handle*Action` signature to `Promise<string>` and `Promise.all` here
 * starts giving real parallelism without touching `HubChat.tsx`.
 *
 * AI-CONTEXT: parallel write-tools that target the same localStorage key can
 * race — Anthropic rarely emits two writes to the same key in one turn but
 * if it ever does, the last `JSON.parse` → mutate → `JSON.stringify` pair
 * wins. Сompose handlers so each domain owns one key per turn, or sequence
 * conflicting writes via a queue if it becomes a real problem.
 */
export async function executeActions(
  actions: ReadonlyArray<ChatAction>,
): Promise<Array<{ name: string; result: string; undo?: () => void }>> {
  return Promise.all(
    actions.map(async (action) => {
      // Async (server-side) tools проходять окремою гілкою — їхній результат
      // — Promise<string>, який не вписується у sync-`dispatch(...)` ?? -чейн.
      if (ASYNC_CHAT_ACTION_NAMES.has(action.name)) {
        try {
          const result = await handleAsyncChatAction(action);
          if (typeof result === "string") {
            return { name: action.name, result };
          }
          if (result) {
            return {
              name: action.name,
              result: result.result,
              undo: result.undo,
            };
          }
          return { name: action.name, result: `Невідома дія: ${action.name}` };
        } catch (e) {
          return {
            name: action.name,
            result: `Помилка виконання: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      }
      const out = dispatch(action);
      return { name: action.name, ...out };
    }),
  );
}
