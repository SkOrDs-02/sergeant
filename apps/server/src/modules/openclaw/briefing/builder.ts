/**
 * PR-26 — orchestrator що збирає `MorningBriefingData` з існуючих helper-ів:
 *
 *   - Stripe billing      → `getStripeMetrics({ days: 1 })`
 *   - PostHog signups     → `getPostHogStats({ days: 1 })` + ad-hoc trend
 *                           query для `subscription_started` event-у
 *   - GitHub PR-черга     → `githubPrs({ state: "open", perPage })`
 *   - n8n workflow-health → `listN8nWorkflows({ limit: 250 })`
 *   - Sentry alerts       → `getSentryIssues({ level: "error", limit })`
 *
 * Усі деталі fail-open: якщо одна із підсистем недоступна (network /
 * 4xx / 5xx / not configured) — пишемо `notConfigured: true` або `note`
 * у відповідну секцію та повертаємо briefing з рештою даних. Виклики
 * виконуються паралельно через `Promise.allSettled` — час сборки ≈
 * max(per-source latency), а не sum.
 *
 * AI-CONTEXT: builder існує окремо від pure-template, щоб юніт-тести
 * могли мокити кожну з 5 джерельних функцій незалежно. Template-функція
 * залишається 100% deterministic.
 */

import { logger } from "../../../obs/logger.js";
import { env } from "../../../env.js";
import {
  getPostHogStats,
  getSentryIssues,
  getStripeMetrics,
} from "../tools.js";
import { githubPrs } from "../code-tools.js";
import { listN8nWorkflows } from "../n8n.js";
import { buildMorningBriefing } from "./template.js";
import type {
  AlertsBriefingSection,
  AssembleMorningBriefingInput,
  MorningBriefingData,
  MorningBriefingResponse,
  PrQueueBriefingSection,
  SignupsBriefingSection,
  StripeBriefingSection,
  WorkflowsBriefingSection,
} from "./types.js";

/**
 * Європа/Київ — наш репо-wide canonical timezone (`docs/architecture/
 * domain-invariants.md`). `Intl.DateTimeFormat('uk-UA-u-ca-iso8601', ...)`
 * не дає нам YYYY-MM-DD detached-від-локалі, тому виконуємо через
 * `toLocaleDateString('en-CA', { timeZone })` — `en-CA` має сталий
 * YYYY-MM-DD output.
 */
function formatKyivDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Повертає `YYYY-MM-DD` для дня перед `now` у Europe/Kyiv. Briefing
 * за «вчора», тому subtract-имо 24 години до formatting-у.
 */
function computeReportingDate(nowMs: number): string {
  const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
  return formatKyivDate(yesterday);
}

/**
 * Збирає briefing — викликає 5 джерельних функцій паралельно і
 * мапить у структуру `MorningBriefingData`. Не кидає — будь-яка
 * помилка стає секцією-з-`note`.
 */
export async function assembleMorningBriefing(
  input: AssembleMorningBriefingInput = {},
): Promise<MorningBriefingResponse> {
  const nowMs = input.nowMs ?? Date.now();
  const windowDays = Math.max(1, Math.min(30, input.windowDays ?? 1));
  const sentryLimit = Math.max(1, Math.min(20, input.sentryLimit ?? 3));
  const prLimit = Math.max(1, Math.min(30, input.prLimit ?? 5));

  const [
    stripeResult,
    posthogResult,
    posthogSubResult,
    prsResult,
    workflowsResult,
    sentryResult,
  ] = await Promise.allSettled([
    getStripeMetrics({ days: windowDays }),
    getPostHogStats({ days: windowDays }),
    fetchPostHogSubscriptionStarted(windowDays),
    githubPrs({
      state: "open",
      perPage: prLimit,
      ...(input.githubRepo !== undefined ? { repo: input.githubRepo } : {}),
    }),
    listN8nWorkflows({ limit: 250 }),
    getSentryIssues({ level: "error", limit: sentryLimit }),
  ]);

  const data: MorningBriefingData = {
    generatedAt: new Date(nowMs).toISOString(),
    reportingDate: computeReportingDate(nowMs),
    stripe: mapStripe(stripeResult),
    signups: mapSignups(posthogResult, posthogSubResult, windowDays),
    prQueue: mapPrQueue(prsResult),
    workflows: mapWorkflows(workflowsResult),
    alerts: mapAlerts(sentryResult),
  };

  return { markdown: buildMorningBriefing(data), data };
}

// ────────────────────────────── mappers ──────────────────────────────

