/**
 * «Відкладено за місяць» на сторінці «Активи» з розбивкою по активах і
 * банках Monobank (спека `docs/work/specs/finyk-savings-assets.md`). На
 * Огляді та сама сума — одним рядком у місячному підсумку.
 */
import { useMemo } from "react";
import { messages } from "@shared/i18n";
import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { useKyivDayNow } from "@shared/hooks/useKyivDayNow";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { computeMonthlySaved } from "@sergeant/finyk-domain/domain/assets/savings";
import type { ManualAsset } from "../hooks/useStorage";

const t = messages.finyk.monthlySaved;

/** Межі поточного київського місяця як `YYYY-MM-DD` (`to` — виключно). */
export function kyivMonthWindow(nowMs: number): { from: string; to: string } {
  const { year, month } = getKyivDateParts(nowMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  return { from: `${year}-${pad(month)}-01`, to: `${next}-01` };
}

export function AssetsMonthlySaved({
  manualAssets,
  jars,
  transactions,
  showBalance,
}: {
  manualAssets: readonly ManualAsset[];
  jars:
    | readonly {
        monoJarId?: string | undefined;
        currencyCode?: number | undefined;
      }[]
    | null
    | undefined;
  transactions: readonly {
    accountId?: string | null;
    amount?: number | null;
    time?: number | null;
  }[];
  showBalance: boolean;
}) {
  const nowMs = useKyivDayNow();
  const saved = useMemo(() => {
    const { from, to } = kyivMonthWindow(nowMs);
    return computeMonthlySaved({
      assets: manualAssets,
      from,
      to,
      jarTransactions: transactions,
      jarAccountIds: (jars ?? [])
        .filter((j) => (j.currencyCode ?? 980) === 980)
        .flatMap((j) => (j.monoJarId ? [j.monoJarId] : [])),
    });
  }, [manualAssets, jars, transactions, nowMs]);

  if (saved.totalMinor === 0 && saved.unconvertedCount === 0) return null;
  const money = (minor: number) =>
    showBalance ? <Money amount={minor / 100} signed tone="inherit" /> : "••••";
  return (
    <Card padding="md" className="space-y-1" data-testid="finyk-monthly-saved">
      <p className="text-style-caption text-muted">{t.hint}</p>
      <p className="text-style-label text-text tabular-nums">
        {t.label} {money(saved.totalMinor)}
      </p>
      {saved.byAsset.map((row) => (
        <p
          key={row.assetId}
          className="text-style-caption text-muted tabular-nums"
        >
          {row.name} {money(row.minor)}
        </p>
      ))}
      {saved.jarsMinor !== 0 && (
        <p className="text-style-caption text-muted tabular-nums">
          {t.jars} {money(saved.jarsMinor)}
        </p>
      )}
      {saved.unconvertedCount > 0 && (
        <p className="text-style-caption text-muted">
          {t.unconverted.replace("{n}", String(saved.unconvertedCount))}
        </p>
      )}
    </Card>
  );
}
