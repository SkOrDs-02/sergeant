import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../obs/logger.js";

/**
 * PostHog AI Observability — `$ai_generation` з центрального AI-клієнта
 * (ініціатива 0025, Фаза 1).
 *
 * Навіщо окремий модуль від `posthogCapture.ts`: той шле продуктові події
 * одиночним `fetch` на `/capture/` і читає `POSTHOG_PROJECT_API_KEY`. AI-івенти
 * ідуть потоком (кожен виклик моделі = подія), тож тут SDK `posthog-node` з
 * батчингом і власним тумблером `POSTHOG_AI_OBSERVABILITY_KEY` — щоб AI-шар
 * можна було вмикати/вимикати незалежно від решти серверної аналітики.
 *
 * Privacy-first ЗА КОНСТРУКЦІЄЮ (§ «Контракт даних» ініціативи, Hard Rule #21):
 * `captureAiGeneration` приймає лише типізований allowlist-обʼєкт і збирає
 * властивості явним перелічуванням полів — без spread. Невідомий ключ (у т.ч.
 * `$ai_input`, `$ai_output_choices`, аргументи tool-ів, суми користувача) не
 * має шляху в подію, навіть якщо caller його підсунув через `as`.
 *
 * Fail-open, як у ledger `anthropicUsageStore.ts`: жодна помилка SDK не
 * доходить до caller-а — `logger.warn` і далі. Capture стоїть ПІСЛЯ відповіді
 * моделі, не на hot path.
 *
 * Умова зняття тумблера: коли AI Observability доведено на проді (Фаза 2
 * закрита, дашборд і алерти живі) — ключ стає обовʼязковим у проді, а
 * `undefined → вимкнено` лишається лише для dev/test.
 */

export type AiProvider = "anthropic" | "openrouter";

/**
 * Вичерпний allowlist властивостей `$ai_generation`. Нове поле = правка
 * § «Контракт даних» у `docs/90-work/initiatives/0025-posthog-ai-observability.md`
 * у тому ж PR.
 */
export interface AiGenerationEvent {
  /** Better Auth opaque userId; без нього — системний `server`. */
  userId?: string | null | undefined;
  model: string;
  provider: AiProvider;
  /** Значення `endpoint` з `AnthropicCallOptions` (chat / digest / vision-*). */
  feature: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadInputTokens?: number | undefined;
  cacheCreationInputTokens?: number | undefined;
  /** Телеметрійний кост виклику з `estimateAnthropicCostUsd` — не гроші користувача. */
  costUsd?: number | null | undefined;
  latencyMs?: number | null | undefined;
  isError?: boolean | undefined;
  httpStatus?: number | undefined;
  /** Фаза 2 прошиє стабільний id розмови/прогону; поки — випадковий per-call. */
  traceId?: string | undefined;
  promptVersion?: string | undefined;
}

/** Плоскі властивості події у форматі PostHog AI Observability. */
export interface AiGenerationProperties {
  $ai_model: string;
  $ai_provider: AiProvider;
  $ai_trace_id: string;
  $ai_latency?: number;
  $ai_input_tokens?: number;
  $ai_output_tokens?: number;
  $ai_cache_read_input_tokens?: number;
  $ai_cache_creation_input_tokens?: number;
  $ai_total_cost_usd?: number;
  $ai_is_error: boolean;
  $ai_http_status?: number;
  feature: string;
  SYSTEM_PROMPT_VERSION?: string;
}

export const AI_GENERATION_EVENT = "$ai_generation";
export const AI_SYSTEM_DISTINCT_ID = "server";
const DEFAULT_HOST = "https://eu.i.posthog.com";

