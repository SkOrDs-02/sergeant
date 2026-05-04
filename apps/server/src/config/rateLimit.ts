/**
 * Centralized rate-limit policies.
 *
 * Initiative: docs/initiatives/0008-platform-hardening.md § Phase 2.
 *
 * Why a registry:
 *   До цього кожен роут передавав літерали `{ key, limit, windowMs }` у
 *   `rateLimitExpress(...)` inline (див. `apps/server/src/routes/*.ts`).
 *   Це працювало, але:
 *     - конфіг розпорошений по 20+ файлах — порівняти ліміти між роутами
 *       без `grep` неможливо;
 *     - однакові «security-sensitive» ліміти доводиться руками синхронізувати
 *       (auth-flow, webhook-flow);
 *     - тестам важко перевіряти «чи всі чутливі endpoint-и обмежені» без
 *       снапшоту усіх викликів.
 *   Реєстр це виправляє: всі policy визначені тут, а роути беруть їх через
 *   `policy("…")`.
 *
 * Migration plan:
 *   - Phase 2a (цей PR): реєстр + RFC `RateLimit-*` headers + перенесення
 *     `auth:sensitive` policy. Решта роутів і далі працюють через literals
 *     — поведінка біт-у-біт ідентична.
 *   - Phase 2b (наступний PR): мігрувати окремі роути (chat, AI memory,
 *     barcode, web-vitals) на `policy()` без зміни лімітів.
 *   - Phase 2c: enforce ESLint rule that forbids inline literals in
 *     `rateLimitExpress({ key, limit, windowMs })` поза `config/rateLimit.ts`.
 *
 * Як читати таблицю нижче:
 *   - `name` — стабільний логічний ідентифікатор (попадає у `key` лейбл
 *     метрики `rate_limit_hits_total`).
 *   - `limit / windowMs` — токен-bucket межа (тих самих семантики, що й у
 *     `rateLimitExpress`).
 *   - `failMode` — `"open"` (default) або `"closed"`. Для credential-flow
 *     поставлений `"closed"`, щоб уникнути N×limit-амплификації при
 *     Redis+Postgres-degraded mode.
 *   - `description` — однорядковий коментар, чому саме такі цифри.
 */

import type { RateLimitOptions } from "../http/rateLimit.js";

/**
 * Policy — те саме що `RateLimitOptions`, але без `cost`-функції (її можна
 * навісити інлайн при споживанні, бо `cost(req)` залежить від payload-у).
 * `description` — обов'язкове, щоб реєстр сам собою документував рішення.
 */
export interface RateLimitPolicy extends Omit<
  RateLimitOptions,
  "cost" | "key"
> {
  description: string;
}

/**
 * Вузький білий список іменних policy. Додавати нові — через окремий PR
 * з review-justification у `description`. `as const satisfies` фіксує
 * значення для type-narrow і ловить друкарські помилки на типчекеру.
 */
export const RATE_LIMIT_POLICIES = {
  /**
   * Better-Auth sensitive POST: sign-in / sign-up / forget-password /
   * reset-password. Поточне значення (limit=20 / 60s, fail-closed) існує у
   * `apps/server/src/http/authMiddleware.ts` ще до реєстру; тримаємо тут
   * один-в-один, щоб міграція не змінювала поведінку.
   *
   * **Чому ім'я з `api:` префіксом:** воно потрапляє у `key` лейбл метрики
   * `rate_limit_hits_total` і використовується у:
   *   - `docs/observability/dashboards/auth.json` (Grafana panel),
   *   - `docs/observability/prometheus/alert_rules.yml` (brute-force alert),
   *   - `docs/observability/runbook.md` (incident-response).
   * Будь-яке перейменування зламає alerts/dashboards — реєстр свідомо
   * успадковує існуючий `api:auth:sensitive` як SoT.
   */
  "api:auth:sensitive": {
    limit: 20,
    windowMs: 60_000,
    failMode: "closed",
    description:
      "Better-Auth POST /sign-in|/sign-up|/forget-password|/reset-password — fail-closed щоб N×limit-амплификація при degraded limiter не прискорювала credential-stuffing.",
  },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Усі імена policy. Споживачі типізують свої параметри через
 * `RateLimitPolicyName`, тож друкарська помилка в `policy("auth:sensitiv")`
 * ловиться на компіляції.
 */
export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/**
 * Повертає конкретну policy за ім'ям. Кидає при невідомому імені — це
 * гарантує, що `policy()` ніколи не повертає `undefined`, а отже код
 * нижче не може випадково отримати necessary-undefined limit.
 */
export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  const policy = RATE_LIMIT_POLICIES[name];
  if (!policy) {
    throw new Error(`Unknown rate-limit policy: ${name}`);
  }
  return policy;
}

/**
 * Конвертує named policy у параметри, готові до передачі у
 * `rateLimitExpress`. `key` дорівнює імені policy — це гарантує, що метрика
 * `rate_limit_hits_total{key="auth:sensitive"}` має детермінований лейбл,
 * не залежний від місця використання.
 *
 * `overrides` дозволяє точково перевизначити поле (наприклад, env-driven
 * `failMode` у `authSensitiveRateLimit`). Решту полів policy фіксує реєстр.
 */
export function policyOptions(
  name: RateLimitPolicyName,
  overrides?: Partial<Omit<RateLimitOptions, "key">>,
): RateLimitOptions {
  const base = getRateLimitPolicy(name);
  return {
    key: name,
    limit: base.limit,
    windowMs: base.windowMs,
    ...(base.failMode ? { failMode: base.failMode } : {}),
    ...(overrides ?? {}),
  };
}
