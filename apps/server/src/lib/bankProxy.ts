import crypto from "node:crypto";
import { logger } from "../obs/logger.js";
import { recordExternalHttp } from "./externalHttp.js";
import { ExternalServiceError } from "../obs/errors.js";

/**
 * Спільний transport-шар для банківських upstream-проксі (Monobank, PrivatBank).
 * Інкапсулює AbortController-таймаут, експоненційний retry з jitter для 5xx/мережевих
 * помилок, per-upstream circuit breaker та in-memory TTL-кеш для ідентичних GET.
 *
 * Розподіл відповідальності: path-whitelist і sanitizing заголовків залишаються в
 * handler-ах (`modules/mono/mono.js`, `modules/mono/privat.js`) — це policy, не transport.
 *
 * Стан (breakers, cache) — module-level. `__bankProxyTestHooks()` експортується тільки
 * для unit-тестів (скидання стану, конфіг retry-затримок/TTL).
 */

interface BankProxyConfig {
  retryDelaysMs: number[];
  retryJitterMs: number;
  timeoutMs: number;
  breakerFailThreshold: number;
  breakerOpenMs: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
}

const DEFAULTS: Readonly<BankProxyConfig> = Object.freeze({
  retryDelaysMs: [0, 250, 750],
  retryJitterMs: 100,
  timeoutMs: 15_000,
  breakerFailThreshold: 5,
  breakerOpenMs: 30_000,
  cacheTtlMs: 60_000,
  cacheMaxEntries: 500,
});

interface BreakerState {
  failures: number;
  openUntil: number;
}

interface CacheEntry {
  expires: number;
  status: number;
  body: string;
  contentType: string | null;
  retryAfter: string | null;
}

interface BankProxyMutableState extends BankProxyConfig {
  breakers: Map<string, BreakerState>;
  cache: Map<string, CacheEntry>;
}

const state: BankProxyMutableState = {
  retryDelaysMs: [...DEFAULTS.retryDelaysMs],
  retryJitterMs: DEFAULTS.retryJitterMs,
  timeoutMs: DEFAULTS.timeoutMs,
  breakerFailThreshold: DEFAULTS.breakerFailThreshold,
  breakerOpenMs: DEFAULTS.breakerOpenMs,
  cacheTtlMs: DEFAULTS.cacheTtlMs,
  cacheMaxEntries: DEFAULTS.cacheMaxEntries,
  breakers: new Map(),
  cache: new Map(),
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(s: number): boolean {
  return s >= 500 && s <= 599;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: string | number };
  return (
    err.name === "AbortError" || err.code === "ABORT_ERR" || err.code === 20
  );
}

function jitteredDelay(base: number): number {
  if (base <= 0) return 0;
  return base + Math.floor(Math.random() * state.retryJitterMs);
}

function hashForCache(...parts: unknown[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(String(p ?? "") + "\x1f");
  return h.digest("hex").slice(0, 16);
}

function getBreaker(upstream: string): BreakerState {
  let s = state.breakers.get(upstream);
  if (!s) {
    s = { failures: 0, openUntil: 0 };
    state.breakers.set(upstream, s);
  }
  return s;
}

function onBreakerFailure(upstream: string): void {
  const s = getBreaker(upstream);
  s.failures += 1;
  if (s.failures >= state.breakerFailThreshold) {
    s.openUntil = Date.now() + state.breakerOpenMs;
  }
}

function onBreakerSuccess(upstream: string): void {
  const s = getBreaker(upstream);
  s.failures = 0;
  s.openUntil = 0;
}

function isBreakerOpen(upstream: string): boolean {
  const s = getBreaker(upstream);
  if (!s.openUntil) return false;
  if (Date.now() < s.openUntil) return true;
  // Вікно минуло — half-open: дозволяємо один пробний запит. Якщо він fail-не,
  // onBreakerFailure знову підніме openUntil; успіх — onBreakerSuccess обнулить.
  s.openUntil = 0;
  return false;
}

function cacheGet(key: string): CacheEntry | null {
  const entry = state.cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    state.cache.delete(key);
    return null;
  }
  // LRU-ish: перекласти в кінець
  state.cache.delete(key);
  state.cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (state.cache.size >= state.cacheMaxEntries) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== undefined) state.cache.delete(oldest);
  }
  state.cache.set(key, entry);
}

export interface BankProxyResult {
  status: number;
  /** Сирий текст відповіді upstream-а. */
  body: string;
  contentType: string | null;
  /**
   * Сирий `Retry-After` з upstream-а — без парсингу, щоб хендлер сам вирішив,
   * пропагувати клієнту чи транслювати у затримку. Потрібен для 429, який
   * Monobank ставить на `/personal/statement` (1 req/60s/token).
   */
  retryAfter: string | null;
  fromCache: boolean;
  /** Скільки HTTP-спроб було зроблено (1..3); 0 — cache hit. */
  attempts: number;
}

