import { isStateMutatingTool } from "@sergeant/shared";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";
import type { AnthropicContentBlock } from "./chatShared.js";
import { callAnthropicWithContinuation } from "./chatUpstream.js";
import { firstTurnReasoningPayload } from "./chatReasoning.js";
import {
  buildSecondRoundToolsPayload,
  toolNamesFromRawCalls,
} from "./promptCache.js";
import { recordToolProposals } from "./toolMetrics.js";
import { replaceLongDash } from "../../lib/modelText.js";

/**
 * Другий раунд інструментів у ході чату (С-2 (б), спека
 * `docs/work/specs/hubchat-second-tool-round.md`).
 *
 * Хід чату: перший виклик моделі обирає інструменти, клієнт їх виконує, тур
 * синтезу пише текст. Якщо людина просить «видали ту каву», модель першим
 * викликом лише шукає, а записати могла б тільки наступним повідомленням.
 * Тут, перед синтезом, модель першого ходу ще раз бачить розмову з
 * результатом пошуку і інструменти запису. Обрала запис — сервер віддає ці
 * виклики клієнту замість синтезу; ні — звичайний синтез, ніби раунду не було.
 *
 * AI-DANGER: стеля два раунди тримається формою запиту, а не прапорцем від
 * клієнта. Раунд можливий лише тоді, коли ВСІ виклики в `tool_calls_raw`
 * належать `SECOND_ROUND_LOOKUP_TOOL_NAMES`, а відповідь раунду приймається,
 * лише коли ВСІ її виклики є записом. Запит синтезу після другого раунду несе
 * обидва раунди, тобто запис, і права на третій уже не має. Відповідь несе
 * квиток із позначкою «раунд 2» (`chatRoundTripTicket.ts`), тож хід коштує
 * одну одиницю (AI-5); запит, оплачений таким квитком, другого раунду не
 * отримує навіть із підробленим «пошуком», тож безкоштовних викликів моделі
 * по колу немає. Раунд отримує лише клієнт, що про це попросив
 * (`second_tool_round` у запиті): старий бандл чекає на текст.
 */

/**
 * Інструменти першого раунду, після яких другий раунд можливий.
 *
 * Лише пошук операцій: його опис прямо каже «використовуй перед
 * категоризацією» (`toolDefs/finyk.ts`), а реєстр класів зве його «пошук id
 * для наступної дії» (`@sergeant/shared` `toolOutcomeClass.ts`). Звичайне
 * читання (`aggregate_spending`, `query_transactions`) другого раунду не
 * отримує: інакше кожна відповідь «скільки я витратив» чекала б ще один
 * виклик моделі, не даючи нічого.
 */
export const SECOND_ROUND_LOOKUP_TOOL_NAMES: ReadonlySet<string> = new Set([
  "find_transaction",
]);

/** Стеля одного запиту другого раунду: пошук уже коштував людині очікування. */
const SECOND_ROUND_TIMEOUT_MS = 12_000;

/** Відповідь другого раунду: та сама форма, що й `tool_calls`-відповідь першого ходу. */
export interface SecondRoundBody {
  text: string | null;
  tool_calls: Array<{ id: string; name: string; input: unknown }>;
  tool_calls_raw: AnthropicContentBlock[];
}

/** Чи має цей запит синтезу право на другий раунд. */
export function isSecondRoundEligible(toolCallsRaw: unknown): boolean {
  if (env.CHAT_SECOND_TOOL_ROUND !== "on") return false;
  const names = toolNamesFromRawCalls(toolCallsRaw);
  return (
    names.length > 0 &&
    names.every((n) => SECOND_ROUND_LOOKUP_TOOL_NAMES.has(n))
  );
}

/**
 * Приймає відповідь другого раунду, лише якщо кожен її виклик є записом.
 * Читання в другому раунді означало б третій хід за даними, тож такої
 * відповіді не приймаємо зовсім: далі звичайний синтез.
 */
export function pickSecondRoundWrites(
  content: readonly AnthropicContentBlock[],
  maxToolUses: number,
): AnthropicContentBlock[] | null {
  const toolUses = content.filter((b) => b.type === "tool_use");
  if (toolUses.length === 0 || toolUses.length > maxToolUses) return null;
  const allWrites = toolUses.every(
    (b) => typeof b.name === "string" && isStateMutatingTool(b.name),
  );
  return allWrites ? toolUses : null;
}

export interface SecondRoundInput {
  apiKey: string;
  /** Історія розмови, як на першому ході (уже маскована й вичищена). */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** `tool_calls_raw` першого раунду в тій формі, що бачить синтез. */
  toolCallsRaw: unknown[];
  /** Результати першого раунду після `prepareToolResults`. */
  toolResultMessages: unknown[];
  system: unknown;
  activeModules: Parameters<typeof buildSecondRoundToolsPayload>[1];
  healthConsent: boolean;
  /** Скільки `tool_use` ще можна додати до ходу (стеля M7 мінус перший раунд). */
  maxToolUses: number;
  signal: AbortSignal;
  traceId: string;
  userId: string | undefined;
  promptVersion: string;
}

/**
 * Один виклик моделі першого ходу з інструментами запису. Повертає тіло
 * відповіді з викликами або `null`, коли раунду не буде: модель не обрала
 * запис, обрала щось інше, або виклик упав. Збій тут не валить хід: людина
 * отримує звичайний синтез результату пошуку, як до цієї зміни.
 */
export async function requestSecondToolRound(
  input: SecondRoundInput,
): Promise<SecondRoundBody | null> {
  const payload = {
    model: env.CHAT_MODEL_FIRST_TURN,
    max_tokens: 1500,
    system: input.system,
    tools: buildSecondRoundToolsPayload(
      toolNamesFromRawCalls(input.toolCallsRaw),
      input.activeModules,
      input.healthConsent,
    ),
    messages: [
      ...input.history,
      { role: "assistant", content: input.toolCallsRaw },
      { role: "user", content: input.toolResultMessages },
    ],
    ...firstTurnReasoningPayload(),
  };

  let content: AnthropicContentBlock[];
  try {
    const { response, data } = await callAnthropicWithContinuation(
      input.apiKey,
      payload,
      {
        timeoutMs: SECOND_ROUND_TIMEOUT_MS,
        maxTotalMs: SECOND_ROUND_TIMEOUT_MS,
        endpoint: "chat-second-round",
        signal: input.signal,
        promptVersion: input.promptVersion,
        traceId: input.traceId,
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
      },
    );
    if (!response?.ok) {
      logger.warn({
        msg: "chat_second_round_upstream_failed",
        status: response?.status ?? null,
      });
      return null;
    }
    content = data?.content ?? [];
  } catch (e) {
    // Клієнт пішов — синтезу теж не буде, хай його обробить звичайний шлях.
    logger.warn({
      msg: "chat_second_round_failed",
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }

  const writes = pickSecondRoundWrites(content, input.maxToolUses);
  if (!writes) return null;

  recordToolProposals(content);
  const text = replaceLongDash(
    content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n"),
  );
  return {
    text: text || null,
    tool_calls: writes.map((t) => ({
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      input: t.input,
    })),
    tool_calls_raw: content,
  };
}
