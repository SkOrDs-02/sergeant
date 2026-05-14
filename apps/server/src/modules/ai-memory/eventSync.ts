/**
 * PostHog → AI memory sync (PR-24).
 *
 * Контекст: PR-19 (#2605) активував `ai_memories` ingest для server-side
 * sources (`finyk` webhook, `digest` cron), PR-22 (#2712) додав
 * retroactive backfill з `tg_topic_archive` (`cofounder` source). Цього
 * мало для `/recall` behavioral history — він не бачить, коли user
 * **робив** значущі дії у продукті: завершив onboarding, дозвонив
 * першого actiona, відкрив підписку. PostHog ловить ці події у
 * `apps/web/src/core/observability/analytics.ts` через `trackEvent`,
 * але вони живуть у PostHog-instance і недосяжні для AI memory recall.
 *
 * Цей модуль закриває петлю: web → `POST /api/ai-memory/event-sync` з
 * `{eventName, payload}` → `formatEventAsMemoryText()` → scrubPII →
 * `enqueueMemoryIngest` як `source='product'`. Worker (PR-19 BullMQ) сам
 * embed-ить + upsert-ить у pgvector. `/recall sources=['cofounder','product']`
 * тоді бачить cross-source view ("коли я останній раз активувався
 * у фініку?").
 *
 * ─── Architecture ───────────────────────────────────────────────────
 *
 * 1. Web `trackEvent(name, payload)` (analytics.ts) — fire-and-forget;
 *    додатково POST-ить ці події (allowlist) до `/api/ai-memory/event-sync`.
 * 2. Server route (`apps/server/src/routes/ai-memory.ts`) — session-gated,
 *    Zod-validated, форвардить у `recordProductMemoryEvent`.
 * 3. Цей модуль (`recordProductMemoryEvent`):
 *    - валідує `eventName` проти PRODUCT_MEMORY_EVENTS allowlist
 *    - scrubPII(payload) — видаляє credentials/email/phone глибоко
 *    - `formatEventAsMemoryText` — людський опис ("2026-05-13: completed
 *      onboarding wizard (vibe_picks)")
 *    - `buildSourceRef` — `<eventName>:<userId>:<dayKey>` для idempotency
 *    - enqueueMemoryIngest з source='product'
 *
 * ─── Idempotency ────────────────────────────────────────────────────
 *
 * `sourceRef = <eventName>:<userId>:<dayKey>` гарантує що ре-fire тієї
 * самої події одного й того ж дня — no-op у BullMQ (jobId-dedup) і у
 * SQL (partial UNIQUE на `(user_id, source, source_ref) WHERE
 * source_ref IS NOT NULL`, із PR-19 schema). Хоча web-сторона має
 * idempotency flags (`hub_onboarding_completed_v1` etc.), мережеві
 * ретраї або deploy-flapping можуть створити дубль — захист на
 * сервер-сторі робить це безпечним.
 *
 * ─── ADR-0031 §3 isolation ──────────────────────────────────────────
 *
 * `recall_memory` openclaw tool хардкодить `sources=['cofounder']` — НЕ
 * зачіпається. Product events живуть у окремому namespace. Founder
 * combined-view через web-recall (`POST /api/ai-memory/recall`,
 * `sources=['cofounder','product']`) — пізніший follow-up.
 */

import { scrubPII } from "@sergeant/shared";

import type { Pool } from "pg";

import { logger, serializeError } from "../../obs/logger.js";
import { enqueueMemoryIngest } from "./ingestQueue.js";

/**
 * Allowlist подій, які дзеркаляться у `ai_memories` як `source='product'`.
 *
 * Чому **allowlist**, а не "усі ANALYTICS_EVENTS":
 *   - Більшість analytics-подій — telemetry (clicks, impressions), які
 *     "забруднили" б memory recall шумом ("user dismissed banner X").
 *   - Voyage embedding коштує гроші — selectively embed-имо тільки
 *     поведінкові milestone-и (funnel signposts).
 *   - PII surface менший — кожна подія у allowlist має stable payload
 *     contract, тож `formatEventAsMemoryText` знає що чистити.
 *
 * Які події входять (поточний v1 scope):
 *   - `signup_completed` (PR-06): facto-початок user journey.
 *   - `onboarding_completed` (PR-07 #2566): activation milestone.
 *   - `first_action_completed` (PR-08 #2025): per-module activation.
 *   - `subscription_started` (server-side, stripe.ts): conversion signal.
 *
 * Розширення — додай константу + entry у `EVENT_FORMATTERS`. Не міняй
 * текст без узгодження: `/recall` запити founder-а полягають на
 * стабільні фрази (наприклад, "completed onboarding" — щоб
 * vector-search ловив).
 */
