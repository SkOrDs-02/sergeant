/**
 * Lazy-loaded finyk/expense report card for the mobile Hub-Reports
 * surface. Mirrors `apps/web/src/core/hub/ExpensesCard.tsx`: reads the
 * `finyk_tx_cache` MMKV shard plus the hidden-tx / transfer-category
 * shards and aggregates spending per day independently.
 *
 * Amounts in the cache are kopiykas (minor units). They are converted to
 * hryvnia before aggregation so the rendered total matches the web card,
 * which delegates to the shared finyk aggregation that reports whole
 * hryvnia. Display uses `toLocaleString("uk-UA")` on the hryvnia value.
 */

import { useMemo } from "react";
import { Text, View } from "react-native";

import { safeReadLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  aggregateSpending,
  datesInRange,
  getPeriodRange,
  type Period,
  type SpendingInputs,
} from "./hubReports.aggregation";
import { ReportBarChart, ReportDelta } from "./ReportChart";
import { ReportCardShell } from "./ReportCardShell";

interface RawTx {
  id: string;
  amount: number;
  time: number;
}

function readTxInputs(): SpendingInputs {
  const raw = safeReadLS<{ txs?: unknown[] } | unknown[] | null>(
    STORAGE_KEYS.FINYK_TX_CACHE,
    null,
  );
  const rawList: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { txs?: unknown[] } | null)?.txs)
      ? (raw as { txs: unknown[] }).txs
      : [];

  // Cache amounts are kopiykas — convert to hryvnia for parity with the
  // web spending card's reported total.
  const txList = (rawList as RawTx[])
    .filter((tx): tx is RawTx => typeof tx?.id === "string")
    .map((tx) => ({
      id: tx.id,
      amount: typeof tx.amount === "number" ? tx.amount / 100 : 0,
      time: typeof tx.time === "number" ? tx.time : 0,
    }));

  const hidden = safeReadLS<string[]>(STORAGE_KEYS.FINYK_HIDDEN_TXS, []) ?? [];
  const txCategories =
    safeReadLS<Record<string, string>>(STORAGE_KEYS.FINYK_TX_CATS, {}) ?? {};
  const transferIds = Object.entries(txCategories)
    .filter(([, v]) => v === "internal_transfer")
    .map(([k]) => k);

  return {
    txList,
    excludedTxIds: new Set<string>([...hidden, ...transferIds]),
  };
}

export interface ExpensesCardProps {
  period: Period;
  offset: number;
}

export default function ExpensesCard({ period, offset }: ExpensesCardProps) {
  const { cur, prev, dates } = useMemo(() => {
    const inputs = readTxInputs();
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateSpending(inputs, curDates),
      prev: aggregateSpending(inputs, prevDates),
      dates: curDates,
    };
  }, [period, offset]);

  const formattedCurrent = Math.round(cur.total).toLocaleString("uk-UA");
  const formattedPrev = Math.round(prev.total).toLocaleString("uk-UA");

  return (
    <ReportCardShell
      moduleKey="spending"
      emoji="💳"
      title="Фінік (витрати)"
      collapsedStat={
        <>
          <Text className="text-base font-bold text-text">
            {formattedCurrent} ₴
          </Text>
          <ReportDelta
            cur={cur.total}
            prev={prev.total}
            higherIsBetter={false}
          />
        </>
      }
    >
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-extrabold text-text">
          {formattedCurrent} ₴
        </Text>
        <ReportDelta cur={cur.total} prev={prev.total} higherIsBetter={false} />
      </View>
      <Text className="text-xs text-muted">Минулий: {formattedPrev} ₴</Text>
      <ReportBarChart
        key={`${period}-${offset}`}
        data={cur.daily}
        dates={dates}
        colorClass="bg-chart-finyk"
        unit=" ₴"
      />
    </ReportCardShell>
  );
}
