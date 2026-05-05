import { ApiError } from "./ApiError";
import type { QueryValue, RequestOptions } from "./types";

const JSON_MIME = "application/json";

export type TokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export interface HttpClientConfig {
  /**
   * Базовий URL для API. Може бути:
   * - порожнім рядком → відносні шляхи (`/api/...`)
   * - повним URL (`https://api.example.com`) — для мобілки та прод-deploy-ів
   *   з API на іншому домені
   */
  baseUrl?: string;
  /**
   * API-префікс, під який переписуються шляхи виду `/api/...`. За
   * замовчуванням — `/api/v1`, тож `http.post("/api/push/register", …)`
   * фактично йде у `/api/v1/push/register`. Сервер тримає `/api/*` і
   * `/api/v1/*` як дзеркало, тому переписування безпечне для існуючого
   * вебу (див. `apiVersionRewrite` у `apps/server/src/app.ts`).
   *
   * Винятки, які НЕ чіпаються:
   *   - `/api/auth/*` — Better Auth зашитий під фіксований `basePath`;
   *   - шляхи, що вже починаються з `apiPrefix` (ідемпотентність —
   *     сторонній код може давати `/api/v1/...` явно);
   *   - шляхи, що не починаються з `/api/` — прокидаються як є.
   *
   * Щоб тимчасово повернути легасі-префікс (escape hatch під час rollout),
   * передай `apiPrefix: "/api"` у `createApiClient`/`createHttpClient`.
   */
  apiPrefix?: string;
  /**
   * Якщо надано — результат додається як `Authorization: Bearer <token>`
   * до кожного запиту. Повертає `null`/`undefined` коли токен не заданий,
   * тоді заголовок не ставимо.
   */
  getToken?: TokenProvider;
  /**
   * Кастомний `fetch` (для тестів, для RN, для проксі). За замовчуванням — `globalThis.fetch`.
   */
  fetchImpl?: typeof fetch;
  /**
   * Дефолтне `credentials` для браузерних запитів. У RN ігнорується.
   * За замовчуванням — `"include"`.
   */
  defaultCredentials?: RequestCredentials;
  /**
   * Дефолтні заголовки, що додаються до кожного запиту (після `getToken`).
   */
  defaultHeaders?: Record<string, string>;
}

/**
 * Default API prefix. Mobile-клієнти і за замовчуванням web через
 * `createApiClient()` ходять у `/api/v1/*`. `/api/auth/*` — виняток.
 */
export const DEFAULT_API_PREFIX = "/api/v1";
const LEGACY_API_PREFIX = "/api";
const AUTH_PATH_PREFIX = "/api/auth";

function normalizeApiPrefix(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, "");
  if (!trimmed) return LEGACY_API_PREFIX;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Переписує шляхи виду `/api/<rest>` на `${prefix}/<rest>`.
 *
 * Правила (консистентно з `apps/web/src/shared/lib/api/apiUrl.ts`):
 *   - не починається з `/api/` → повертаємо як є (fully-qualified URL, asset, ...);
 *   - `/api/auth` або `/api/auth/...` → як є (Better Auth basePath);
 *   - уже починається з `prefix/` або дорівнює `prefix` → як є (ідемпотентність);
 *   - `prefix === "/api"` → як є (legacy mode, нічого не робимо);
 *   - інакше: `/api<rest>` → `${prefix}<rest>`.
 */
