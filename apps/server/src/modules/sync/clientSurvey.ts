import type { Request, Response, NextFunction } from "express";

import { syncV1LegacyClientsTotal } from "../../obs/metrics.js";

/**
 * Pre-sunset measurement layer для CloudSync v1 (`/api/sync/*`). Гілку v1 не
 * розширюємо — тільки на read-час фіксуємо, **хто саме** ще викликає v1, щоб
 * до T₀ (CloudSync v1 sunset, [Initiative
 * 0003](../../../../../docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md))
 * можна було адресно push-ити update-нагадування у застарілі клієнти.
 *
 * Чому окремий counter, а не нові label-и на `sync_operations_total`?
 *
 * - `sync_operations_total{op,module,outcome}` уже існує і має ~30 series
 *   (4 op × 5 module × ~7 outcome). Додавання `user_agent_class` і
 *   `app_version` сюди підняло б cardinality на × ~100 → vmagent backpressure.
 * - Цей counter **тільки v1** (на v2 ми не вимірюємо клієнтів — там немає
 *   sunset-плану). Природна границя кардинальності.
 *
 * **Cardinality cap**:
 *
 * - `user_agent_class` — whitelist 5 значень (`web`, `mobile-rn`,
 *   `mobile-shell-ios`, `mobile-shell-android`, `other`).
 * - `app_version` — нормалізовано до `major.minor` (skipping patch); `unknown`
 *   якщо `x-app-version` header відсутній або не парситься.
 * - `op` — 4 значення (`push`, `pull`, `push_all`, `pull_all`).
 *
 * Worst-case cardinality: `5 × N × 4` де `N` — кількість унікальних
 * `major.minor` що ще ходять у production. Очікуємо `N ≤ 20` (active versions
 * у двох sprint-ах). Понад 20 — кладемо в `old` bucket.
 */

export type UserAgentClass =
  | "web"
  | "mobile-rn"
  | "mobile-shell-ios"
  | "mobile-shell-android"
  | "other";

const KNOWN_VERSION_LIMIT = 20;
const knownVersions = new Set<string>();

/**
 * Класифікація `user-agent` у фіксований набір. Список побудовано з огляду на:
 *
 * - Browser-based web SPA (`apps/web` через Vite) — генерує стандартні
 *   `Mozilla/5.0 ... Chrome/... Safari/...` headers.
 * - React Native (Expo) — `okhttp/...` (Android) / `CFNetwork/...` (iOS) —
 *   див. [Expo network docs](https://docs.expo.dev/versions/latest/sdk/network/).
 * - Capacitor mobile-shell — додає `wv` (WebView) до Chrome UA на Android, та
 *   `Mobile/...` варіант Safari на iOS.
 *
 * Класифікація **best-effort**: ми не намагаємось 100% точно розпізнати усі
 * клієнти. Мета — побачити агрегатну тенденцію перед T₀.
 */
export function classifyUserAgent(
  ua: string | null | undefined,
): UserAgentClass {
  if (!ua || typeof ua !== "string") return "other";
  const lower = ua.toLowerCase();
  if (lower.includes("okhttp") || lower.includes("expo/")) {
    return "mobile-rn";
  }
  if (lower.includes("cfnetwork") && !lower.includes("safari")) {
    return "mobile-rn";
  }
  if (lower.includes("capacitor") || lower.includes(" wv)")) {
    if (lower.includes("iphone") || lower.includes("ipad")) {
      return "mobile-shell-ios";
    }
    if (lower.includes("android")) {
      return "mobile-shell-android";
    }
  }
  if (
    lower.includes("mozilla") &&
    (lower.includes("chrome") ||
      lower.includes("safari") ||
      lower.includes("firefox"))
  ) {
    return "web";
  }
  return "other";
}

const SEMVER_RE = /^(\d{1,4})\.(\d{1,4})(?:\.\d{1,4})?(?:[-+].*)?$/;

/**
 * Витягує `x-app-version` header і нормалізує до `major.minor` (drop patch і
 * pre-release suffix). Якщо header відсутній або не парситься — повертає
 * `"unknown"`.
 *
 * `KNOWN_VERSION_LIMIT` зберігає тільки 20 перших побачених `major.minor`
 * як hot-set; решта kладеться в `"old"`. Це anti-cardinality захист на
 * випадок incident-у з спам-header-ами.
 */
export function extractAppVersion(req: Pick<Request, "headers">): string {
  const raw = req.headers["x-app-version"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return "unknown";
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return "unknown";
  const major = match[1];
  const minor = match[2];
  const normalized = `${major}.${minor}`;
  if (knownVersions.has(normalized)) return normalized;
  if (knownVersions.size >= KNOWN_VERSION_LIMIT) return "old";
  knownVersions.add(normalized);
  return normalized;
}

/**
 * Map URL path → metric `op` label. Виконано окремою функцією, бо роутінг
 * v1-handler-ів живе у `routes/sync.ts`, а survey-middleware
 * монтується раніше за handler і не має доступу до Express route-pattern-у.
 *
 * Невідомий path (theoretically — нові v1 routes у майбутньому, що ми не
 * сповістили цьому module-у) повертає `null` — counter не інкрементиться.
 */
export function classifyV1SyncOp(
  path: string,
): "push" | "pull" | "push_all" | "pull_all" | null {
  if (path.endsWith("/api/sync/push")) return "push";
  if (path.endsWith("/api/sync/pull")) return "pull";
  if (path.endsWith("/api/sync/push-all")) return "push_all";
  if (path.endsWith("/api/sync/pull-all")) return "pull_all";
  return null;
}

/**
 * Express middleware. Має бути змонтований **до** authMiddleware у
 * `/api/sync/*` chain, але це не обов'язково — `req.headers["user-agent"]` і
 * `req.headers["x-app-version"]` доступні незалежно від auth-стану.
 *
 * Counter інкрементиться **на entry** в handler (не на response). Це означає,
 * що ми міряємо traffic-arrival (включаючи 4xx/5xx), а не успішні sync-и.
 * Outcome-breakdown лишається у `sync_operations_total{outcome=...}`.
 */
export function v1ClientSurveyMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const op = classifyV1SyncOp(req.path);
    if (!op) {
      next();
      return;
    }
    try {
      const userAgentClass = classifyUserAgent(req.headers["user-agent"]);
      const appVersion = extractAppVersion(req);
      syncV1LegacyClientsTotal.inc({
        user_agent_class: userAgentClass,
        app_version: appVersion,
        op,
      });
    } catch {
      /* survey must never break a request */
    }
    next();
  };
}

/**
 * Test-only: clear the in-memory `knownVersions` cache. **Не використовувати у
 * production** — counter sample-и persisted у `prom-client` registry, які
 * необхідно reset-ити окремо через `resetCounter()` на стороні тестів.
 */
export function __resetKnownVersionsForTest(): void {
  knownVersions.clear();
}
