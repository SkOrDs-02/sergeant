/**
 * Sergeant Design System — AI Insight types (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § AI surfaces
 *
 * `Insight` describes a single AI push-notification surface rendered by
 * `<InsightCard>`. Identified by a stable string id so dismissals
 * persist across reloads + sessions (see `useInsightDismissal`).
 *
 * Insight registry — examples used by PR-8 / future insights backlog:
 *
 *   finyk-coffee-limit-{YYYY-MM}      Coffee spend > +25% MoM
 *   finyk-budget-overrun-{cat}        Category exceeded > 10%
 *   finyk-recurring-detected          Recurring tx without recurring rule
 *   fizruk-rest-day-overdue           3+ days without workout
 *   fizruk-pr-pending                 PR achievable on current weight
 *   routine-streak-record-pending     Longest streak −1 day
 *   routine-todo-evening              2+ pending habits, >= 20:00
 *   nutrition-protein-low             Protein < 60 % of goal, >= 18:00
 *   nutrition-streak-7-days           7 days in kcal range
 *
 * No `z` validation here yet — types kept structural. PR-7b adds Zod
 * runtime parser once the wire-up surfaces actual data.
 */

import type { ModuleAccent } from "@sergeant/design-tokens";

/** Stable insight identifier — `{module}-{slug}-{optional-suffix}`. */
export type InsightId = string;

export type InsightAction =
  | { type: "navigate"; path: string }
  | { type: "open-chat"; prompt: string }
  | { type: "callback"; fn: () => void };

export type InsightShowOn = "hub" | "module" | "both";

export interface Insight {
  id: InsightId;
  /** `null` для hub-level інсайтів. */
  module: ModuleAccent | null;
  /** Bold title — стислий signal ("Витрати на каву ↑ 34%"). */
  title: string;
  /** Subtitle — рекомендована дія ("Встановити ліміт?"). */
  subtitle: string;
  action: InsightAction;
  /** ms — auto-dismiss після інтервалу. Опціонально. */
  ttl?: number;
  showOn: InsightShowOn;
}