export function applyApiPrefix(path: string, prefix: string): string {
  const normalizedPrefix = normalizeApiPrefix(prefix);
  if (normalizedPrefix === LEGACY_API_PREFIX) return path;
  if (!path.startsWith(LEGACY_API_PREFIX)) return path;
  // Точний сегментний збіг — щоб `/api-foo` / `/apiv2` (інший endpoint) не зачепило.
  if (path !== LEGACY_API_PREFIX && !path.startsWith(`${LEGACY_API_PREFIX}/`)) {
    return path;
  }
  if (path === AUTH_PATH_PREFIX || path.startsWith(`${AUTH_PATH_PREFIX}/`)) {
    return path;
  }
  if (path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`)) {
    return path;
  }
  return normalizedPrefix + path.slice(LEGACY_API_PREFIX.length);
}

export interface HttpClient {
  request: <T = unknown>(path: string, opts?: RequestOptions) => Promise<T>;
  get: <T = unknown>(path: string, opts?: RequestOptions) => Promise<T>;
  post: <T = unknown>(
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ) => Promise<T>;
  put: <T = unknown>(
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ) => Promise<T>;
  patch: <T = unknown>(
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ) => Promise<T>;
  del: <T = unknown>(
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ) => Promise<T>;
  /** Повертає сирий `Response` — для SSE/стрімінгу. */
  raw: (path: string, opts?: RequestOptions) => Promise<Response>;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

function resolveUrl(
  baseUrl: string | undefined,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const base = stripTrailingSlash(baseUrl ?? "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const full = base ? `${base}${p}` : p;
  if (!query) return full;
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return full;
  const params = new URLSearchParams();
  for (const [k, v] of entries) params.append(k, String(v));
  const sep = full.includes("?") ? "&" : "?";
  return `${full}${sep}${params.toString()}`;
}

function isBodylessInit(body: unknown): boolean {
  return (
    body == null ||
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  );
}

function serializeBody(body: unknown): BodyInit | null | undefined {
  if (body == null) return undefined;
  if (isBodylessInit(body)) return body as BodyInit;
  return JSON.stringify(body);
}

function combineSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal: AbortSignal | undefined; cancel: () => void } {
  if (!timeoutMs) return { signal: userSignal, cancel: () => {} };
  const ac = new AbortController();
  const onUserAbort = () => ac.abort(userSignal?.reason);
  if (userSignal) {
    if (userSignal.aborted) ac.abort(userSignal.reason);
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }
  const timer = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
  return {
    signal: ac.signal,
    cancel: () => {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    },
  };
}

function looksLikeJson(contentType: string | null, text: string): boolean {
  if (contentType && contentType.toLowerCase().includes(JSON_MIME)) return true;
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function safeParseJson(
  text: string,
  contentType: string | null,
): { body: unknown; parseFailed: boolean } {
  if (text.length === 0) return { body: null, parseFailed: false };
  if (!looksLikeJson(contentType, text)) {
    return { body: undefined, parseFailed: true };
  }
  try {
    return { body: JSON.parse(text), parseFailed: false };
  } catch {
    return { body: undefined, parseFailed: true };
  }
}

/**
 * HTTP `Retry-After` → мілісекунди. RFC 9110 §10.2.3 дозволяє дві форми:
 *   - `delta-seconds` (ціле ≥0)
 *   - `HTTP-date` (абсолютний час)
 * Повертаємо `undefined` для відсутніх, порожніх, мінусових, NaN.
 */
export function parseRetryAfterMs(
  value: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Спочатку пробуємо delta-seconds — численний формат трапляється найчастіше
  // (429-и від Monobank, Cloudflare тощо).
  if (/^\d+$/.test(trimmed)) {
    const sec = Number(trimmed);
    if (!Number.isFinite(sec) || sec <= 0) return undefined;
    return sec * 1000;
  }
  const absMs = Date.parse(trimmed);
  if (!Number.isFinite(absMs)) return undefined;
  const delta = absMs - nowMs;
  return delta > 0 ? delta : undefined;
}

/**
 * Генерує `traceparent` у W3C Trace Context форматі:
 *   `00-<32hex traceId>-<16hex spanId>-01`
 *
 * `01` (sampled) — на клієнті ми не тримаємо sampler-а, тож позначаємо
 * усі трейси як sampled і даємо серверному `RouteAwareSampler` зробити
 * фінальне рішення. Це консистентно з ParentBased(remoteParentSampled)
 * фолбеком на сервері.
 *
 * `crypto.getRandomValues` доступний у браузерах та React Native (через
 * `react-native-get-random-values` polyfill, який Sergeant вже підключає
 * у mobile entry). У Node 20+ — теж присутній. Якщо нема — повертаємо
 * `null`, і header не виставляємо: краще без trace-ID, ніж із Math.random
 * traceId-ом, який Honeycomb/Tempo можуть схибно дедуплікувати.
 */
export function generateTraceparent(): string | null {
  const g = (
    globalThis as {
      crypto?: { getRandomValues?: <T extends ArrayBufferView>(arr: T) => T };
    }
  ).crypto;
  const getRandom = g?.getRandomValues?.bind(g);
  if (!getRandom) return null;
  const traceBytes = new Uint8Array(16);
  const spanBytes = new Uint8Array(8);
  getRandom(traceBytes);
  getRandom(spanBytes);
  const traceId = bytesToHex(traceBytes);
  const spanId = bytesToHex(spanBytes);
  // Перевірка: trace-/span-id не all-zero (W3C: invalid). Шанс — 1 з 2^128,
  // але дешевше захиститись, ніж дебажити пропалі трейси.
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return `00-${traceId}-${spanId}-01`;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function networkMessage(cause: unknown): string {
  // typeof navigator — defensive: у RN `navigator` є але без `onLine`, у Node — undefined.
  if (
    typeof navigator !== "undefined" &&
    (navigator as { onLine?: boolean }).onLine === false
  ) {
    return "Немає підключення до інтернету. Спробуй пізніше.";
  }
  const msg = cause instanceof Error ? cause.message : "";
  return msg || "Мережева помилка";
}

/**
 * Створює типізований HTTP-клієнт із заданим базовим URL та опційним
 * провайдером токена. Усі endpoint-обгортки (`createSyncEndpoints` тощо)
 * працюють поверх повернутого `HttpClient`.
 */
export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const {
    baseUrl,
    apiPrefix = DEFAULT_API_PREFIX,
    getToken,
    fetchImpl,
    defaultCredentials = "include",
    defaultHeaders,
  } = config;

  async function buildHeaders(opts: RequestOptions): Promise<Headers> {
    const h = new Headers();
    h.set("Accept", JSON_MIME);
    if (opts.body != null && !isBodylessInit(opts.body)) {
      h.set("Content-Type", JSON_MIME);
    }
    // M10 — CSRF guard. Усі fetch-и через цей клієнт виставляють non-simple
    // header `X-Requested-With: XMLHttpRequest`, що змушує браузер preflight-
    // нути cross-origin POST/PUT/PATCH/DELETE; preflight зупиняється на
    // CORS allowlist сервера, і атакерська сторінка не може приклеїти
    // session cookie до state-changing запиту з нашого фронту.
    // Карта: `docs/security/hardening/M10-csrf-token-check.md`.
    h.set("X-Requested-With", "XMLHttpRequest");
    // W3C Trace Context (`traceparent`) — Phase 2 ініціативи 0004. На веб/RN
    // ми (поки що) не тримаємо повноцінний OTel SDK у бандлі (вартість
    // ~50KB gzip), тому генеруємо traceparent самостійно на client-side і
    // покладаємось на server-side `instrumentation-http`, який prefix-ує
    // server-span-и до згенерованого traceId. Сервер віддає ту саму
    // traceId назад через `X-Trace-Id` — Sentry-events на клієнті можна
    // склеїти з server-логами одним grep-ом.
    if (typeof globalThis !== "undefined") {
      const tp = generateTraceparent();
      if (tp) h.set("traceparent", tp);
    }
    if (defaultHeaders) {
      for (const [k, v] of Object.entries(defaultHeaders)) {
        if (v !== undefined && v !== null) h.set(k, v);
      }
    }
    if (getToken) {
      try {
        const token = await getToken();
        if (token) h.set("Authorization", `Bearer ${token}`);
      } catch {
        // Якщо getToken падає — просто не додаємо заголовок.
      }
    }
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) {
        if (v !== undefined && v !== null) h.set(k, v);
      }
    }
    return h;
  }

  async function request<T = unknown>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const prefixed = applyApiPrefix(path, apiPrefix);
    const url = resolveUrl(baseUrl, prefixed, opts.query);
    const fetchFn = fetchImpl ?? globalThis.fetch;
    const headers = await buildHeaders(opts);
    const { signal, cancel } = combineSignals(opts.signal, opts.timeoutMs);

    const init: RequestInit = {
      method: opts.method ?? (opts.body != null ? "POST" : "GET"),
      credentials: opts.credentials ?? defaultCredentials,
      headers,
      body: serializeBody(opts.body),
      signal,
    };

    let res: Response;
    try {
      res = await fetchFn(url, init);
    } catch (cause) {
      cancel();
      const name =
        cause && typeof (cause as { name?: unknown }).name === "string"
          ? (cause as { name: string }).name
          : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new ApiError({
          kind: "aborted",
          message:
            name === "TimeoutError"
              ? "Час очікування вичерпано"
              : "Запит скасовано",
          url,
          cause,
        });
      }
      throw new ApiError({
        kind: "network",
        message: networkMessage(cause),
        url,
        cause,
      });
    }

    if (opts.parse === "raw") {
      cancel();
      return res as unknown as T;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (cause) {
      cancel();
      throw new ApiError({
        kind: "network",
        message: networkMessage(cause),
        url,
        cause,
      });
    }
    cancel();

    const ct = res.headers.get("content-type");
    const { body, parseFailed } = safeParseJson(bodyText, ct);

    if (!res.ok) {
      const requestIdHeader = res.headers.get("x-request-id") || undefined;
      const serverMessage =
        body && typeof body === "object"
          ? (body as { error?: unknown }).error
          : undefined;
      // Пропагаємо `Retry-After` у поле ApiError, щоб викликачі (напр., Monobank
      // pagination) могли зробити targeted backoff без повторного парсингу
      // хедерів. Парсимо лише для статусів, де заголовок має сенс — 429/503.
      const retryAfterMs =
        res.status === 429 || res.status === 503
          ? parseRetryAfterMs(res.headers.get("retry-after"))
          : undefined;
      throw new ApiError({
        kind: "http",
        message:
          typeof serverMessage === "string" && serverMessage.length > 0
            ? serverMessage
            : `HTTP ${res.status}`,
        status: res.status,
        body,
        bodyText,
        url,
        requestId: requestIdHeader,
        retryAfterMs,
      });
    }

    if (opts.parse === "text") return bodyText as unknown as T;

    if (parseFailed) {
      throw new ApiError({
        kind: "parse",
        message: "Некоректна відповідь сервера",
        url,
        bodyText,
      });
    }

    return body as T;
  }

  return {
    request,
    get<T = unknown>(path: string, opts?: RequestOptions) {
      return request<T>(path, { ...opts, method: "GET" });
    },
    post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions) {
      return request<T>(path, { ...opts, method: "POST", body });
    },
    put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions) {
      return request<T>(path, { ...opts, method: "PUT", body });
    },
    patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions) {
      return request<T>(path, { ...opts, method: "PATCH", body });
    },
    del<T = unknown>(path: string, body?: unknown, opts?: RequestOptions) {
      return request<T>(path, { ...opts, method: "DELETE", body });
    },
    raw(path: string, opts?: RequestOptions) {
      return request<Response>(path, { ...opts, parse: "raw" });
    },
  };
}
