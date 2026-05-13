/**
 * O3 (Phase 2.B) — orchestrator: збирає `MonthlyOkrData` для monthly
 * OKR review. Джерела:
 *
 *   - `INTERIM_OKRS` (hardcoded, поки PR-34 strategic_goals не merged).
 *   - GitHub closed PRs (window 30 днів) для wins.
 *   - GitHub open PRs з `created_at` > staleDays (default 30) для risks.
 *   - Sentry unresolved error issues для risks.
 *   - LLM narrative — `LLMProvider` + StubProvider fallback (PR-23/25).
 *
 * Fail-open: будь-яка subsystem помилка → секція з `notConfigured` або
 * `note`.
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
import { getSentryIssues } from "../tools.js";
import { INTERIM_OKRS, krProgressPct, type Okr } from "./okrs.js";
import { buildMonthlyOkrReview } from "./template.js";
import type {
  AssembleMonthlyOkrInput,
  MonthlyOkrData,
  MonthlyOkrProgressSection,
  MonthlyOkrResponse,
  MonthlyNarrativeSection,
  MonthlyRisksSection,
  MonthlyWinsSection,
} from "./types.js";

function formatKyivMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

export interface AssembleMonthlyOkrOptions {
  provider?: LLMProvider;
  addBreadcrumb?: LLMBreadcrumbFn;
  fallbackOnError?: boolean;
}

export async function assembleMonthlyOkrReview(
  input: AssembleMonthlyOkrInput = {},
  options: AssembleMonthlyOkrOptions = {},
): Promise<MonthlyOkrResponse> {
  const nowMs = input.nowMs ?? Date.now();
  const okrsSource = input.okrsOverride ?? INTERIM_OKRS;
  const prLimit = Math.max(1, Math.min(30, input.prLimit ?? 5));
  const staleDays = Math.max(1, Math.min(120, input.staleDays ?? 30));
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  // Reporting month — попередній календарний місяць у Kyiv. Бо
  // викликається 1-го числа поточного, ми звітуємо за попередній.
  const lastMonthDate = new Date(nowMs - 24 * 60 * 60 * 1000);
  const reportingMonth = formatKyivMonth(lastMonthDate);

  const [closedPrsResult, openPrsResult, sentryResult] =
    await Promise.allSettled([
      githubPrs({
        state: "closed",
        perPage: 30,
        sort: "updated",
        direction: "desc",
        ...(input.githubRepo !== undefined ? { repo: input.githubRepo } : {}),
      }),
      githubPrs({
        state: "open",
        perPage: 30,
        sort: "created",
        direction: "asc",
        ...(input.githubRepo !== undefined ? { repo: input.githubRepo } : {}),
      }),
      getSentryIssues({ level: input.sentryLevel ?? "error", limit: 10 }),
    ]);

  const wins = mapWins(closedPrsResult, nowMs - monthMs, prLimit);
  const risks = mapRisks(
    sentryResult,
    openPrsResult,
    nowMs,
    staleDays,
    prLimit,
  );
  const progress = mapProgress(okrsSource);

  const templateNarrative = buildTemplateNarrative({
    progress,
    wins,
    risks,
  });
  const narrative = await maybeRunLlmNarrative({
    templateNarrative,
    progress,
    wins,
    risks,
    fallbackOnError:
      options.fallbackOnError ?? env.LLM_DIGEST_FALLBACK_ON_ERROR,
    provider: options.provider,
    ...(options.addBreadcrumb !== undefined
      ? { addBreadcrumb: options.addBreadcrumb }
      : {}),
  });

  const data: MonthlyOkrData = {
    generatedAt: new Date(nowMs).toISOString(),
    reportingMonth,
    progress,
    wins,
    risks,
    narrative,
  };
  return { markdown: buildMonthlyOkrReview(data), data };
}

// ────────────────────────────── mappers ──────────────────────────────

function mapProgress(okrs: readonly Okr[]): MonthlyOkrProgressSection {
  return {
    okrs: okrs.map((okr) => {
      const krs = okr.krs.map((kr) => ({
        label: kr.label,
        target: kr.target,
        current: kr.current,
        unit: kr.unit,
        progressPct: krProgressPct(kr),
      }));
      const avg =
        krs.length === 0
          ? 0
          : krs.reduce((sum, k) => sum + k.progressPct, 0) / krs.length;
      return {
        id: okr.id,
        objective: okr.objective,
        quarter: okr.quarter,
        progressPct: avg,
        krs,
      };
    }),
    note: "Interim hardcoded OKR (PR-34 strategic_goals ще не merged).",
  };
}

function mapWins(
  result: PromiseSettledResult<Awaited<ReturnType<typeof githubPrs>>>,
  windowStartMs: number,
  topLimit: number,
): MonthlyWinsSection {
  if (result.status === "rejected") {
    logger.warn({
      msg: "openclaw_monthly_okr_github_closed_failed",
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
  const merged = list.filter(
    (pr) =>
      typeof pr.merged_at === "string" &&
      new Date(pr.merged_at).getTime() >= windowStartMs,
  );
  const topMerged = merged.slice(0, topLimit).map((pr) => ({
    number: typeof pr.number === "number" ? pr.number : 0,
    title: typeof pr.title === "string" ? pr.title : "(no title)",
    url: typeof pr.html_url === "string" ? pr.html_url : "",
    ...(typeof pr.user?.login === "string" ? { author: pr.user.login } : {}),
  }));
  return { mergedCount: merged.length, topMerged };
}

function mapRisks(
  sentryResult: PromiseSettledResult<
    Awaited<ReturnType<typeof getSentryIssues>>
  >,
  openPrsResult: PromiseSettledResult<Awaited<ReturnType<typeof githubPrs>>>,
  nowMs: number,
  staleDays: number,
  topLimit: number,
): MonthlyRisksSection {
  const out: MonthlyRisksSection = {};
  const blockers: NonNullable<MonthlyRisksSection["topBlockers"]> = [];

  // Sentry
  if (sentryResult.status === "fulfilled") {
    const v = sentryResult.value;
    if (v.notConfigured) {
      out.notConfigured = true;
    } else {
      const issues = v.issues ?? [];
      out.sentryUnresolvedCount = issues.length;
      for (const issue of issues.slice(0, topLimit)) {
        blockers.push({
          kind: "sentry",
          title: issue.title,
          url: issue.permalink,
        });
      }
    }
  } else {
    out.note = "Sentry-запит відхилений.";
  }

  // Stale PRs
  if (openPrsResult.status === "fulfilled") {
    const v = openPrsResult.value;
    if (v.status >= 400) {
      out.notConfigured = true;
    } else {
      const list = Array.isArray(v.body)
        ? (v.body as Array<{
            number?: number;
            title?: string;
            html_url?: string;
            created_at?: string;
          }>)
        : [];
      const cutoff = nowMs - staleDays * 24 * 60 * 60 * 1000;
      const stale = list.filter(
        (pr) =>
          typeof pr.created_at === "string" &&
          new Date(pr.created_at).getTime() < cutoff,
      );
      out.staleCommitmentsCount = stale.length;
      for (const pr of stale.slice(
        0,
        Math.max(0, topLimit - blockers.length),
      )) {
        blockers.push({
          kind: "stale_pr",
          title: `#${pr.number ?? "?"} ${pr.title ?? ""}`.trim(),
          url: typeof pr.html_url === "string" ? pr.html_url : "",
        });
      }
    }
  }

  if (blockers.length > 0) out.topBlockers = blockers;
  return out;
}

// ────────────────────────── narrative layer ──────────────────────────

interface MonthlyNarrativeContext {
  progress: MonthlyOkrProgressSection;
  wins: MonthlyWinsSection;
  risks: MonthlyRisksSection;
}

function buildTemplateNarrative(ctx: MonthlyNarrativeContext): string {
  const parts: string[] = [];
  const avgProgress =
    ctx.progress.okrs.length === 0
      ? 0
      : ctx.progress.okrs.reduce((sum, o) => sum + o.progressPct, 0) /
        ctx.progress.okrs.length;
  if (avgProgress < 25) {
    parts.push(
      `Avg OKR progress ${avgProgress.toFixed(0)}% — критично відстаємо. Re-prioritize або скорочуй scope.`,
    );
  } else if (avgProgress < 60) {
    parts.push(
      `Avg OKR progress ${avgProgress.toFixed(0)}% — на середньому темпі. Перевір, які KR блокують прогрес.`,
    );
  } else {
    parts.push(
      `Avg OKR progress ${avgProgress.toFixed(0)}% — добра траєкторія. Думай про stretch-goal-и.`,
    );
  }
  const merged = ctx.wins.mergedCount ?? 0;
  if (merged > 0) {
    parts.push(`${merged} PR merged за місяць.`);
  }
  const risks =
    (ctx.risks.sentryUnresolvedCount ?? 0) +
    (ctx.risks.staleCommitmentsCount ?? 0);
  if (risks > 0) {
    parts.push(
      `${risks} risks/blockers — окреми час на triage-pass у перший тиждень місяця.`,
    );
  }
  if (parts.length === 0) {
    parts.push("Чистий місяць — час інвестувати в proactive bets.");
  }
  return parts.join(" ");
}

interface MaybeRunLlmInput extends MonthlyNarrativeContext {
  templateNarrative: string;
  fallbackOnError: boolean;
  provider?: LLMProvider | undefined;
  addBreadcrumb?: LLMBreadcrumbFn;
}

async function maybeRunLlmNarrative(
  input: MaybeRunLlmInput,
): Promise<MonthlyNarrativeSection> {
  const provider =
    input.provider ??
    getLLMProvider({
      stubResponse: { text: input.templateNarrative },
    });
  const okrSummary = input.progress.okrs
    .map(
      (o) =>
        `${o.quarter} «${o.objective}» — ${o.progressPct.toFixed(0)}% (KRs: ${o.krs.map((k) => `${k.label} ${k.progressPct.toFixed(0)}%`).join(", ")})`,
    )
    .join("; ");
  const systemPrompt = `Ти cofounder-strategist. Готуєш recalibration narrative (3-4 короткі речення українською) на основі OKR-progress + wins + risks. Без emoji, без markdown. Інтерпретуй прогрес: де ризики, які KR пріоритезувати, що відкидати.`;
  const userPrompt = `OKR snapshot: ${okrSummary}.
Wins: ${input.wins.mergedCount ?? 0} PR merged за місяць.
Risks: ${input.risks.sentryUnresolvedCount ?? 0} Sentry unresolved + ${input.risks.staleCommitmentsCount ?? 0} stale PR.

Виведи 3-4 речення recalibration-наративу.`;

  try {
    const llmResult = await invokeLLM(
      provider,
      {
        model: "claude-sonnet-4-6",
        maxTokens: 360,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        endpoint: "internal/openclaw/ritual/monthly",
        timeoutMs: 25_000,
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
        msg: "openclaw_monthly_okr_llm_failed_no_fallback",
        outcome: llmResult.ok ? "empty" : llmResult.code,
      });
    }
  } catch (err) {
    logger.warn({
      msg: "openclaw_monthly_okr_llm_threw",
      error: err instanceof Error ? err.message : "unknown",
    });
  }
  return {
    source: "template",
    text: input.templateNarrative,
    provider: provider.name,
  };
}
