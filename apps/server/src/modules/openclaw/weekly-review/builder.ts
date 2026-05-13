/**
 * O3 (Phase 2.B) — orchestrator що збирає `WeeklyReviewData` з джерел:
 *
 *   - GitHub closed PRs (`githubPrs({ state: 'closed', perPage })`) →
 *     фільтруємо за `closed_at` у тижневому window-і → merged + closed
 *     лічильники + top-5 merged.
 *   - GitHub open PRs (`githubPrs({ state: 'open' })`) → стерильно
 *     `created_at` vs now → stale-count (>staleDays) + top-5 stale.
 *   - Stripe metrics (`getStripeMetrics({ days })`) — двічі: цей тиждень
 *     і попередній (для delta).
 *   - PostHog `subscription_started` (`fetchPostHogSubscriptionStarted`-
 *     еквивалент) — теж двічі, з offset-ом на window.
 *   - Sentry alerts (`getSentryIssues({ level: 'error', limit })`).
 *   - LLM narrative — через `getLLMProvider()` + `invokeLLM()` із fallback
 *     на template-narrative (PR-25 pattern, PR-26 morning briefing -
 *     no-LLM pure-template).
 *
 * Усе fail-open: будь-яка subsystem помилка → секція з `notConfigured`
 * або `note`. Виклики паралельні через `Promise.allSettled`.
 *
 * AI-CONTEXT: builder існує окремо від pure-template, щоб юніт-тести
 * могли мокити кожне джерело незалежно. Template залишається 100%
 * deterministic.
 */

import { env } from "../../../env.js";
import {
  getLLMProvider,
  invokeLLM,
  type LLMBreadcrumbFn,
  type LLMProvider,
} from "../../../lib/llm/provider.js";
import { logger } from "../../../obs/logger.js";
import { githubPrs } from "../code-tools.js";
import { getSentryIssues, getStripeMetrics } from "../tools.js";
import { buildWeeklyReview } from "./template.js";
import type {
  AssembleWeeklyReviewInput,
  WeeklyAlertsSection,
  WeeklyMetricsSection,
  WeeklyNarrativeSection,
  WeeklyOpenCommitmentsSection,
  WeeklyReviewData,
  WeeklyReviewResponse,
  WeeklyShippedSection,
} from "./types.js";

/** Кyiv-time canonical YYYY-MM-DD (див. morning-briefing/builder.ts § Європа/Київ). */
function formatKyivDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * DI-shim для тестів — дозволяє інжектити LLMProvider + breadcrumb-emitter
 * без mock-у модулів. Production caller (HTTP route) використовує default.
 */
export interface AssembleWeeklyReviewOptions {
  provider?: LLMProvider;
  addBreadcrumb?: LLMBreadcrumbFn;
  /** Override fallback-on-error для одного instance-а handler-а. */
  fallbackOnError?: boolean;
}

export async function assembleWeeklyReview(
  input: AssembleWeeklyReviewInput = {},
  options: AssembleWeeklyReviewOptions = {},
): Promise<WeeklyReviewResponse> {
  const nowMs = input.nowMs ?? Date.now();
  const windowDays = Math.max(1, Math.min(30, input.windowDays ?? 7));
  const staleDays = Math.max(1, Math.min(60, input.staleDays ?? 7));
  const sentryLimit = Math.max(1, Math.min(20, input.sentryLimit ?? 3));
  const prLimit = Math.max(1, Math.min(30, input.prLimit ?? 5));

  const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  const [
    stripeThisResult,
    stripePrevResult,
    openPrsResult,
    closedPrsResult,
    sentryResult,
  ] = await Promise.allSettled([
    getStripeMetrics({ days: windowDays }),
    getStripeMetrics({ days: 2 * windowDays }),
    githubPrs({
      state: "open",
      perPage: 30,
      sort: "created",
      direction: "asc",
      ...(input.githubRepo !== undefined ? { repo: input.githubRepo } : {}),
    }),
    githubPrs({
      state: "closed",
      perPage: 30,
      sort: "updated",
      direction: "desc",
      ...(input.githubRepo !== undefined ? { repo: input.githubRepo } : {}),
    }),
    getSentryIssues({ level: "error", limit: sentryLimit }),
  ]);

  const shipped = mapShipped(closedPrsResult, windowStartMs, prLimit);
  const metrics = mapMetrics(stripeThisResult, stripePrevResult, windowDays);
  const openCommitments = mapOpenCommitments(
    openPrsResult,
    nowMs,
    staleDays,
    prLimit,
  );
  const alerts = mapAlerts(sentryResult);

  // Template-narrative завжди є — як stub-fallback для LLM, так і final
  // fallback коли LLM повернув !ok.
  const templateNarrative = buildTemplateNarrative({
    shipped,
    metrics,
    openCommitments,
    alerts,
  });
  const narrative = await maybeRunLlmNarrative({
    templateNarrative,
    shipped,
    metrics,
    openCommitments,
    alerts,
    fallbackOnError:
      options.fallbackOnError ?? env.LLM_DIGEST_FALLBACK_ON_ERROR,
    provider: options.provider,
    ...(options.addBreadcrumb !== undefined
      ? { addBreadcrumb: options.addBreadcrumb }
      : {}),
  });

  const data: WeeklyReviewData = {
    generatedAt: new Date(nowMs).toISOString(),
    windowStart: formatKyivDate(new Date(windowStartMs)),
    windowEnd: formatKyivDate(new Date(nowMs)),
    shipped,
    metrics,
    openCommitments,
    alerts,
    narrative,
  };
  return { markdown: buildWeeklyReview(data), data };
}