export const PRODUCT_MEMORY_EVENTS = [
  "signup_completed",
  "onboarding_completed",
  "first_action_completed",
  "subscription_started",
] as const;

export type ProductMemoryEventName = (typeof PRODUCT_MEMORY_EVENTS)[number];

const PRODUCT_MEMORY_EVENT_SET: ReadonlySet<string> = new Set(
  PRODUCT_MEMORY_EVENTS,
);

/**
 * Чи дозволено подія для дзеркаливання у memory. Caller (HTTP handler)
 * робить early-return 200 OK з `{ok:false, reason:"event_not_synced"}`
 * якщо event поза allowlist — клієнт може спокійно дрібнити trackEvent
 * на будь-яку подію без ризику 4xx.
 */
export function isProductMemoryEvent(
  name: string,
): name is ProductMemoryEventName {
  return PRODUCT_MEMORY_EVENT_SET.has(name);
}

/**
 * Day-key у Europe/Kyiv (`YYYY-MM-DD`). Domain invariant — увесь sergeant
 * рахує дні у Kyiv-TZ. Не залежимо від системного TZ контейнера.
 */
export function dayKeyKyiv(at: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at);
}

const MAX_PAYLOAD_BYTES = 4 * 1024;
const MAX_CONTENT_LEN = 500;

/**
 * Re-используем PII-scrubber із @sergeant/shared (вже задіяний у
 * Sentry beforeSend для server+web). Це гарантує, що navigator-leak
 * полів (`email`, `password`, `apiKey` …) ніколи не потрапляють у
 * vector embedding-text.
 *
 * Mutates argument. Повертаємо безпечну (cloned) копію, щоб caller-у
 * ніколи не передавався shared mutable reference.
 */
export function sanitizeEventPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(payload));
  } catch {
    // Структуру не вдалося серіалізувати (циклічні refs тощо) —
    // безпечніше відкинути все, ніж пропускати у scrubber-у unbounded
    // обʼєкт.
    return {};
  }
  scrubPII(cloned);
  return cloned;
}

/**
 * Маперы з event → людський текст. Кожен мап ОЧІКУЄ payload вже
 * sanitized (PII пройшов scrubPII). Текст має містити дату Kyiv (щоб
 * vector-search ловив temporal queries "що я робив минулого тижня") і
 * мнемонічну event-фразу.
 *
 * Контракт стабільний — recall queries founder-а полягають на конкретні
 * фрази ("completed onboarding", "first action", "subscription"). Зміна
 * текстів — breaking change для recall accuracy; за-update розширюй
 * synonyms у фразу замість заміни.
 */
type FormatterFn = (
  payload: Record<string, unknown>,
  dayKey: string,
) => { content: string; metadata: Record<string, unknown> };

const EVENT_FORMATTERS: Record<ProductMemoryEventName, FormatterFn> = {
  signup_completed: (payload, dayKey) => {
    const method = stringField(payload, "method") ?? "email";
    return {
      content: `${dayKey}: signup completed (method: ${method}). User started journey у Sergeant.`,
      metadata: { event: "signup_completed", method },
    };
  },
  onboarding_completed: (payload, dayKey) => {
    const intent = stringField(payload, "intent") ?? "unknown";
    const picksRaw = payload["picksCount"];
    const picks =
      typeof picksRaw === "number" && Number.isFinite(picksRaw)
        ? picksRaw
        : null;
    const picksSuffix = picks == null ? "" : ` (${picks} module picks)`;
    return {
      content: `${dayKey}: completed onboarding wizard${picksSuffix}, intent=${intent}.`,
      metadata: {
        event: "onboarding_completed",
        intent,
        ...(picks == null ? {} : { picksCount: picks }),
      },
    };
  },
  first_action_completed: (payload, dayKey) => {
    const moduleId = stringField(payload, "module") ?? "unknown";
    return {
      content: `${dayKey}: first action completed у модулі ${moduleId}. Activation milestone hit.`,
      metadata: { event: "first_action_completed", module: moduleId },
    };
  },
  subscription_started: (payload, dayKey) => {
    const plan = stringField(payload, "plan") ?? "unknown";
    const source = stringField(payload, "source") ?? "unknown";
    return {
      content: `${dayKey}: subscription started, plan=${plan}, source=${source}. Conversion event.`,
      metadata: {
        event: "subscription_started",
        plan,
        source,
      },
    };
  },
};

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) return null;
  // Hard truncate щоб одна неправильно сформована payload не
  // роздула embedding-content.
  return value.slice(0, 80);
}

