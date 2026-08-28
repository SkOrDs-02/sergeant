/**
 * Rate-limit option objects for the two auth-sensitive buckets, consumed
 * directly by `apps/server/src/http/authMiddleware.ts`.
 *
 * These used to live behind a named-policy registry (interface + accessor
 * functions) sized for a broader rollout across routes
 * (docs/initiatives/archive/_0008-platform-hardening.md § Phase 2) that
 * never went beyond these two policies — so the indirection collapsed to
 * plain exported consts.
 *
 * **Чому `key` з `api:` префіксом:** він потрапляє у `key` лейбл метрики
 * `rate_limit_hits_total` і використовується у:
 *   - `docs/observability/dashboards/auth.json` (Grafana panel),
 *   - `docs/observability/prometheus/alert_rules.yml` (brute-force alert),
 *   - `docs/observability/runbook.md` (incident-response).
 * Перейменування `key` зламає ці alerts/dashboards.
 */

import { env } from "../env.js";
import type { RateLimitOptions } from "../http/rateLimit.js";

/**
 * Better-Auth sensitive POST: sign-in / sign-up / forget-password /
 * reset-password. Default 5 спроб / 60s / IP, fail-closed — узгоджено з
 * OWASP ASVS V11.1.3 для credential flow. Конкретні числа беруться з env
 * (`AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SEC`), щоб ops міг
 * дополнити ліміт без redeploy-у. Аудит: PR-48 round-2,
 * `docs/security/better-auth-audit-2026-05.md`.
 */
export const AUTH_SENSITIVE_RATE_LIMIT: RateLimitOptions = {
  key: "api:auth:sensitive",
  limit: env.AUTH_RATE_LIMIT_MAX,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_SEC * 1000,
  failMode: "closed",
};

/**
 * Per-account credential bucket (F2 у
 * `docs/90-work/planning/specs/beta-security-readiness.md`).
 *
 * `AUTH_SENSITIVE_RATE_LIMIT` вище обмежує **джерело** запиту (IP до
 * автентифікації). Ботнет зі 100 IP обходить його лінійно: кожен бакет
 * лишається зеленим, а конкретний акаунт отримує 100× спроб. Ця policy
 * ключується на **цільовому акаунті** (SHA-256 email-а), тож стеля стає
 * властивістю жертви, а не мережі атакера.
 *
 * Обидві policy працюють разом: спершу IP-бакет, потім account-бакет.
 * Ліміт свідомо мʼякший (10/15хв проти 5/60с), бо він бʼє по акаунту, а не
 * по атакеру: він не має спрацьовувати, коли людина чотири рази помилилась
 * у власному паролі.
 */
export const AUTH_ACCOUNT_RATE_LIMIT: RateLimitOptions = {
  key: "api:auth:account",
  limit: env.AUTH_ACCOUNT_RATE_LIMIT_MAX,
  windowMs: env.AUTH_ACCOUNT_RATE_LIMIT_WINDOW_SEC * 1000,
  failMode: "closed",
};