// ────────────────────────────── mappers ──────────────────────────────

function mapShipped(
  result: PromiseSettledResult<Awaited<ReturnType<typeof githubPrs>>>,
  windowStartMs: number,
  topLimit: number,
): WeeklyShippedSection {
  if (result.status === "rejected") {
    logger.warn({
      msg: "openclaw_weekly_review_github_closed_failed",
      error: result.reason instanceof Error ? result.reason.message : "unknown",
    });
    return { notConfigured: true };
  }
  const v = result.value;
  if (v.status >= 400) {
    return { notConfigured: true, note: `GitHub API повернув ${v.status}.` };
  }
  const list = Array.isArray(v.body)
    ? (v.body as Array<{
        number?: number;
        title?: string;
        html_url?: string;
        closed_at?: string | null;
        merged_at?: string | null;
        user?: { login?: string };
      }>)
    : [];
  const inWindow = list.filter(
    (pr) =>
      typeof pr.closed_at === "string" &&
      new Date(pr.closed_at).getTime() >= windowStartMs,
  );
  const merged = inWindow.filter((pr) => typeof pr.merged_at === "string");
  const closedNotMerged = inWindow.filter(
    (pr) => typeof pr.merged_at !== "string",
  );
  const topMerged = merged.slice(0, topLimit).map((pr) => ({
    number: typeof pr.number === "number" ? pr.number : 0,
    title: typeof pr.title === "string" ? pr.title : "(no title)",
    url: typeof pr.html_url === "string" ? pr.html_url : "",
    ...(typeof pr.user?.login === "string" ? { author: pr.user.login } : {}),
  }));
  return {
    mergedCount: merged.length,
    closedCount: closedNotMerged.length,
    topMerged,
  };
}

function mapMetrics(
  stripeThisResult: PromiseSettledResult<
    Awaited<ReturnType<typeof getStripeMetrics>>
  >,
  stripePrevResult: PromiseSettledResult<
    Awaited<ReturnType<typeof getStripeMetrics>>
  >,
  windowDays: number,
): WeeklyMetricsSection {
  const stripeThis =
    stripeThisResult.status === "fulfilled" ? stripeThisResult.value : null;
  const stripePrev =
    stripePrevResult.status === "fulfilled" ? stripePrevResult.value : null;

  if (!stripeThis || stripeThis.notConfigured) {
    return { notConfigured: true, windowDays };
  }
  const out: WeeklyMetricsSection = { windowDays };
  if (typeof stripeThis.successfulCount === "number")
    out.successCountThis = stripeThis.successfulCount;
  if (typeof stripeThis.grossAmountUah === "number")
    out.grossUahThis = stripeThis.grossAmountUah;

  if (stripePrev && !stripePrev.notConfigured) {
    // Cumulative `2*windowDays` → попередній window = total - this.
    if (
      typeof stripePrev.successfulCount === "number" &&
      typeof out.successCountThis === "number"
    ) {
      out.successCountPrev = Math.max(
        0,
        stripePrev.successfulCount - out.successCountThis,
      );
    }
    if (
      typeof stripePrev.grossAmountUah === "number" &&
      typeof out.grossUahThis === "number"
    ) {
      out.grossUahPrev = Math.max(
        0,
        stripePrev.grossAmountUah - out.grossUahThis,
      );
    }
  }
  return out;
}

function mapOpenCommitments(
  result: PromiseSettledResult<Awaited<ReturnType<typeof githubPrs>>>,
  nowMs: number,
  staleDays: number,
  topLimit: number,
): WeeklyOpenCommitmentsSection {
  if (result.status === "rejected") {
    return { notConfigured: true };
  }
  const v = result.value;
  if (v.status >= 400) {
    return { notConfigured: true, note: `GitHub API повернув ${v.status}.` };
  }
  const list = Array.isArray(v.body)
    ? (v.body as Array<{
        number?: number;
        title?: string;
        html_url?: string;
        created_at?: string;
      }>)
    : [];
  const staleThresholdMs = nowMs - staleDays * 24 * 60 * 60 * 1000;
  const stale = list.filter(
    (pr) =>
      typeof pr.created_at === "string" &&
      new Date(pr.created_at).getTime() < staleThresholdMs,
  );
  const staleTop = stale.slice(0, topLimit).map((pr) => {
    const ageDays =
      typeof pr.created_at === "string"
        ? Math.floor(
            (nowMs - new Date(pr.created_at).getTime()) / (24 * 60 * 60 * 1000),
          )
        : 0;
    return {
      number: typeof pr.number === "number" ? pr.number : 0,
      title: typeof pr.title === "string" ? pr.title : "(no title)",
      url: typeof pr.html_url === "string" ? pr.html_url : "",
      ageDays,
    };
  });
  return {
    openCount: list.length,
    staleCount: stale.length,
    staleTop,
  };
}

