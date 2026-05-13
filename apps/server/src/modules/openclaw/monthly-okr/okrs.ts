/**
 * O3 (Phase 2.B) — interim hardcoded OKR list. Поки PR-34 (Strategic
 * mode skeleton) не дав готову `strategic_goals` таблицю, тримаємо
 * goals тут як SSOT — оновлюємо щоквартально через окремий PR.
 *
 * AI-CONTEXT: цей файл задумано як stop-gap. Як тільки `strategic_goals`
 * у DB реалізована, builder перейде на SQL-query, а цей файл стане
 * fallback-/seed-даними для dev/test/migration scenarios.
 *
 * Структура mirrors типову OKR notation:
 *   - `objective` — якісне твердження ("Foundation: ship CRUD MVP");
 *   - `kr[].label` — key result у вимірному форматі ("First 50 paying
 *     users");
 *   - `kr[].target` — числова ціль (50, 12000, тощо);
 *   - `kr[].current` — поточне значення (manually update at-most-monthly);
 *   - `kr[].unit` — суфікс одиниці ("users", "UAH", "%");
 *   - `kr[].source` — звідки тягнути дані для autoupdate (потенційно).
 */

export type OkrSource = "manual" | "stripe" | "posthog" | "github" | "sentry";

export interface KeyResult {
  label: string;
  target: number;
  current: number;
  unit: string;
  source: OkrSource;
}

export interface Okr {
  /** Stable kebab-id для post-hoc cross-references. */
  id: string;
  objective: string;
  quarter: string;
  krs: KeyResult[];
}

/**
 * Q2/Q3 2026 founder-OKR-список (hardcoded interim). Якщо `strategic_goals`
 * DB-table стане доступним, переключити builder на SQL і використати цей
 * масив як test-seed.
 *
 * Числа `current` — placeholder; реальний підрахунок поки manual. Коли
 * `KeyResult.source` ≠ 'manual', builder може автозаповнити при наявності
 * API-доступу.
 */
export const INTERIM_OKRS: readonly Okr[] = [
  {
    id: "foundation-q2-2026",
    quarter: "Q2 2026",
    objective: "Foundation: ship core CRUD + 50 paying users",
    krs: [
      {
        label: "Paying users (active subs)",
        target: 50,
        current: 0,
        unit: "users",
        source: "stripe",
      },
      {
        label: "Monthly recurring revenue (UAH)",
        target: 25_000,
        current: 0,
        unit: "₴/mo",
        source: "stripe",
      },
      {
        label: "Weekly active users (PostHog)",
        target: 200,
        current: 0,
        unit: "WAU",
        source: "posthog",
      },
    ],
  },
  {
    id: "reliability-q2-2026",
    quarter: "Q2 2026",
    objective: "Reliability: zero P0/P1 incidents at 99.5% uptime",
    krs: [
      {
        label: "Unresolved Sentry error issues",
        target: 0,
        current: 0,
        unit: "issues",
        source: "sentry",
      },
      {
        label: "Failing n8n workflows",
        target: 0,
        current: 0,
        unit: "WFs",
        source: "manual",
      },
      {
        label: "P95 /health latency",
        target: 100,
        current: 0,
        unit: "ms",
        source: "manual",
      },
    ],
  },
  {
    id: "growth-q3-2026",
    quarter: "Q3 2026",
    objective:
      "Growth: scale to 500 paying users + onboard 2 referral channels",
    krs: [
      {
        label: "Paying users",
        target: 500,
        current: 0,
        unit: "users",
        source: "stripe",
      },
      {
        label: "Activated referral channels",
        target: 2,
        current: 0,
        unit: "channels",
        source: "manual",
      },
      {
        label: "Weekly digest open-rate",
        target: 60,
        current: 0,
        unit: "%",
        source: "manual",
      },
    ],
  },
];

/** Helper: progress 0..100 per KR — capped at 100 для overshoot. */
export function krProgressPct(kr: KeyResult): number {
  if (kr.target === 0) {
    // Inverse goal (наприклад, 0 unresolved issues) — повне досягнення
    // якщо current = 0; інакше 0.
    return kr.current === 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, (kr.current / kr.target) * 100));
}