export interface BankProxyFetchOptions {
  /** Стабільний label (monobank|privatbank|...). */
  upstream: string;
  /** Напр. "https://api.monobank.ua". */
  baseUrl: string;
  /** Уже провалідований whitelist-шлях. */
  path: string;
  /** Query-параметри без `path`. */
  query?: Record<string, string>;
  /** Sanitized outbound headers. */
  headers: Record<string, string>;
  /** Client-secret для shard-у cache-ключа (hash-ується). */
  cacheKeySecret?: string;
  /** Default "GET". Не-GET не кешуються. */
  method?: string;
  timeoutMs?: number;
}

export async function bankProxyFetch(
  opts: BankProxyFetchOptions,
): Promise<BankProxyResult> {
  const {
    upstream,
    baseUrl,
    path,
    query,
    headers,
    cacheKeySecret,
    method = "GET",
    timeoutMs = state.timeoutMs,
  } = opts;

  const qs = query ? new URLSearchParams(query).toString() : "";
  const url = `${baseUrl}${path}${qs ? "?" + qs : ""}`;

  const cacheable = method === "GET";
  const cacheKey = cacheable
    ? `${upstream}|${path}|${qs}|${hashForCache(cacheKeySecret)}`
    : null;

  if (cacheKey) {
    const hit = cacheGet(cacheKey);
    if (hit) {
      recordExternalHttp(upstream, "hit", 0);
      return {
        status: hit.status,
        body: hit.body,
        contentType: hit.contentType,
        retryAfter: hit.retryAfter,
        fromCache: true,
        attempts: 0,
      };
    }
  }

  if (isBreakerOpen(upstream)) {
    recordExternalHttp(upstream, "circuit_open", 0);
    throw new ExternalServiceError(
      "Сервіс банку тимчасово недоступний — спробуйте пізніше",
      {
        status: 503,
        code: `${upstream.toUpperCase()}_CIRCUIT_OPEN`,
      },
    );
  }

  const maxAttempts = state.retryDelaysMs.length;
  const start = process.hrtime.bigint();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = jitteredDelay(state.retryDelaysMs[attempt]);
    if (delay > 0) await sleep(delay);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });
      const body = await response.text();

      // Ретраїмо тільки 5xx, і лише якщо є ще спроби.
      if (isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
        continue;
      }

      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (response.ok) {
        onBreakerSuccess(upstream);
        recordExternalHttp(upstream, "ok", ms);
      } else if (response.status === 429) {
        recordExternalHttp(upstream, "rate_limited", ms);
        // 429 — це троттлінг, не availability-issue; breaker не торкаємо.
      } else if (response.status >= 500) {
        onBreakerFailure(upstream);
        recordExternalHttp(upstream, "error", ms);
      } else {
        // 4xx auth/validation — не availability-issue; breaker не торкаємо.
        recordExternalHttp(upstream, "error", ms);
      }

      const contentType = response.headers.get("content-type");
      const retryAfter = response.headers.get("retry-after");
      if (cacheKey && response.ok) {
        cacheSet(cacheKey, {
          expires: Date.now() + state.cacheTtlMs,
          status: response.status,
          body,
          contentType,
          retryAfter,
        });
      }

      return {
        status: response.status,
        body,
        contentType,
        retryAfter,
        fromCache: false,
        attempts: attempt + 1,
      };
    } catch (e: unknown) {
      // Мережева помилка або AbortError (timeout). Ретраїмо до вичерпання.
      if (attempt < maxAttempts - 1) {
        continue;
      }
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      onBreakerFailure(upstream);
      recordExternalHttp(upstream, isAbortError(e) ? "timeout" : "error", ms);
      const err = (e && typeof e === "object" ? e : {}) as {
        message?: string;
        code?: string | number;
      };
      logger.error({
        msg: `${upstream}_proxy_failed`,
        err: { message: err.message || String(e), code: err.code },
        attempts: attempt + 1,
      });
      throw new ExternalServiceError("Помилка сервера", {
        code: `${upstream.toUpperCase()}_FETCH_FAILED`,
        cause: e,
      });
    } finally {
      clearTimeout(t);
    }
  }

  // Недосяжно: цикл завжди або повертає, або кидає.
  /* c8 ignore next */
  throw new ExternalServiceError("Помилка сервера", {
    code: `${upstream.toUpperCase()}_UNEXPECTED`,
  });
}

export interface BankProxyTestHooks {
  configure(overrides: Partial<BankProxyConfig>): void;
  reset(): void;
  state: BankProxyMutableState;
}

/**
 * Test-only hooks. Не використовуй у прод-коді.
 */
export function __bankProxyTestHooks(): BankProxyTestHooks {
  return {
    configure(overrides) {
      Object.assign(state, overrides);
    },
    reset() {
      state.breakers.clear();
      state.cache.clear();
      state.retryDelaysMs = [...DEFAULTS.retryDelaysMs];
      state.retryJitterMs = DEFAULTS.retryJitterMs;
      state.timeoutMs = DEFAULTS.timeoutMs;
      state.breakerFailThreshold = DEFAULTS.breakerFailThreshold;
      state.breakerOpenMs = DEFAULTS.breakerOpenMs;
      state.cacheTtlMs = DEFAULTS.cacheTtlMs;
      state.cacheMaxEntries = DEFAULTS.cacheMaxEntries;
    },
    state,
  };
}