export interface FormatEventOutput {
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Перетворює event-name + payload у структуру для memory ingest. Pure
 * function: ні DB, ні HTTP — тестується ізольовано.
 */
export function formatEventAsMemoryText(
  eventName: ProductMemoryEventName,
  rawPayload: Record<string, unknown> | undefined,
  now: Date = new Date(),
): FormatEventOutput {
  const dayKey = dayKeyKyiv(now);
  const sanitized = sanitizeEventPayload(rawPayload);
  const formatter = EVENT_FORMATTERS[eventName];
  const formatted = formatter(sanitized, dayKey);
  // Hard truncate content (defense-in-depth — форматтери самі обмежують
  // input strings, але хто завгодно міг забути).
  const content =
    formatted.content.length > MAX_CONTENT_LEN
      ? formatted.content.slice(0, MAX_CONTENT_LEN - 1) + "…"
      : formatted.content;
  return { content, metadata: formatted.metadata };
}

/**
 * Idempotency-ref. День-rotated: ре-fire тієї ж події тим же user-ом у
 * межах того ж Kyiv-доби дедуплікується у BullMQ jobId і SQL UNIQUE.
 * Це навмисно крупно-зернисте: cross-day signup_completed (рідкісне,
 * але можливе при re-test acc-у) лишиться як два окремі rows — це
 * корректно з точки зору `/recall` ("я колись завів акаунт двічі").
 */
export function buildProductSourceRef(
  eventName: ProductMemoryEventName,
  userId: string,
  dayKey: string,
): string {
  return `${eventName}:${userId}:${dayKey}`;
}

/**
 * Перевіряє розмір payload до scrubPII (raw byte-cap). Не критично, але
 * захищає Redis/BullMQ payload-buffer від zip-bomb-стилю атак.
 */
export function checkPayloadSize(
  payload: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; reason: string; size: number } {
  if (!payload) return { ok: true };
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { ok: false, reason: "not_serializable", size: 0 };
  }
  const size = Buffer.byteLength(serialized, "utf8");
  if (size > MAX_PAYLOAD_BYTES) return { ok: false, reason: "too_large", size };
  return { ok: true };
}

export interface RecordProductMemoryInput {
  userId: string;
  eventName: ProductMemoryEventName;
  payload: Record<string, unknown> | undefined;
  now?: Date;
}

export interface RecordProductMemoryResult {
  enqueued: boolean;
  sourceRef: string;
  contentLength: number;
}

/**
 * Public entry-point. Caller-и:
 *   - HTTP route `POST /api/ai-memory/event-sync` (web → fetch)
 *   - Server-side hooks (наприклад, stripe.ts при `subscription_started`)
 *
 * Помилки enqueue (Redis-down тощо) НЕ кидаються — ai-memory ingest
 * best-effort: краще втратити один dual-write, ніж 500-нути analytics
 * каллера. Це дзеркалить семантику `enqueueMemoryIngest` (теж best-effort).
 */
export async function recordProductMemoryEvent(
  _pool: Pool,
  input: RecordProductMemoryInput,
): Promise<RecordProductMemoryResult> {
  const { userId, eventName, payload, now } = input;

  if (!isProductMemoryEvent(eventName)) {
    // Defensive: caller має фільтрувати, але double-guard зручний для
    // server-side hook-ів, що еволюціонують швидше allowlist-у.
    logger.warn({
      msg: "ai_memory_event_sync_unknown_event",
      eventName,
    });
    return {
      enqueued: false,
      sourceRef: "",
      contentLength: 0,
    };
  }

  const formatted = formatEventAsMemoryText(eventName, payload, now);
  const dayKey = dayKeyKyiv(now);
  const sourceRef = buildProductSourceRef(eventName, userId, dayKey);

  try {
    await enqueueMemoryIngest({
      userId,
      source: "product",
      sourceRef,
      content: formatted.content,
      metadata: formatted.metadata,
    });
    return {
      enqueued: true,
      sourceRef,
      contentLength: formatted.content.length,
    };
  } catch (err) {
    logger.warn({
      msg: "ai_memory_event_sync_enqueue_failed",
      eventName,
      userId,
      err: serializeError(err, { includeStack: false }),
    });
    return {
      enqueued: false,
      sourceRef,
      contentLength: formatted.content.length,
    };
  }
}
