/**
 * Analytics — Finyk module analytics screen (mobile port).
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/Analytics.tsx`
 * (~416 LOC). The screen is a pure view over the selected month's
 * transactions, built on top of the same
 * `@sergeant/finyk-domain/domain/selectors` helpers the web page
 * uses — numbers match web verbatim.
 *
 * Scope of this PR (Phase 4 / PR 6 per `docs/engineering/mobile/react-native-migration.md`):
 *  - Month navigation (‹ / › with "no future months" guard).
 *  - Summary card (spent / income / balance) via `getMonthlySummary`.
 *  - Comparison card (month-over-month) via `getTrendComparison`.
 *  - Category donut (top 5 + Інше) via `selectCategoryDistribution-
 *    FromIndex` and a `react-native-svg` path renderer that mirrors
 *    the web `CategoryPieChart` SVG geometry 1:1.
 *  - Top merchants via `getTopMerchants`.
 *
 * Deferred to follow-up PRs (flagged in the PR body):
 *  - Live `fetchMonth` Monobank statement loading — the web page keeps
 *    a per-month history cache to support browsing historical months
 *    before the MMKV-backed tx slice lands on mobile. We ship the
 *    pure view here and wire `mono.fetchMonth` / MMKV history once
 *    those primitives exist on mobile (tracked in the Transactions /
 *    Budgets PRs).
 *  - `ANALYTICS_OPENED` analytics beacon — mobile telemetry layer
 *    lands in Phase 12 (Monitoring + Analytics) so the matching
 *    event will be emitted through Sentry breadcrumbs there.
 */
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  computeCategorySpendIndex,
  getMonthlySummary,
  getTopMerchants,
  getTrendComparison,
  selectCategoryDistributionFromIndex,
  type Transaction,
} from "@sergeant/finyk-domain/domain";

import { Card } from "../../../../components/ui/Card";

import { CategoryDonut } from "./CategoryDonut";
import { ComparisonCard } from "./ComparisonCard";
import { MerchantList } from "./MerchantList";
import { MonthNav } from "./MonthNav";
import { SummaryCard } from "./SummaryCard";
import { useFinykAnalyticsData } from "./useFinykAnalyticsData";
import type { FinykAnalyticsData } from "./types";

export interface AnalyticsProps {
  /**
   * Optional dependency-injected data override — handy for jest tests
   * and storybook fixtures. Production code should leave this unset
   * so `useFinykAnalyticsData()` runs.
   */
  data?: FinykAnalyticsData;
  /** `Date.now()` seam for deterministic jest tests. */
  now?: Date;
  /** Hook for parent navigators (currently unused, kept for parity). */
  onNavigate?: (route: "transactions") => void;
  testID?: string;
}

interface TimeScopedTx extends Transaction {
  time: number;
}

// Same month predicate the domain's `buildMonthPredicate` uses (kept
// inline because the helper is not exported from the domain package).
function inMonth(tx: Transaction, year: number, month1: number): boolean {
  const rawTime = (tx as TimeScopedTx).time;
  if (typeof rawTime !== "number") return false;
  const ts = rawTime > 1e10 ? rawTime : rawTime * 1000;
  const d = new Date(ts);
  return d.getFullYear() === year && d.getMonth() + 1 === month1;
}

function prevMonth(
  year: number,
  month1: number,
): { year: number; month: number } {
  if (month1 === 1) return { year: year - 1, month: 12 };
  return { year, month: month1 - 1 };
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Card variant="default" radius="lg" padding="lg">
      <Text className="text-xs font-medium text-fg-muted mb-3">{title}</Text>
      {children}
    </Card>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 items-center">
      <Text className="text-sm text-fg-muted text-center">{message}</Text>
    </View>
  );
}

export function Analytics({ data, now, testID }: AnalyticsProps) {
  const hookData = useFinykAnalyticsData();
  const resolved = data ?? hookData;

  const today = now ?? new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);

  const handleMonthChange = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
  }, []);

  // Pre-filtered tx lists for the current + previous month. Month
  // predicates are cheap but running them once lets every selector
  // below reuse the filtered list without re-scanning the full tx
  // history each call.
  const currTx = useMemo(
    () => resolved.realTx.filter((tx) => inMonth(tx, year, month)),
    [resolved.realTx, year, month],
  );

  const prev = useMemo(() => prevMonth(year, month), [year, month]);
  const prevTx = useMemo(
    () => resolved.realTx.filter((tx) => inMonth(tx, prev.year, prev.month)),
    [resolved.realTx, prev.year, prev.month],
  );

  const excludedTxIds = resolved.excludedTxIds;
  const txSplits = resolved.txSplits;
  const txCategories = resolved.txCategories;
  const customCategories = useMemo(
    () => Array.from(resolved.customCategories),
    [resolved.customCategories],
  );

  const summary = useMemo(
    () => getMonthlySummary(currTx, { excludedTxIds, txSplits }),
    [currTx, excludedTxIds, txSplits],
  );

  const categoryIndex = useMemo(
    () =>
      computeCategorySpendIndex(currTx, {
        excludedTxIds,
        txCategories,
        txSplits,
        customCategories,
      }),
    [currTx, excludedTxIds, txCategories, txSplits, customCategories],
  );

  const distribution = useMemo(
    () => selectCategoryDistributionFromIndex(categoryIndex, customCategories),
    [categoryIndex, customCategories],
  );

  const topMerchants = useMemo(
    () => getTopMerchants(currTx, { excludedTxIds, txSplits }),
    [currTx, excludedTxIds, txSplits],
  );

  const comparison = useMemo(() => {
    const c = getTrendComparison(currTx, prevTx, { excludedTxIds, txSplits });
    if (
      c.currentSpent === 0 &&
      c.prevSpent === 0 &&
      c.currentIncome === 0 &&
      c.prevIncome === 0
    ) {
      return null;
    }
    return c;
  }, [currTx, prevTx, excludedTxIds, txSplits]);

  const loading = resolved.loadingTx && currTx.length === 0;

  return (
    <ScrollView
      className="flex-1 bg-cream-50"
      contentContainerClassName="px-4 pt-4 pb-8 gap-4"
      testID={testID ?? "finyk-analytics"}
    >
      <MonthNav
        year={year}
        month={month}
        onChange={handleMonthChange}
        now={today}
      />

      <Section title="Підсумок місяця">
        <SummaryCard summary={summary} loading={loading} />
      </Section>

      {comparison ? (
        <Section title="Порівняння з попереднім місяцем">
          <ComparisonCard comparison={comparison} />
        </Section>
      ) : null}

      <Section title="Категорії">
        {distribution.length === 0 ? (
          <EmptyRow message="Операцій за цей місяць не знайдено" />
        ) : (
          <CategoryDonut data={distribution} />
        )}
      </Section>

      <Section title="Топ мерчанти">
        {topMerchants.length === 0 ? (
          <EmptyRow message="Операцій ще немає" />
        ) : (
          <MerchantList merchants={topMerchants} />
        )}
      </Section>
    </ScrollView>
  );
}

export default Analytics;
