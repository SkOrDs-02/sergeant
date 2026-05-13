/**
 * O3 (Phase 2.B) — Monthly OKR review для OpenClaw founder-DM.
 *
 * Source хardcoded interim — `okrs.INTERIM_OKRS`. У майбутньому
 * (PR-34 strategic_goals SQL-table) source перейде на live-DB query,
 * але public shape залишається стабільною для n8n-WF-27.
 */

import type { Okr } from "./okrs.js";

export interface MonthlyOkrProgressSection {
  /** Snapshot OKR-списку (mirrors okrs.INTERIM_OKRS на момент generation). */
  okrs: Array<{
    id: string;
    objective: string;
    quarter: string;
    /** Overall progress (avg of all KRs у %). */
    progressPct: number;
    krs: Array<{
      label: string;
      target: number;
      current: number;
      unit: string;
      progressPct: number;
    }>;
  }>;
  /** Тимчасова примітка про interim hardcoded data. */
  note?: string;
}

export interface MonthlyWinsSection {
  /** GitHub API недоступний. */
  notConfigured?: boolean;
  /** Merged PR count за місяць. */
  mergedCount?: number;
  /** Top merged PR (5 шт). */
  topMerged?: Array<{
    number: number;
    title: string;
    url: string;
    author?: string;
  }>;
  note?: string;
}

export interface MonthlyRisksSection {
  /** Sentry + n8n combined risk-snapshot. */
  notConfigured?: boolean;
  /** Sentry unresolved error issues count. */
  sentryUnresolvedCount?: number;
  /** Open PRs older than 30 days (stale commitments). */
  staleCommitmentsCount?: number;
  /** Top blockers (3 шт) — title + link. */
  topBlockers?: Array<{
    kind: "sentry" | "stale_pr";
    title: string;
    url: string;
  }>;
  note?: string;
}

export interface MonthlyNarrativeSection {
  source: "llm" | "template";
  text: string;
  provider?: string;
}

export interface MonthlyOkrData {
  /** ISO-8601 момент генерації (UTC). */
  generatedAt: string;
  /** Звітний місяць — `YYYY-MM` у Europe/Kyiv (попередній місяць). */
  reportingMonth: string;
  progress: MonthlyOkrProgressSection;
  wins: MonthlyWinsSection;
  risks: MonthlyRisksSection;
  narrative: MonthlyNarrativeSection;
}

export interface AssembleMonthlyOkrInput {
  nowMs?: number;
  /** Override hardcoded OKR set для тестів. */
  okrsOverride?: readonly Okr[];
  /** Override власника репо. */
  githubRepo?: string;
  /** Cap PR у `topMerged` / blockers. Default 5. */
  prLimit?: number;
  /** Sentry severity. */
  sentryLevel?: "fatal" | "error" | "warning";
  /** Stale-PR threshold у днях. Default 30. */
  staleDays?: number;
}

export interface MonthlyOkrResponse {
  markdown: string;
  data: MonthlyOkrData;
}
