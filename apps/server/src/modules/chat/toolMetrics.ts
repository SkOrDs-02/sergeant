/**
 * Per-tool інвокейшн-метрика (PR-12.C аудиту 2026-04-26).
 *
 * Чому окремий модуль:
 * 1. `chat.ts` уже великий (~730 LOC); виносимо чисту функцію типу-маперу.
 * 2. Тестується ізольовано без mock-у `prom-client` глобально.
 *
 * Контракт:
 * - `recordToolProposals(toolUses)` — викликається на першому кроці після
 *   успішного виклику Anthropic, коли модель повернула tool_use-блоки.
 * - `recordToolExecutions(toolResults, toolCallsRaw)` — на другому кроці,
 *   коли клієнт прислав tool_result-и: маперимо `tool_use_id → name` через
 *   `tool_calls_raw` і інкрементимо `executed`. Якщо `tool_use_id` не
 *   мапиться — інкрементимо `unknown_tool` з placeholder ім'ям.
 *
 * Tool name мітка ОБМЕЖЕНА відомими TOOL-ами (whitelist із `tools.ts`),
 * щоб уникнути cardinality explosion, якщо клієнт надішле довільний `name`.
 */
import { chatToolInvocationsTotal } from "../../obs/metrics.js";
import { TOOLS } from "./tools.js";

/** Whitelist дозволених імен (з реєстру `TOOLS`). */
const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));

export interface ToolResultLike {
  tool_use_id: string;
}

/** Загальний guard: блок поза whitelist отримує label "unknown". */
function safeName(name: string): string {
  return KNOWN_TOOL_NAMES.has(name) ? name : "unknown";
}

/**
 * Інкрементить `chat_tool_invocations_total{tool, outcome=proposed}` для
 * кожного `tool_use`-блоку у Anthropic-response. Сторонній блок (text) ігнорується.
 */
export function recordToolProposals(
  contentBlocks: ReadonlyArray<Record<string, unknown>>,
  inc: (labels: { tool: string; outcome: string }) => void = (l) =>
    chatToolInvocationsTotal.inc(l),
): void {
  for (const block of contentBlocks) {
    if (block.type !== "tool_use") continue;
    if (typeof block.name !== "string" || block.name.length === 0) continue;
    inc({ tool: safeName(block.name), outcome: "proposed" });
  }
}

/**
 * Будує мапу `tool_use_id → name` із сирого `tool_calls_raw` (це той самий
 * масив, що ми повернули клієнту як `tool_calls_raw` на першому кроці).
 * Все, що не схоже на tool_use-блок, ігноруємо.
 */
export function buildToolUseIdToNameMap(
  toolCallsRaw: ReadonlyArray<unknown>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of toolCallsRaw) {
    if (
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "tool_use" &&
      typeof (block as { id?: unknown }).id === "string" &&
      typeof (block as { name?: unknown }).name === "string"
    ) {
      const b = block as { id: string; name: string };
      if (b.id && b.name) map.set(b.id, b.name);
    }
  }
  return map;
}

/**
 * Інкрементить `chat_tool_invocations_total{tool, outcome=executed}` для
 * кожного `tool_result`, чий `tool_use_id` змапився на ім'я з `tool_calls_raw`.
 * Інакше — `outcome=unknown_tool` з `tool="unknown"`.
 */
export function recordToolExecutions(
  toolResults: ReadonlyArray<ToolResultLike>,
  toolCallsRaw: ReadonlyArray<unknown>,
  inc: (labels: { tool: string; outcome: string }) => void = (l) =>
    chatToolInvocationsTotal.inc(l),
): void {
  const idToName = buildToolUseIdToNameMap(toolCallsRaw);
  for (const r of toolResults) {
    const name = idToName.get(r.tool_use_id);
    if (name) {
      inc({ tool: safeName(name), outcome: "executed" });
    } else {
      inc({ tool: "unknown", outcome: "unknown_tool" });
    }
  }
}
