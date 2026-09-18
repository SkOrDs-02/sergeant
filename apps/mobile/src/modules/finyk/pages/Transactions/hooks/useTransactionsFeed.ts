/**
 * Sergeant Finyk — filtered transaction feed for `TransactionsPage`.
 *
 * Owns the chain of memos that turn the raw MMKV slices + active
 * filters into the day-grouped flat array consumed by FlashList. Pure
 * derivation with no side effects: persistence and MMKV listeners live
 * in `useDayCollapse`.
 */
import { useMemo } from "react";

import {
  manualExpenseToTransaction,
  type Transaction,
} from "@sergeant/finyk-domain/domain";

import type { ManualExpenseRecord } from "@/modules/finyk/lib/transactionsStore";

import type { DayCollapseMap, FeedItem } from "../types";
import {
  dayKeyFromTime,
  formatDayLabel,
  getMonthBounds,
  isDayExpanded,
} from "../utils";

export interface UseTransactionsFeedInput {
  manualExpenses: ManualExpenseRecord[];
  realTx: Transaction[];
  hiddenTxIds: string[];
  selMonth: { year: number; month: number };
  filters: {
    filter: string;
    accountIds: string[];
    range: { startMs: number | null; endMs: number | null };
  };
  searchLower: string;
  creditAccIds: Set<string>;
  getEffectiveCat: (t: Transaction) => { id: string; label: string };
  dayOverrides: DayCollapseMap;
  todayDayKey: string;
  now: Date;
}

export interface UseTransactionsFeedResult {
  filtered: Transaction[];
  feed: FeedItem[];
  filtersActive: boolean;
}

export function useTransactionsFeed({
  manualExpenses,
  realTx,
  hiddenTxIds,
  selMonth,
  filters,
  searchLower,
  creditAccIds,
  getEffectiveCat,
  dayOverrides,
  todayDayKey,
  now,
}: UseTransactionsFeedInput): UseTransactionsFeedResult {
  const manualTxsThisMonth = useMemo<Transaction[]>(() => {
    const { start, end } = getMonthBounds(selMonth.year, selMonth.month);
    return manualExpenses
      .filter((e) => {
        const ts = e.date ? new Date(e.date).getTime() : 0;
        return ts >= start && ts < end;
      })
      .map((e) => manualExpenseToTransaction(e));
  }, [manualExpenses, selMonth.year, selMonth.month]);

  // Bank tx coming out of MMKV cache may span several months — filter
  // to the selected month so prev-month navigation surfaces cached
  // history (web parity), instead of being limited to "current month".
  const realTxThisMonth = useMemo<Transaction[]>(() => {
    const { start, end } = getMonthBounds(selMonth.year, selMonth.month);
    return realTx.filter((t) => {
      const ms = (t.time || 0) * 1000;
      return ms >= start && ms < end;
    });
  }, [realTx, selMonth.year, selMonth.month]);

  const activeTx = useMemo<Transaction[]>(
    () => [...realTxThisMonth, ...manualTxsThisMonth],
    [realTxThisMonth, manualTxsThisMonth],
  );

  const hiddenTxIdSet = useMemo(() => new Set(hiddenTxIds), [hiddenTxIds]);

  const accountFilterSet = useMemo(
    () => (filters.accountIds.length > 0 ? new Set(filters.accountIds) : null),
    [filters.accountIds],
  );

  const filtersActive =
    filters.filter !== "all" ||
    filters.accountIds.length > 0 ||
    filters.range.startMs != null ||
    filters.range.endMs != null ||
    !!searchLower;

  const filtered = useMemo<Transaction[]>(() => {
    const base = [...activeTx]
      .filter((t) => !hiddenTxIdSet.has(t.id))
      .sort((a, b) => (b.time || 0) - (a.time || 0));
    const startMs = filters.range.startMs;
    const endMs = filters.range.endMs;
    return base.filter((t) => {
      if (accountFilterSet && !accountFilterSet.has(t._accountId ?? "")) {
        return false;
      }
      if (startMs != null || endMs != null) {
        const ms = (t.time || 0) * 1000;
        if (startMs != null && ms < startMs) return false;
        if (endMs != null && ms > endMs) return false;
      }
      const matchSearch =
        !searchLower ||
        (t.description || "").toLowerCase().includes(searchLower);
      const matchFilter =
        filters.filter === "all"
          ? true
          : filters.filter === "income"
            ? t.amount > 0
            : filters.filter === "expense"
              ? t.amount < 0
              : filters.filter === "credit"
                ? creditAccIds.has(t._accountId ?? "")
                : getEffectiveCat(t).id === filters.filter;
      return matchSearch && matchFilter;
    });
  }, [
    activeTx,
    hiddenTxIdSet,
    searchLower,
    filters.filter,
    filters.range.startMs,
    filters.range.endMs,
    accountFilterSet,
    creditAccIds,
    getEffectiveCat,
  ]);

  // Build the day-grouped flat array consumed by FlashList: each day
  // contributes a `header` row (label + signed total), optionally
  // followed by its tx rows. When a day is collapsed the header is
  // still emitted — only the tx rows are suppressed so the user can tap
  // the header to expand.
  const feed = useMemo<FeedItem[]>(() => {
    // First pass: compute per-day totals across the full filtered set so
    // the collapsed-header summary stays accurate regardless of whether
    // the rows are actually emitted below.
    const totals = new Map<string, { total: number; count: number }>();
    for (const t of filtered) {
      const k = dayKeyFromTime(t.time || 0);
      const acc = totals.get(k);
      if (acc) {
        acc.total += Number(t.amount || 0);
        acc.count += 1;
      } else {
        totals.set(k, { total: Number(t.amount || 0), count: 1 });
      }
    }

    const out: FeedItem[] = [];
    let currentKey = "";
    let currentCollapsed = false;
    for (let i = 0; i < filtered.length; i++) {
      const t = filtered[i]!;
      const k = dayKeyFromTime(t.time || 0);
      if (k !== currentKey) {
        const expanded =
          filtersActive || isDayExpanded(dayOverrides, k, todayDayKey);
        currentCollapsed = !expanded;
        const summary = totals.get(k) ?? { total: 0, count: 0 };
        out.push({
          kind: "header",
          key: `h-${k}`,
          dayKey: k,
          label: formatDayLabel(k, now),
          total: summary.total,
          count: summary.count,
          collapsed: currentCollapsed,
        });
        currentKey = k;
      }
      if (!currentCollapsed) {
        out.push({ kind: "tx", key: `t-${t.id}`, tx: t });
      }
    }
    return out;
  }, [filtered, now, dayOverrides, todayDayKey, filtersActive]);

  return { filtered, feed, filtersActive };
}
