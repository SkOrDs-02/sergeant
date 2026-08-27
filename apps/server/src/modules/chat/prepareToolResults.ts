/**
 * Підготовка `tool_result`-блоків для другого туру `/api/chat`.
 *
 * Три кроки одного конвеєра, і **порядок між ними — інваріант безпеки**, а не
 * стилістика. Тому вони живуть тут разом, а не розкидані по хендлеру: щойно
 * їх видно поруч, переставити маску місцями стає помітно на ревʼю.
 *
 *   1. **Маска** (`maskMachineText`) — PII на вихід за периметр.
 *   2. **Усічення** (`truncateToolResults`) — бюджет вхідних токенів.
 *   3. **Огорожа + сканер** (`wrapAndScanToolResults`) — M8, анти-інʼєкція.
 *
 * AI-DANGER: маска стоїть ПЕРЕД усіченням, і це не взаємозамінно.
 * `truncateToolResults` кладе ПОВНИЙ оригінал у Sentry-breadcrumb
 * (`data.full`), а `applyBeforeBreadcrumb` чистить `data` лише для
 * `category: "http"` — тобто при масці після усічення сирі імена контрагентів
 * та IBAN-и їхали в Sentry повз рішення founder-а #10. Sentry — теж «за
 * периметром». Маскуємо рівно один раз, до обох стоків.
 * Знахідка B2, `docs/90-work/audits/ai-pipeline-2026-08-05.md`.
 *
 * Тест, що це стереже, дивиться саме на breadcrumb, а не на payload
 * (`chat.redaction.test.ts`): payload лишається чистим в обох порядках, тож
 * перевірка payload-у регресію не ловить.
 *
 * Винесено з `chat.ts` під module-size cap (Hard Rule #18).
 */

import { chatPromptInjectionAttemptTotal } from "../../obs/metrics.js";
import { emitSecurityEvent } from "../../obs/securityEvents.js";
import { maskMachineText } from "../../lib/llmRedaction.js";
import {
  truncateToolResults,
  type RawToolResult,
} from "./toolResultTruncation.js";
import { wrapAndScanToolResults } from "./toolOutputWrapping.js";

/** Готовий до відправки `tool_result`-блок Anthropic Messages API. */
export interface ToolResultMessage {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export interface PrepareToolResultsOptions {
  /** Імена контрагентів користувача — клас Б маскування. */
  knownValues: string[];
  /** Request-id для Sentry-breadcrumb-а усічення. */
  requestId?: string | undefined;
}

/**
 * Маскує → усікає → загортає в `<tool_output>` і повертає блоки, готові лягти
 * у `messages`. Вхідний масив не мутується.
 *
 * `ToolResult.content` за схемою — `string | number | boolean`
 * (`packages/shared/src/schemas/api.ts`), тож нерядкові значення PII не несуть
 * і маски не потребують; усічення їх усе одно приведе до рядка.
 */
export function prepareToolResults(
  toolResults: ReadonlyArray<RawToolResult>,
  toolCallsRaw: ReadonlyArray<unknown>,
  { knownValues, requestId }: PrepareToolResultsOptions,
): ToolResultMessage[] {
  const masked = toolResults.map((r) =>
    typeof r.content === "string"
      ? { ...r, content: maskMachineText(r.content, knownValues) }
      : r,
  );

  const truncated = truncateToolResults(masked, { requestId });

  // M8 — SYSTEM_PREFIX (v8+) інструктує модель трактувати все всередині
  // envelope як ДАНІ. Захищає від скомпрометованого upstream (Mono webhook,
  // n8n response), який підкладає "ignore previous instructions and …".
  const wrapped = wrapAndScanToolResults(truncated, toolCallsRaw, {
    recordInjectionAttempt: (labels) => {
      try {
        chatPromptInjectionAttemptTotal.inc(labels);
      } catch {
        /* prom-client може бути не ініціалізований у тестах — no-op */
      }
      emitSecurityEvent({
        event: "prompt_injection_attempt",
        severity: "high",
        details: `tool=${labels.tool}`,
      });
    },
  });

  return wrapped.map((r) => ({
    type: "tool_result" as const,
    tool_use_id: r.tool_use_id,
    content: r.content,
  }));
}