function mapStripe(
  result: PromiseSettledResult<Awaited<ReturnType<typeof getStripeMetrics>>>,
): StripeBriefingSection {
  if (result.status === "rejected") {
    logger.warn({
      msg: "openclaw_briefing_stripe_failed",
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
    return { note: "Stripe-метрики недоступні (fetch failed)." };
  }
  const v = result.value;
  if (v.notConfigured) {
    return {
      notConfigured: true,
      ...(v.note !== undefined ? { note: v.note } : {}),
    };
  }
  const out: StripeBriefingSection = {};
  if (typeof v.windowDays === "number") out.windowDays = v.windowDays;
  if (typeof v.successfulCount === "number")
    out.successfulCount = v.successfulCount;
  if (typeof v.failedCount === "number") out.failedCount = v.failedCount;
  if (typeof v.grossAmountUah === "number")
    out.grossAmountUah = v.grossAmountUah;
  if (v.note !== undefined) out.note = v.note;
  return out;
}

function mapSignups(
  posthogResult: PromiseSettledResult<
    Awaited<ReturnType<typeof getPostHogStats>>
  >,
  subscriptionStartedResult: PromiseSettledResult<SubscriptionStartedCount | null>,
  windowDays: number,
): SignupsBriefingSection {
  const out: SignupsBriefingSection = { windowDays };
  if (posthogResult.status === "rejected") {
    logger.warn({
      msg: "openclaw_briefing_posthog_failed",
      error:
        posthogResult.reason instanceof Error
          ? posthogResult.reason.message
          : "unknown",
    });
    out.note = "PostHog-метрики недоступні (fetch failed).";
  } else {
    const v = posthogResult.value;
    if (v.notConfigured) {
      out.notConfigured = true;
      if (v.note !== undefined) out.note = v.note;
    } else {
      const pv = sumPostHogTrend(v.body);
      if (pv !== null) out.pageviewCount = pv;
    }
  }
  if (subscriptionStartedResult.status === "fulfilled") {
    const v = subscriptionStartedResult.value;
    if (v && typeof v.count === "number")
      out.subscriptionStartedCount = v.count;
  } else {
    logger.warn({
      msg: "openclaw_briefing_posthog_subscription_started_failed",
      error:
        subscriptionStartedResult.reason instanceof Error
          ? subscriptionStartedResult.reason.message
          : "unknown",
    });
  }
  return out;
}

function mapPrQueue(
  result: PromiseSettledResult<Awaited<ReturnType<typeof githubPrs>>>,
): PrQueueBriefingSection {
  if (result.status === "rejected") {
    const msg =
      result.reason instanceof Error ? result.reason.message : "unknown";
    // `OpenClaw GitHub auth not configured` — fail-open like інші tools.
    if (/github auth not configured/i.test(msg)) {
      return {
        notConfigured: true,
        note: "OpenClaw GitHub auth не сконфігурована.",
      };
    }
    logger.warn({ msg: "openclaw_briefing_github_prs_failed", error: msg });
    return { note: "GitHub PR-черга недоступна (fetch failed)." };
  }
  const v = result.value;
  if (v.status >= 400) {
    return {
      note: `GitHub API повернув ${v.status}; PR-черга недоступна.`,
    };
  }
  const prs = parseGithubPrs(v.body);
  const needsReview = prs.filter((p) => p.needsReview);
  const topPrs = prs.slice(0, 5).map((p) => ({
    number: p.number,
    title: p.title,
    url: p.url,
    needsReview: p.needsReview,
  }));
  return {
    openCount: prs.length,
    needsReviewCount: needsReview.length,
    topPrs,
  };
}

function mapWorkflows(
  result: PromiseSettledResult<Awaited<ReturnType<typeof listN8nWorkflows>>>,
): WorkflowsBriefingSection {
  if (result.status === "rejected") {
    logger.warn({
      msg: "openclaw_briefing_n8n_failed",
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
    return { note: "n8n manifest недоступний (fetch failed)." };
  }
  const v = result.value;
  if (v.notConfigured) {
    return {
      notConfigured: true,
      note: "N8N_API_URL / N8N_API_KEY не сконфігуровані.",
    };
  }
  const total = v.workflows.length;
  const active = v.workflows.filter((w) => w.active).length;
  const inactive = total - active;
  // Failing count requires per-execution-history query; not in this PR.
  return {
    totalCount: total,
    activeCount: active,
    inactiveCount: inactive,
    failingCount: 0,
  };
}

function mapAlerts(
  result: PromiseSettledResult<Awaited<ReturnType<typeof getSentryIssues>>>,
): AlertsBriefingSection {
  if (result.status === "rejected") {
    logger.warn({
      msg: "openclaw_briefing_sentry_failed",
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
    return { note: "Sentry-issues недоступні (fetch failed)." };
  }
  const v = result.value;
  if (v.notConfigured) {
    return {
      notConfigured: true,
      ...(v.note !== undefined ? { note: v.note } : {}),
    };
  }
  const issues = v.issues ?? [];
  return {
    level: "error",
    issueCount: issues.length,
    topIssues: issues.slice(0, 3).map((i) => ({
      title: i.title,
      level: i.level,
      count: i.count,
      permalink: i.permalink,
    })),
    ...(v.note !== undefined ? { note: v.note } : {}),
  };
}

// ────────────────────────────── helpers ──────────────────────────────

interface SubscriptionStartedCount {
  count: number;
}

/**
 * Ad-hoc PostHog trend-query для `subscription_started` — окремий call
 * від `$pageview`-trend, щоб MRR-секція мала прямий signupsCount поза
 * залежністю від default trend-event-у. Best-effort: 404 / 401 / 5xx →
 * `null`, briefing рендерить «_не виміряно_».
 */
async function fetchPostHogSubscriptionStarted(
  days: number,
): Promise<SubscriptionStartedCount | null> {
  const apiKey = env.POSTHOG_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  const url =
    `https://app.posthog.com/api/projects/${projectId}/insights/trend/` +
    `?events=[{"id":"subscription_started"}]&date_from=-${days}d`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    logger.warn({
      msg: "openclaw_briefing_posthog_subscription_started_fetch_error",
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const body: unknown = await res.json().catch(() => null);
  const sum = sumPostHogTrend(body);
  if (sum === null) return null;
  return { count: sum };
}

/**
 * PostHog trend-API повертає `{ result: [{ aggregated_value, count, data:
 * number[], ... }] }`. Беремо перший series, повертаємо `aggregated_value`
 * як integer. Fail-soft на будь-який shape-mismatch.
 */
function sumPostHogTrend(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const result = (body as { result?: unknown }).result;
  if (!Array.isArray(result) || result.length === 0) return null;
  const first = result[0];
  if (!first || typeof first !== "object") return null;
  const agg = (first as { aggregated_value?: unknown }).aggregated_value;
  if (typeof agg === "number" && Number.isFinite(agg)) return Math.round(agg);
  const count = (first as { count?: unknown }).count;
  if (typeof count === "number" && Number.isFinite(count))
    return Math.round(count);
  const data = (first as { data?: unknown }).data;
  if (Array.isArray(data) && data.every((d) => typeof d === "number")) {
    return Math.round((data as number[]).reduce((a, b) => a + b, 0));
  }
  return null;
}

interface ParsedPr {
  number: number;
  title: string;
  url: string;
  needsReview: boolean;
}

/**
 * Маппить GitHub /pulls response-array у легкі { number, title, url,
 * needsReview }-обʼєкти. `needsReview` = `requested_reviewers` пустий
 * AND `requested_teams` пустий — proxy на «ще ніхто не запрошений».
 */
function parseGithubPrs(body: unknown): ParsedPr[] {
  if (!Array.isArray(body)) return [];
  const out: ParsedPr[] = [];
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const r = row as {
      number?: unknown;
      title?: unknown;
      html_url?: unknown;
      url?: unknown;
      requested_reviewers?: unknown;
      requested_teams?: unknown;
      draft?: unknown;
    };
    const number = typeof r.number === "number" ? r.number : null;
    const title = typeof r.title === "string" ? r.title : null;
    const url =
      typeof r.html_url === "string"
        ? r.html_url
        : typeof r.url === "string"
          ? r.url
          : null;
    if (number == null || title == null || url == null) continue;
    if (r.draft === true) continue; // draft PRs виключаємо з queue
    const reviewers = Array.isArray(r.requested_reviewers)
      ? r.requested_reviewers
      : [];
    const teams = Array.isArray(r.requested_teams) ? r.requested_teams : [];
    const needsReview = reviewers.length === 0 && teams.length === 0;
    out.push({ number, title, url, needsReview });
  }
  return out;
}

// Re-export для тестів, щоб не дублювати `Intl.DateTimeFormat`-обчислення.
export const _internals = {
  computeReportingDate,
  sumPostHogTrend,
  parseGithubPrs,
  // Експортуємо OPENCLAW_GITHUB_REPO через env, бо в тесті інакше runtime-resolve.
  defaultGithubRepo: env.OPENCLAW_GITHUB_REPO,
};