function finiteOrUndefined(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Чиста функція allowlist → properties. Експортована для unit-тесту, який
 * фіксує, що невідомі ключі відкидаються конструкцією (§ Enforcement).
 */
export function buildAiGenerationProperties(
  input: AiGenerationEvent,
): AiGenerationProperties {
  const props: AiGenerationProperties = {
    $ai_model: input.model || "unknown",
    $ai_provider: input.provider,
    $ai_trace_id: input.traceId ?? randomUUID(),
    $ai_is_error: input.isError === true,
    feature: input.feature || "unknown",
  };
  const latencyMs = finiteOrUndefined(input.latencyMs);
  // PostHog рахує `$ai_latency` у секундах.
  if (latencyMs !== undefined) props.$ai_latency = latencyMs / 1000;
  const inTok = finiteOrUndefined(input.inputTokens);
  if (inTok !== undefined) props.$ai_input_tokens = inTok;
  const outTok = finiteOrUndefined(input.outputTokens);
  if (outTok !== undefined) props.$ai_output_tokens = outTok;
  const cacheRead = finiteOrUndefined(input.cacheReadInputTokens);
  if (cacheRead !== undefined) props.$ai_cache_read_input_tokens = cacheRead;
  const cacheWrite = finiteOrUndefined(input.cacheCreationInputTokens);
  if (cacheWrite !== undefined)
    props.$ai_cache_creation_input_tokens = cacheWrite;
  const cost = finiteOrUndefined(input.costUsd);
  if (cost !== undefined) props.$ai_total_cost_usd = cost;
  const status = finiteOrUndefined(input.httpStatus);
  if (status !== undefined) props.$ai_http_status = status;
  if (input.promptVersion) props.SYSTEM_PROMPT_VERSION = input.promptVersion;
  return props;
}

let client: PostHog | null | undefined;

/** Тумблер: увімкнено лише за наявності `POSTHOG_AI_OBSERVABILITY_KEY`. */
export function isPostHogAiEnabled(): boolean {
  return Boolean(env.POSTHOG_AI_OBSERVABILITY_KEY);
}

/**
 * Лінивий singleton. `undefined` — ще не ініціалізували; `null` — вимкнено
 * (немає ключа) або конструктор впав. Другий випадок не ретраїмо: збій SDK
 * на старті — це конфіг-проблема, а не транзієнт, і повторні спроби на
 * кожному AI-виклику лише засмітили б лог.
 */
export function getPostHogAiClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = env.POSTHOG_AI_OBSERVABILITY_KEY;
  if (!key) {
    client = null;
    return client;
  }
  try {
    const instance = new PostHog(key, {
      host: env.POSTHOG_HOST || DEFAULT_HOST,
      // Батч кожні 20 подій або 10 с — AI-виклики рідкіші за pageview-и,
      // тож дефолтні 5 с давали б майже порожні батчі.
      flushAt: 20,
      flushInterval: 10_000,
      requestTimeout: 5_000,
      // Серверний процес — гео-збагачення дало б адресу Hetzner-VPS.
      disableGeoip: true,
      // Ніяких автозахоплень: тут лише явний capture метаданих.
      enableExceptionAutocapture: false,
      privacyMode: true,
    });
    // SDK репортить збої доставки подією, а не throw-ом. Без слухача це
    // тихий дроп; з ним — warn, який видно в Loki.
    instance.on("error", (err: unknown) => {
      logger.warn({
        msg: "posthog_ai_sdk_error",
        error: err instanceof Error ? err.message : String(err),
      });
    });
    client = instance;
  } catch (e: unknown) {
    logger.warn({
      msg: "posthog_ai_init_failed",
      error: e instanceof Error ? e.message : String(e),
    });
    client = null;
  }
  return client;
}

/**
 * Єдина точка відправки `$ai_generation`. Ніколи не кидає.
 * Повертає `true`, якщо подію передано SDK (для тестів/діагностики).
 */
export function captureAiGeneration(input: AiGenerationEvent): boolean {
  try {
    const ph = getPostHogAiClient();
    if (!ph) return false;
    ph.capture({
      distinctId: input.userId || AI_SYSTEM_DISTINCT_ID,
      event: AI_GENERATION_EVENT,
      properties: buildAiGenerationProperties(input),
      disableGeoip: true,
    });
    return true;
  } catch (e: unknown) {
    logger.warn({
      msg: "posthog_ai_capture_failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/** Graceful shutdown сервера: дофлашити чергу. Ніколи не кидає. */
export async function shutdownPostHogAi(timeoutMs = 2_000): Promise<void> {
  const ph = client;
  client = undefined;
  if (!ph) return;
  try {
    await ph.shutdown(timeoutMs);
  } catch (e: unknown) {
    logger.warn({
      msg: "posthog_ai_shutdown_failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Для одноразових процесів (jobs) — скинути чергу без закриття клієнта. */
export async function flushPostHogAi(): Promise<void> {
  const ph = client;
  if (!ph) return;
  try {
    await ph.flush();
  } catch (e: unknown) {
    logger.warn({
      msg: "posthog_ai_flush_failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Тільки для тестів: скинути singleton між кейсами. */
export function resetPostHogAiForTests(): void {
  client = undefined;
}
