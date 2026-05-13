/**
 * PR-26 — морній брифінг для OpenClaw founder-DM. Без LLM, hardcoded
 * секції; шаблон рендериться у `template.ts`, дані збираються у
 * `builder.ts`. Цей модуль — лише типи, щоб уникнути циклічних залежностей
 * між `template.ts` (pure) та `builder.ts` (бо орxестратор тягне Stripe /
 * PostHog / n8n / Sentry / GitHub helper-и).
 *
 * AI-CONTEXT: shape стабільна — наступний PR (PR-27) додасть `summary?:
 * string` (LLM-генерований narrative); рендер шаблону додасть його як
 * окрему секцію зверху, а інші 5 sections залишаться, як зараз. Не
 * мінякимо назви полів без consumer-перевірки.
 */

export interface StripeBriefingSection {
  /** True коли `STRIPE_SECRET_KEY` не сконфігурований. */
  notConfigured?: boolean;
  /** Lookback вікно у днях, передане у Stripe-API (1 = вчора). */
  windowDays?: number;
  /** Кількість успішних charge-ів у вікні. */
  successfulCount?: number;
  /** Кількість failed charge-ів у вікні. */
  failedCount?: number;
  /** Загальна сума успішних charge-ів у UAH (major units, не kopiykas). */
  grossAmountUah?: number;
  /** Free-form пояснення у markdown, коли дані часткові / fail-open. */
  note?: string;
}

export interface SignupsBriefingSection {
  /** True коли `POSTHOG_API_KEY` або `POSTHOG_PROJECT_ID` відсутні. */
  notConfigured?: boolean;
  /** Lookback у днях для PostHog trend-у. */
  windowDays?: number;
  /** Сумарна кількість `$pageview`-ів у вікні (proxy на трафік). */
  pageviewCount?: number;
  /** Сумарна кількість `subscription_started`-ів у вікні. */
  subscriptionStartedCount?: number;
  /** Free-form пояснення (fail-open / часткові дані). */
  note?: string;
}

export interface PrQueueBriefingSection {
  /** True коли GitHub API недоступний (немає token / 4xx). */
  notConfigured?: boolean;
  /** Кількість відкритих PR. */
  openCount?: number;
  /** PR без requested-reviewers / без approval (needs-review). */
  needsReviewCount?: number;
  /** Top open PR (max 5) — назва + url + чи `needs_review`. */
  topPrs?: Array<{
    number: number;
    title: string;
    url: string;
    needsReview: boolean;
  }>;
  /** Free-form пояснення. */
  note?: string;
}

export interface WorkflowsBriefingSection {
  /** True коли `N8N_API_URL` / `N8N_API_KEY` не сконфігурований. */
  notConfigured?: boolean;
  /** Загальна кількість workflows у n8n-instance. */
  totalCount?: number;
  /** Скільки з них active (виконуються за тригером). */
  activeCount?: number;
  /** Скільки inactive (вимкнено, не fail-стан). */
  inactiveCount?: number;
  /** Скільки помічено як failing у останній run-сесії (best-effort). */
  failingCount?: number;
  /** Free-form пояснення. */
  note?: string;
}

export interface AlertsBriefingSection {
  /** True коли `SENTRY_AUTH_TOKEN` не сконфігурований. */
  notConfigured?: boolean;
  /** Severity level, який запитували (default `error`). */
  level?: "fatal" | "error" | "warning";
  /** Кількість issue-ів у відповіді (capped). */
  issueCount?: number;
  /** Top issue-и (max 3) — title + рівень + count + permalink. */
  topIssues?: Array<{
    title: string;
    level: string;
    count: string;
    permalink: string;
  }>;
  /** Free-form пояснення. */
  note?: string;
}

/**
 * Канонічний shape даних, які `buildMorningBriefing(data)` рендерить у
 * markdown. Кожна секція може бути:
 *   - `notConfigured` — env-vars відсутні, рендер показує hint;
 *   - частковою (тільки деякі поля) — рендер показує що є + `note`;
 *   - повною — рендер показує всі деталі.
 */
export interface MorningBriefingData {
  /** ISO-8601 момент генерації (UTC). */
  generatedAt: string;
  /** День, за який звітуємо — `YYYY-MM-DD` у Europe/Kyiv. */
  reportingDate: string;
  stripe: StripeBriefingSection;
  signups: SignupsBriefingSection;
  prQueue: PrQueueBriefingSection;
  workflows: WorkflowsBriefingSection;
  alerts: AlertsBriefingSection;
}

/**
 * Вхід у HTTP-endpoint `/api/internal/openclaw/briefing/morning`.
 * Опціональний `now` — для тестів, щоб «вчора» було детермінованим.
 */
export interface AssembleMorningBriefingInput {
  /** Override wall-clock для тестів. Default — `Date.now()`. */
  nowMs?: number;
  /** Lookback в днях для Stripe/PostHog. Default 1 (вчора). */
  windowDays?: number;
  /** Опціональний override власника репо для GitHub. */
  githubRepo?: string;
  /** Cap кількості Sentry-issue-ів у `topIssues`. Default 3. */
  sentryLimit?: number;
  /** Cap кількості PR у `topPrs`. Default 5. */
  prLimit?: number;
}

/**
 * Структурована відповідь HTTP-endpoint:
 *   - `markdown` — pre-rendered briefing для прямого посту в Telegram;
 *   - `data` — структуровані дані, якщо консумер хоче власний рендер
 *     (наприклад, тести, або майбутній LLM-pass у PR-27).
 */
export interface MorningBriefingResponse {
  markdown: string;
  data: MorningBriefingData;
}
