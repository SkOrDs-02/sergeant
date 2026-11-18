import { getToolModule } from "@sergeant/shared";
import { isFailureResult } from "../../lib/hubChatActionCards";
import { hasTechnicalIds } from "../../lib/chatDisplayText";

/**
 * С-2 (а), спека `docs/work/specs/hubchat-find-then-change.md`: «знайди, потім
 * зміни ту» наступним повідомленням.
 *
 * AI-CONTEXT: історія, яку клієнт шле серверу, — лише текст реплік
 * (`useChatSend`, `history`), а модель за правилом промпту переказує
 * результат «без id». Тож id, знайдений на попередньому ході, до моделі на
 * наступному не доїжджав, і «перенеси ту в Кафе» закінчувалось повторним
 * пошуком (один раунд інструментів на хід) або вигаданим id. Тепер
 * результати інструментів із технічними id запамʼятовуються на репліці
 * асистента (`toolRefs`) і наступний хід дописує їх у блок ДАНІ — саме звідти
 * промпт велить брати id для запису (`NO_INVENTED_ARGS_RULE`).
 *
 * Памʼятаємо лише ОСТАННЮ відповідь (дефолт § 11.8, погоджено founder-ом
 * 2026-11-18): репліка без `toolRefs` між пошуком і «зміни ту» обриває
 * ланцюжок, і модель іде шукати знову.
 */

/** Заголовок блоку в ДАНІ; той самий рядок стоїть у кейсі tool-eval. */
export const TURN_REFS_HEADING = "[Записи з попередньої відповіді]";

/**
 * Стеля блоку. Число — стеля одного `tool_result` у контракті чату
 * (`ToolResult.content` `max(8000)`, `packages/shared/src/schemas/api.ts`):
 * блок не несе більше, ніж модель уже бачила одним результатом.
 */
export const TURN_REFS_MAX_CHARS = 8000;

/**
 * Модулі, чиї результати можна повторно класти в контекст. Фізрук, Харчування
 * й памʼять сюди не входять: серверний гейт здоровʼя (`healthGate.ts`)
 * розпізнає health лише за відомими рядками знімка, а не за довільним блоком,
 * тож без згоди такі дані проскочили б до моделі (рішення 2026-09-29,
 * `hub-coach.md` § Журнал рішень). Розширення — відкрите питання спеки.
 */
const REF_MODULES: ReadonlySet<string> = new Set(["finyk", "routine"]);

interface TurnCall {
  name: unknown;
}

interface TurnResult {
  result: string;
  ok: boolean;
}

/**
 * Результати ходу, з яких наступне повідомлення може взяти id. `undefined`,
 * якщо таких немає (лише агрегати, відмови або модулі поза `REF_MODULES`).
 */
export function collectTurnRefs(
  toolCalls: ReadonlyArray<TurnCall>,
  results: ReadonlyArray<TurnResult>,
): string | undefined {
  const lines: string[] = [];
  let size = 0;
  toolCalls.forEach((tc, idx) => {
    const r = results[idx];
    const name = typeof tc.name === "string" ? tc.name : "";
    if (!r || !r.ok || !name) return;
    if (!REF_MODULES.has(getToolModule(name))) return;
    if (isFailureResult(r.result, name) || !hasTechnicalIds(r.result)) return;
    const line = `- ${name}: ${r.result.replace(/\s*\n\s*/g, " ")}`;
    if (size + line.length + 1 > TURN_REFS_MAX_CHARS) return;
    lines.push(line);
    size += line.length + 1;
  });
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** `toolRefs` останньої репліки асистента, якщо вона їх несе. */
export function lastTurnRefs(
  messages: ReadonlyArray<{ role: string; toolRefs?: unknown }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const refs = m.toolRefs;
    return typeof refs === "string" && refs ? refs : undefined;
  }
  return undefined;
}

/** `{ toolRefs }` для репліки асистента або `{}`, якщо записів немає. */
export function turnRefsField(
  toolCalls: ReadonlyArray<TurnCall>,
  results: ReadonlyArray<TurnResult>,
): { toolRefs?: string } {
  const toolRefs = collectTurnRefs(toolCalls, results);
  return toolRefs ? { toolRefs } : {};
}

/**
 * Контекст ходу з блоком записів останньої відповіді (`messages` — історія ДО
 * нового повідомлення) в кінці; без записів контекст той самий.
 */
export function withTurnRefs(
  context: string,
  messages: ReadonlyArray<{ role: string; toolRefs?: unknown }>,
): string {
  const refs = lastTurnRefs(messages);
  return refs ? `${context}\n\n${TURN_REFS_HEADING}\n${refs}` : context;
}

/**
 * Текстова історія, яку клієнт шле серверу (`messages`): лише репліки
 * людини й асистента, останні 10. Винесено з `useChatSend.ts` (Hard Rule #18).
 * Записи `toolRefs` сюди НЕ йдуть: вони живуть у блоці ДАНІ (`withTurnRefs`).
 */
export function historyForServer(
  messages: ReadonlyArray<{ role: string; text: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return (
    messages
      .filter(
        (m): m is { role: "user" | "assistant"; text: string } =>
          m.role === "user" || m.role === "assistant",
      )
      // Порожня відповідь (обірваний або скасований синтез) у history
      // валить zod-валідацію сервера, і вся розмова ламається до «Нова».
      .filter((m) => m.text.trim() !== "")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.text }))
  );
}
