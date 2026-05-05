/**
 * Truncate-aware tool_result helper.
 *
 * Контекст: на другому кроці `/api/chat` клієнт надсилає `tool_results`
 * (масив `{ tool_use_id, content }`) — це сирі результати, які client
 * зібрав під час виконання tool-call-у (briefing-блоби з RoutineSync,
 * Finyk-витрати-за-місяць, Fizruk-progress-блоки тощо). Великий
 * `tool_result` контент (>≈ 2 000 chars) має 3 побічних ефекти:
 *
 * 1. Anthropic API рахує його як вхідні токени — кешуючи їх не
 *    допомагає, бо `tool_result`-content ніколи не потрапляє у
 *    cache-prefix.
 * 2. Через `max_tokens=2500` cap на відповідь, велика вхідна
 *    `tool_result`-секція з'їдає бюджет токенів і модель не встигає
 *    закінчити саму відповідь — у `chat.ts::streamOneIterationToSse`
 *    включається `auto-continuation`, але якщо кожне `iteration` знов
 *    тягне ту ж саму tool_result, обриваємось на cap-у
 *    `MAX_TEXT_CONTINUATIONS=3` без фіналу.
 * 3. У snapshot-боксах (Sentry, log-replay) повний blob "забруднює"
 *    індекс, ускладнюючи debugging.
 *
 * Рішення (PR-12.E): якщо `content` довший за поріг
 * `TOOL_RESULT_TRUNCATE_THRESHOLD`, замінюємо його на короткий summary
 * (`head` + `tail` + size), а ПОВНИЙ blob кладемо в Sentry-breadcrumb
 * категорії `chat.tool_result`, де він залишається для debug-у, але не
 * вилазить у HTTP-payload до Anthropic.
 *
 * Клієнтська схема `ToolResult.content` уже капнута на 8 000 chars
 * (`packages/shared/src/schemas/api.ts`). Цей helper працює всередині
 * того cap-у — тобто валідація на ingress лишається попередньою лінією
 * захисту, а truncation — другою (для випадків, коли клієнт навмисно
 * шле великий blob, бо «це ж дозволений ліміт»).
 */
import { Sentry } from "../../sentry.js";
import { chatToolResultTruncatedTotal } from "../../obs/metrics.js";

/** Максимальний розмір (chars) для того, щоб НЕ зачіпати content. */
export const TOOL_RESULT_TRUNCATE_THRESHOLD = 2000;

/** Скільки лишаємо з початку при truncate-і. */
const HEAD_BYTES = 600;
/** Скільки лишаємо з кінця при truncate-і. */
const TAIL_BYTES = 400;

export interface RawToolResult {
  tool_use_id: string;
  content?: unknown;
}

export interface NormalizedToolResult {
  tool_use_id: string;
  content: string;
}

/**
 * Серіалізує `content`-будь-що-non-string у короткий рядок, який модель
 * зможе зрозуміти. Числа/булеві → toString. `null`/`undefined` → "ok"
 * (історично fallback у chat.ts перед цим refactor-ом).
 */
function stringifyContent(content: unknown): string {
  if (content == null) return "ok";
  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "ok";
  }
}

/**
 * Стискає content на рівні символів (не байтів — для UA-тексту різниця
 * у 2-3× буде, але саме символи — те що кеш Anthropic-у рахує). Зберігає
 * head + tail, посередині додає маркер з повним розміром.
 */
function summarize(content: string): string {
  const total = content.length;
  if (total <= HEAD_BYTES + TAIL_BYTES) return content;
  const head = content.slice(0, HEAD_BYTES).trimEnd();
  const tail = content.slice(total - TAIL_BYTES).trimStart();
  return `${head}\n\n[…truncated ${total - HEAD_BYTES - TAIL_BYTES} chars; original ${total} chars sent to Sentry breadcrumb…]\n\n${tail}`;
}

/**
 * Опційний `breadcrumb`-callback. У production — `Sentry.addBreadcrumb`,
 * у тестах — мок. Через це helper testable без дотику до глобального
 * Sentry-стану.
 */
export interface TruncateOptions {
  threshold?: number | undefined;
  addBreadcrumb?:
    | ((b: {
        category: string;
        level: "info" | "warning";
        message: string;
        data: Record<string, unknown>;
      }) => void)
    | undefined;
  recordMetric?: ((labels: { reason: string }) => void) | undefined;
  /**
   * Optional request-id, який потрапить у breadcrumb-data для зручного
   * grep-у в Sentry. Якщо нема — пишемо без поля (Sentry-side ALS уже
   * прикріплює `requestId`-tag через `beforeSend` у sentry.ts, але
   * breadcrumbs йдуть до `beforeSend` не завжди).
   */
  requestId?: string | undefined;
}

/**
 * Нормалізує + truncate-ає масив `tool_results`. Повертає НЕ-порожні
 * результати (`{ tool_use_id, content: string }`), готові для Anthropic
 * `tool_result`-блоків.
 */
export function truncateToolResults(
  raw: ReadonlyArray<RawToolResult>,
  opts: TruncateOptions = {},
): NormalizedToolResult[] {
  const threshold = opts.threshold ?? TOOL_RESULT_TRUNCATE_THRESHOLD;
  const addBreadcrumb =
    opts.addBreadcrumb ??
    ((b) => {
      try {
        Sentry.addBreadcrumb(b);
      } catch {
        /* Sentry не ініціалізований у деяких env — no-op */
      }
    });
  const recordMetric =
    opts.recordMetric ??
    ((labels) => {
      try {
        chatToolResultTruncatedTotal.inc(labels);
      } catch {
        /* prom-client не ініціалізований у тестах — no-op */
      }
    });

  return raw.map((r) => {
    const original = stringifyContent(r.content);
    if (original.length <= threshold) {
      return { tool_use_id: r.tool_use_id, content: original };
    }
    const summarized = summarize(original);
    addBreadcrumb({
      category: "chat.tool_result",
      level: "info",
      message: "tool_result truncated for Anthropic payload",
      data: {
        tool_use_id: r.tool_use_id,
        original_length: original.length,
        summary_length: summarized.length,
        threshold,
        ...(opts.requestId ? { request_id: opts.requestId } : {}),
        full: original,
      },
    });
    recordMetric({ reason: "size_threshold" });
    return { tool_use_id: r.tool_use_id, content: summarized };
  });
}
