/**
 * Другий раунд інструментів на клієнті (С-2 (б), спека
 * `docs/work/specs/hubchat-second-tool-round.md`).
 *
 * Сервер віддає виклики запису другого раунду у формі `tool_calls`-відповіді
 * першого ходу (`apps/server/src/modules/chat/chatSecondRound.ts`). Тут вони
 * проходять ті самі ворота, що й виклики першого раунду: структурний фаєрвол
 * `parseToolCalls` і підтвердження незворотного (канон §8) ПЕРЕД виконанням.
 * Нових підтверджень понад наявні раунд не додає.
 */
import type { ChatResponse } from "@sergeant/api-client";
import {
  ANALYTICS_EVENTS,
  getToolModule,
  requiresConfirmation,
} from "@sergeant/shared";
import { logger } from "@shared/lib";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { executeActions } from "../../lib/hubChatActions";
import { stripTechnicalIds } from "../../lib/chatDisplayText";
import { trackEvent } from "../../observability/analytics";
import { summarizeDestructiveToolInput } from "./destructiveConfirmSummary";
import { keepReplayableToolBlocks } from "./replayableToolBlocks";
import { parseToolCalls, type ToolCallEnvelope } from "./toolCallSchema";
import type { UseDestructiveConfirmResult } from "./useDestructiveConfirm";

type ExecutedActionResult = Awaited<ReturnType<typeof executeActions>>[number];
type ConfirmRequest = UseDestructiveConfirmResult["request"];
type ToastApi = Parameters<typeof showUndoToast>[0];

/** Пункти діалогу підтвердження для незворотних викликів батча (порожньо — діалогу немає). */
export function destructiveConfirmItems(
  toolCalls: readonly ToolCallEnvelope[],
): Array<{ name: string; summary?: string }> {
  return toolCalls
    .filter((tc) => requiresConfirmation(tc.name))
    .map((tc) => {
      const summary = summarizeDestructiveToolInput(
        tc.name,
        tc.input as Record<string, unknown>,
      );
      return summary ? { name: tc.name, summary } : { name: tc.name };
    });
}

/**
 * Телеметрія і undo-тости виконаних інструментів: одна точка для обох раундів.
 * `success` береться зі структурного `ok`, не з тексту результату.
 */
export function reportExecutedTools(
  results: readonly ExecutedActionResult[],
  toast: ToastApi,
): void {
  for (const r of results) {
    trackEvent(ANALYTICS_EVENTS.HUBCHAT_TOOL_INVOKED, {
      tool: r.name,
      module: getToolModule(r.name),
      success: r.ok,
      latency_ms: r.latencyMs,
    });
  }
  for (const r of results) {
    if (!r.undo) continue;
    // Результат пишеться для моделі й несе `(id:…)`; людині — без.
    showUndoToast(toast, { msg: stripTechnicalIds(r.result), onUndo: r.undo });
  }
}

export type SecondRoundOutcome =
  | {
      kind: "executed";
      toolCalls: ToolCallEnvelope[];
      results: ExecutedActionResult[];
      toolResults: Array<{ tool_use_id: string; content: string }>;
      /** Блоки `tool_calls_raw` другого раунду, які прийме сервер. */
      replay: unknown[];
      /** Квиток другого раунду: синтез після запису не списує ще одну одиницю (AI-5). */
      ticket?: string;
    }
  /** Людина відмовилась від незворотної дії: нічого не виконано. */
  | { kind: "cancelled" }
  /** Структурно биті виклики: нічого не виконано. */
  | { kind: "invalid" };

export async function runSecondToolRound(
  data: ChatResponse,
  deps: {
    confirm: ConfirmRequest;
    /** Підпис кроку на час виконання (С-1 (б)). */
    onExecuting: (toolNames: string[]) => void;
  },
): Promise<SecondRoundOutcome> {
  const parsed = parseToolCalls(data.tool_calls);
  if (!parsed.ok) {
    logger.warn("[hub-chat] second-round tool_calls schema mismatch", {
      issues: parsed.issues,
    });
    trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, { kind: "parse" });
    return { kind: "invalid" };
  }
  const toolCalls = parsed.value;
  const confirmItems = destructiveConfirmItems(toolCalls);
  if (confirmItems.length > 0 && !(await deps.confirm(confirmItems))) {
    return { kind: "cancelled" };
  }
  deps.onExecuting(toolCalls.map((tc) => tc.name));
  const results = await executeActions(
    toolCalls as Parameters<typeof executeActions>[0],
  );
  return {
    kind: "executed",
    toolCalls,
    results,
    toolResults: toolCalls.map((tc, idx) => ({
      tool_use_id: tc.id,
      content: results[idx]?.result ?? "",
    })),
    replay: keepReplayableToolBlocks(data.tool_calls_raw) ?? [],
    ...(data.round_trip_ticket ? { ticket: data.round_trip_ticket } : {}),
  };
}