function mapAlerts(
  result: PromiseSettledResult<Awaited<ReturnType<typeof getSentryIssues>>>,
): WeeklyAlertsSection {
  if (result.status === "rejected") {
    return { notConfigured: true };
  }
  const v = result.value;
  if (v.notConfigured) {
    const out: WeeklyAlertsSection = { notConfigured: true };
    if (v.note !== undefined) out.note = v.note;
    return out;
  }
  const issues = v.issues ?? [];
  const out: WeeklyAlertsSection = {
    level: "error",
    issueCount: issues.length,
    topIssues: issues.slice(0, 3),
  };
  if (v.note !== undefined) out.note = v.note;
  return out;
}

// ────────────────────────── narrative layer ──────────────────────────

interface NarrativeContext {
  shipped: WeeklyShippedSection;
  metrics: WeeklyMetricsSection;
  openCommitments: WeeklyOpenCommitmentsSection;
  alerts: WeeklyAlertsSection;
}

function buildTemplateNarrative(ctx: NarrativeContext): string {
  const parts: string[] = [];
  const merged = ctx.shipped.mergedCount ?? 0;
  if (merged === 0) {
    parts.push(
      "Тиждень без merged-PR — варто розпакувати, що блокує doставку.",
    );
  } else if (merged < 3) {
    parts.push(
      `Лише ${merged} PR merged — фокус наступного тижня може бути на прискоренні review-loop.`,
    );
  } else {
    parts.push(
      `${merged} PR merged — гарний ритм. Підтримуй темп, але перевір зупинений stale-backlog.`,
    );
  }
  const stale = ctx.openCommitments.staleCount ?? 0;
  if (stale > 0) {
    parts.push(
      `${stale} PR старіших за тиждень. Потрібен trim-pass: closeабоrebase.`,
    );
  }
  const issues = ctx.alerts.issueCount ?? 0;
  if (issues > 0) {
    parts.push(`Sentry: ${issues} unresolved error issues — варто triage.`);
  }
  if (parts.length === 0) {
    parts.push(
      "Спокійний тиждень — підтримуй cadence-у і шукай proactive bets.",
    );
  }
  return parts.join(" ");
}

interface MaybeRunLlmInput extends NarrativeContext {
  templateNarrative: string;
  fallbackOnError: boolean;
  provider?: LLMProvider | undefined;
  addBreadcrumb?: LLMBreadcrumbFn;
}

async function maybeRunLlmNarrative(
  input: MaybeRunLlmInput,
): Promise<WeeklyNarrativeSection> {
  const provider =
    input.provider ??
    getLLMProvider({
      stubResponse: { text: input.templateNarrative },
    });
  const systemPrompt = `Ти cofounder-strategist. Готуєш короткий narrative (2-3 короткі речення українською) з пріоритетами на наступний тиждень. Без emoji, без markdown-обгортки. Не дублюй цифри з блоку даних — інтерпретуй їх.`;
  const userPrompt = `Дані тижня:
- Merged PR: ${input.shipped.mergedCount ?? 0}
- Closed (без merge): ${input.shipped.closedCount ?? 0}
- Open PR: ${input.openCommitments.openCount ?? 0} (з них stale: ${input.openCommitments.staleCount ?? 0})
- Stripe gross UAH (тиждень / попередній): ${input.metrics.grossUahThis ?? "?"} / ${input.metrics.grossUahPrev ?? "?"}
- Sentry unresolved error issues: ${input.alerts.issueCount ?? 0}

Виведи 2-3 речення з пріоритетами на наступний тиждень.`;

  try {
    const llmResult = await invokeLLM(
      provider,
      {
        model: "claude-sonnet-4-6",
        maxTokens: 320,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        endpoint: "internal/openclaw/ritual/weekly",
        timeoutMs: 20_000,
      },
      input.addBreadcrumb ? { addBreadcrumb: input.addBreadcrumb } : {},
    );
    if (llmResult.ok && llmResult.text.trim().length > 0) {
      return {
        source: "llm",
        text: llmResult.text.trim(),
        provider: provider.name,
      };
    }
    if (!input.fallbackOnError) {
      logger.warn({
        msg: "openclaw_weekly_review_llm_failed_no_fallback",
        outcome: llmResult.ok ? "empty" : llmResult.code,
      });
    }
  } catch (err) {
    logger.warn({
      msg: "openclaw_weekly_review_llm_threw",
      error: err instanceof Error ? err.message : "unknown",
    });
  }
  return {
    source: "template",
    text: input.templateNarrative,
    provider: provider.name,
  };
}
