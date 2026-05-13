/**
 * O3 (Phase 2.B) — Friday weekly review для OpenClaw founder-DM. Без
 * production LLM-required: builder тягне дані з тих самих джерел, що
 * morning briefing (PR-26 §builder.ts), але з 7-денним вікном; LLM
 * narrative (priorities на наступний тиждень) — optional layer, через
 * `LLMProvider` + `StubProvider` fallback (PR-23/25 pattern). Шаблон
 * рендериться у `template.ts`, дані збираються у `builder.ts`.
 *
 * AI-CONTEXT: shape стабільна для cron-консумера (WF-26). Будь-яка
 * зміна імен полів — breaking-change для n8n-workflow. Опціональні
 * поля для graceful-degrade (notConfigured / note); LLM-narrative —
 * `narrative` + `narrativeSource: 'llm'|'template'`, щоб post-hoc
 * audit-query знав, чи звіт пройшов LLM-pass.
 */

export interface WeeklyShippedSection {
  /** GitHub API недоступний (немає token / 4xx). */
  notConfigured?: boolean;
  /** Кількість PR з merged_at у window-і. */
  mergedCount?: number;
  /** Кількість PR з closed_at у window-і (не-merged closures). */
  closedCount?: number;
  /** Топ-5 merged PR — назва + url + author. */
  topMerged?: Array<{
    number: number;
    title: string;
    url: string;
    author?: string;
  }>;
  /** Free-form note (fail-open / cap reached). */
  note?: string;
}

export interface WeeklyMetricsSection {
  /** STRIPE_SECRET_KEY не сконфігурований. */
  notConfigured?: boolean;
  /** Window у днях (default 7). */
  windowDays?: number;
  /** Stripe gross UAH у цьому window-і. */
  grossUahThis?: number;
  /** Stripe gross UAH у попередньому window-і (для delta). */
  grossUahPrev?: number;
  /** Stripe success count цього window-у. */
  successCountThis?: number;
  /** Stripe success count попереднього window-у. */
  successCountPrev?: number;
  /** Free-form note. */
  note?: string;
}

export interface WeeklyOpenCommitmentsSection {
  /** GitHub API недоступний. */
  notConfigured?: boolean;
  /** Кількість open PR. */
  openCount?: number;
  /** Кількість open PR старіших за `staleDays` (default 7). */
  staleCount?: number;
  /** Top-5 найстаріших open PR. */
  staleTop?: Array<{
    number: number;
    title: string;
    url: string;
    ageDays: number;
  }>;
  /** Free-form note. */
  note?: string;
}

export interface WeeklyAlertsSection {
  /** SENTRY_AUTH_TOKEN не сконфігурований. */
  notConfigured?: boolean;
  /** Severity рівень. */
  level?: "fatal" | "error" | "warning";
  /** Total issue count у window-і (capped). */
  issueCount?: number;
  /** Top-3 нові issue. */
  topIssues?: Array<{
    title: string;
    level: string;
    count: string;
    permalink: string;
  }>;
  /** Free-form note. */
  note?: string;
}

export interface WeeklyNarrativeSection {
  /** Source: 'llm' — LLM-generated; 'template' — deterministic fallback. */
  source: "llm" | "template";
  /** Markdown-narrative — 2-3 параграфи з пріоритетами на наступний тиждень. */
  text: string;
  /** Optional LLM-provider name для observability (anthropic|stub|openrouter). */
  provider?: string;
}

export interface WeeklyReviewData {
  /** ISO-8601 момент генерації (UTC). */
  generatedAt: string;
  /** Початок window-у — `YYYY-MM-DD` у Europe/Kyiv. */
  windowStart: string;
  /** Кінець window-у — `YYYY-MM-DD` у Europe/Kyiv (день генерації, exclusive). */
  windowEnd: string;
  shipped: WeeklyShippedSection;
  metrics: WeeklyMetricsSection;
  openCommitments: WeeklyOpenCommitmentsSection;
  alerts: WeeklyAlertsSection;
  narrative: WeeklyNarrativeSection;
}

export interface AssembleWeeklyReviewInput {
  /** Override wall-clock для тестів. Default `Date.now()`. */
  nowMs?: number;
  /** Window у днях (default 7). */
  windowDays?: number;
  /** Stale threshold у днях для open PRs (default 7). */
  staleDays?: number;
  /** Override власника репо для GitHub. */
  githubRepo?: string;
  /** Cap Sentry-issue-ів. Default 3. */
  sentryLimit?: number;
  /** Cap PR у `topMerged`. Default 5. */
  prLimit?: number;
}

export interface WeeklyReviewResponse {
  markdown: string;
  data: WeeklyReviewData;
}
