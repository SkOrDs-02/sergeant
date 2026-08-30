import { handleFinykAction } from "./chatActions/finykActions";
import { handleQueryFinykAction } from "./chatActions/queryFinykActions";
import { handleFizrukAction } from "./chatActions/fizrukActions";
import { handleQueryFizrukAction } from "./chatActions/queryFizrukActions";
import { handleRoutineAction } from "./chatActions/routineActions";
import { handleQueryRoutineAction } from "./chatActions/queryRoutineActions";
import { handleNutritionAction } from "./chatActions/nutritionActions";
import { handleQueryNutritionAction } from "./chatActions/queryNutritionActions";
import { handleCrossAction } from "./chatActions/crossActions";
import {
  handleAsyncChatAction,
  ASYNC_CHAT_ACTION_NAMES,
} from "./chatActions/serverActions";
import { captureRoutineWrites } from "./chatActions/routinePersistence";
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
  /** Див. `ChatActionUndoableResult.confirm` — підтвердження довговічності. */
  confirm?: Promise<boolean>;
}

/**
 * Результат одного виконаного tool-call-у.
 *
 * `ok` додано разом з емітером `hubchat_tool_invoked`: до того успіх/провал
 * кодувався ЛИШЕ префіксом тексту, тож єдиний спосіб їх розрізнити ззовні —
 * порівнювати рядки з копірайтом. Прапорець робить сигнал структурним.
 */
export interface ExecutedActionResult {
  name: string;
  result: string;
  ok: boolean;
  /**
   * Тривалість саме ЦЬОГО виклику, мс. Міряється всередині, бо
   * `executeActions` виконує батч через `Promise.all` — ззовні видно лише
   * тривалість найповільнішого, і приписати її кожному інструменту означало
   * б завищити всі, крім одного.
   */
  latencyMs: number;
  undo?: (() => void) | undefined;
}

function normalize(out: ChatActionResult | undefined): ExecutedAction | null {
  if (out == null) return null;
  if (typeof out === "string") return { result: out };
  // `exactOptionalPropertyTypes` — опційні поля або є, або їх нема; явний
  // `undefined` не присвоюється.
  return {
    result: out.result,
    ...(out.undo ? { undo: out.undo } : {}),
    ...(out.confirm ? { confirm: out.confirm } : {}),
  };
}

/**
 * Текст, який їде моделі замість «зроблено», коли запис не долетів до
 * локальної бази. Формулювання навмисно каже, ЩО робити далі: модель
 * переказує його користувачу дослівно, і «сталася помилка» без наступного
 * кроку тут гірше за мовчання.
 */
const WRITE_NOT_PERSISTED =
  "Не вдалося зберегти зміну: локальна база ще не готова. " +
  "Скажи про це користувачу й попроси повторити за кілька секунд — " +
  "НЕ стверджуй, що дію виконано.";

/**
 * Дочекатися підтвердження довговічності й повернути чесний результат.
 *
 * AI-DANGER: без цього кроку tool-шлях рапортує успіх на факті «передав у
 * dual-write». Коли boot-кластер модуля ще не змонтувався, dual-write —
 * гарантований no-op, і асистент повідомляє про дію, якої не сталося
 * (браузерний QA 2026-08-24, F-12: «Зробив це — відмітив Медитацію», а
 * лічильник дня лишився 0/3 і в sync-лозі порожньо).
 */
async function settle(
  name: string,
  out: ExecutedAction,
  ok: boolean,
): Promise<Omit<ExecutedActionResult, "latencyMs">> {
  if (!out.confirm) {
    return {
      name,
      result: out.result,
      ok,
      ...(out.undo ? { undo: out.undo } : {}),
    };
  }
  let persisted = false;
  try {
    persisted = await out.confirm;
  } catch {
    persisted = false;
  }
  // Undo прибираємо разом із результатом: реверсити нема чого, а кнопка
  // «скасувати» під відмовою читалась би як «дію все-таки виконано».
  // Незбережений запис — це НЕ успіх, хай навіть хендлер не кинув: саме цей
  // випадок дав F-12 («зробив це» при лічильнику 0/3). Телеметрія має
  // бачити його провалом, інакше leaderboard рахуватиме фантомні виклики.
  if (!persisted) return { name, result: WRITE_NOT_PERSISTED, ok: false };
  return {
    name,
    result: out.result,
    ok,
    ...(out.undo ? { undo: out.undo } : {}),
  };
}

function dispatch(action: ChatAction): ExecutedAction & { ok: boolean } {
  try {
    const handled =
      normalize(handleFinykAction(action)) ??
      normalize(handleQueryFinykAction(action)) ??
      normalize(handleFizrukAction(action)) ??
      normalize(handleQueryFizrukAction(action)) ??
      normalize(handleRoutineAction(action)) ??
      normalize(handleQueryRoutineAction(action)) ??
      normalize(handleNutritionAction(action)) ??
      normalize(handleQueryNutritionAction(action)) ??
      normalize(handleCrossAction(action));
    // `ok` виводимо зі СТРУКТУРИ, а не з тексту результату. Раніше єдиним
    // сигналом провалу був префікс рядка («Помилка виконання: …»), і будь-яка
    // телеметрія мусила б його винюхувати — крихко й мовчазно ламається при
    // зміні копірайту.
    if (handled == null) {
      return { result: `Невідома дія: ${action.name}`, ok: false };
    }
    return { ...handled, ok: true };
  } catch (e) {
    return {
      result: `Помилка виконання: ${e instanceof Error ? e.message : String(e)}`,
      ok: false,
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
    return `Tool ${action.name} вимагає async виконання, викличте executeActions().`;
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
): Promise<ExecutedActionResult[]> {
  return Promise.all(
    actions.map(async (action) => {
      const startedAt = performance.now();
      const withLatency = (r: Omit<ExecutedActionResult, "latencyMs">) => ({
        ...r,
        latencyMs: Math.round(performance.now() - startedAt),
      });
      // Async (server-side) tools проходять окремою гілкою — їхній результат
      // — Promise<string>, який не вписується у sync-`dispatch(...)` ?? -чейн.
      if (ASYNC_CHAT_ACTION_NAMES.has(action.name)) {
        try {
          const result = await handleAsyncChatAction(action);
          if (typeof result === "string") {
            return withLatency({ name: action.name, result, ok: true });
          }
          if (result) {
            return withLatency({
              name: action.name,
              result: result.result,
              ok: true,
              ...(result.undo ? { undo: result.undo } : {}),
            });
          }
          return withLatency({
            name: action.name,
            result: `Невідома дія: ${action.name}`,
            ok: false,
          });
        } catch (e) {
          return withLatency({
            name: action.name,
            result: `Помилка виконання: ${e instanceof Error ? e.message : String(e)}`,
            ok: false,
          });
        }
      }
      const { value: out } = captureRoutineWrites(() => dispatch(action));
      return withLatency(await settle(action.name, out, out.ok));
    }),
  );
}
