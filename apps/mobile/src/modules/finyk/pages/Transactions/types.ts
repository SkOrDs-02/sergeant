/**
 * Sergeant Finyk — TransactionsPage shared types.
 *
 * Lifted out of the page component so child components / hooks can
 * import the same `FilterChip` / `FeedItem` shapes without circular
 * dependencies through the orchestrator.
 */
import type { Transaction } from "@sergeant/finyk-domain/domain";

import { STORAGE_KEYS } from "@sergeant/shared";

export interface FilterChip {
  id: string;
  label: string;
}

export const BASE_FILTERS: FilterChip[] = [
  { id: "all", label: "Всі" },
  { id: "expense", label: "Витрати" },
  { id: "income", label: "Доходи" },
];

export type FeedItem =
  | {
      kind: "header";
      key: string;
      dayKey: string;
      label: string;
      total: number;
      count: number;
      collapsed: boolean;
    }
  | { kind: "tx"; key: string; tx: Transaction };

/** Sparse per-day override map. Missing entries fall back to the
 *  default rule ("today is expanded, rest collapsed"); explicit
 *  booleans survive across cold starts. */
export type DayCollapseMap = Record<string, boolean>;

export const DAY_COLLAPSE_KEY = STORAGE_KEYS.FINYK_TX_DAY_COLLAPSE;

export interface DraftRange {
  start: string;
  end: string;
}
