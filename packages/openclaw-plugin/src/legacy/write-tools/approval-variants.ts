/**
 * Approval flow для write-tools — Variant A / B / C.
 *
 * PoC спрямований відповісти на питання: котра з трьох форм — найкраща
 * default ставка для Phase 4 (PR-D)?
 *
 *   • Variant A — native: SDK-флаг `requiresConfirmation: true`. Runtime
 *     показує built-in approve/reject UX перед `execute()`. Найдешевше,
 *     але UX не наша; зміну тексту = форк SDK.
 *
 *   • Variant B — custom hook: `tool_call_pre` ловить write-tool name,
 *     api.services.messaging.send() з custom inline-keyboard, чекає
 *     callback (waitForCallback). Своя UX. Контроль over text/markup.
 *     Locked decision plan §724 — default ставка.
 *
 *   • Variant C — hybrid: native A + наша audit-логіка у `tool_call_pre`
 *     (запис у `openclaw_write_audit`). Native UX, наш audit. Spectrum
 *     between.
 *
 * Цей файл містить чисту логіку approval-decision (без SDK-side effects),
 * щоб тести могли її прокрутити в hermetic-mode. Реальні side effects
 * (SDK calls) живуть у `create-github-issue.ts`.
 */

export type ApprovalVariant = "A" | "B" | "C";

export interface ApprovalContext {
  invocationId: string;
  agentRunId: string;
  founderUserId: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  variant: ApprovalVariant;
}

export type ApprovalDecisionStatus =
  | "approved"
  | "rejected"
  | "timeout"
  | "skip"; // SDK-natively gated → plugin не робить додаткове checkbox

export interface ApprovalDecision {
  status: ApprovalDecisionStatus;
  reason: string;
  /** ms spent waiting for user (for latency telemetry). */
  latencyMs: number;
  /** Опціональні metadata для audit log-у. */
  metadata?: Record<string, unknown>;
}

export interface ApprovalRecorder {
  record: (decision: ApprovalDecision & ApprovalContext) => Promise<void>;
}

/**
 * Builds approval prompt text shown to founder. Стабільний у всіх Variant
 * (B показує так, як є; A — SDK-prompt, але plugin може передати text у
 * `requiresConfirmation` з Phase 1 коли SDK додасть customMessage).
 */
export function renderApprovalPrompt(
  toolName: string,
  params: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(`🛠 ${toolName} requested.`);
  for (const [key, value] of Object.entries(params)) {
    const valueStr = typeof value === "string" ? value : JSON.stringify(value);
    const trimmed =
      valueStr.length > 200 ? `${valueStr.slice(0, 200)}…` : valueStr;
    lines.push(`  • ${key}: ${trimmed}`);
  }
  lines.push("");
  lines.push("Approve or Reject?");
  return lines.join("\n");
}

/**
 * Pure decoder для callback-data, що повертає Variant B після кліку
 * inline-keyboard кнопки. Очікує форму `approve:${invocationId}` /
 * `reject:${invocationId}`.
 */
export function decodeApprovalCallback(callbackData: string): {
  status: "approved" | "rejected" | "unknown";
  invocationId?: string;
} {
  const [verb, ...rest] = callbackData.split(":");
  const id = rest.join(":");
  if (verb === "approve") return { status: "approved", invocationId: id };
  if (verb === "reject") return { status: "rejected", invocationId: id };
  return { status: "unknown" };
}

/**
 * Сирі inline-keyboard markup для Telegram у Variant B. Тільки два
 * кнопки; інша SDK-сторона (наприклад WhatsApp у Phase 8) переформатує
 * structured `replyMarkup` під свій канал.
 */
export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export function buildApprovalKeyboard(
  invocationId: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve:${invocationId}` },
        { text: "❌ Reject", callback_data: `reject:${invocationId}` },
      ],
    ],
  };
}

/**
 * Чи плагін має робити власну approval gate перед `execute()`?
 *   • A → ні, SDK сам це робить (plugin лише асертить факт)
 *   • B → так, plugin sendи prompt + чекає callback
 *   • C → ні (SDK гейтить); але плагін все одно записує audit (decision='approved')
 */
export function shouldRunCustomApprovalGate(variant: ApprovalVariant): boolean {
  return variant === "B";
}

/**
 * Should plugin set `requiresConfirmation: true` на ToolDefinition?
 *   • A → так (native gating)
 *   • B → ні (plugin gates via tool_call_pre)
 *   • C → так (native gating) + plugin додає аudit
 */
export function shouldUseNativeRequiresConfirmation(
  variant: ApprovalVariant,
): boolean {
  return variant === "A" || variant === "C";
}
