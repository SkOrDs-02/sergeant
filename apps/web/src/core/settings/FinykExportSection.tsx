/**
 * Налаштування → Фінік → «Експорт»: уся історія операцій одним CSV.
 * Кнопка в Операціях лишається «експортом видимого»; повний файл тут
 * окремою явною дією (finyk.md § Журнал рішень 2026-10-20).
 */
import { useMemo } from "react";
import type { ManualExpenseEntry } from "@sergeant/finyk-domain/domain/transactions";
import { withMerchantRuleOverrides } from "@sergeant/finyk-domain/lib/merchantRuleOverrides";
import type { MerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { failedCopy } from "@shared/i18n/failedCopy";
import { messages } from "@shared/i18n/uk";
import { useFinykMirrorTransactions } from "@finyk/hooks/useFinykStatTransactions";
import {
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
} from "@finyk/utils";
import {
  collectAllHistory,
  exportAllHistoryCsv,
} from "@finyk/pages/transactions/exportTransactionsCsv";
import { SettingsSubGroup } from "./SettingsPrimitives";

const t = messages.finyk.exportAll;

export function FinykExportSection({
  manualExpenses,
  hiddenTxIds,
  txCategories,
  merchantRuleIndex,
  customCategories,
}: {
  manualExpenses: readonly ManualExpenseEntry[];
  hiddenTxIds: readonly string[];
  txCategories: Record<string, string | undefined>;
  merchantRuleIndex: MerchantRuleIndex | undefined;
  customCategories: readonly { id: string; label: string }[];
}) {
  const toast = useToast();
  const mirrorTx = useFinykMirrorTransactions();
  const all = useMemo(
    () => collectAllHistory(mirrorTx, manualExpenses, hiddenTxIds),
    [mirrorTx, manualExpenses, hiddenTxIds],
  );

  const run = async (): Promise<void> => {
    const effective = withMerchantRuleOverrides(
      all,
      txCategories,
      merchantRuleIndex,
      customCategories,
    );
    try {
      const { count, result } = await exportAllHistoryCsv(all, (tx) =>
        tx.amount > 0
          ? getIncomeCategoryForTransaction(tx, effective[tx.id])
          : getExpenseCategoryForTransaction(
              tx,
              effective[tx.id],
              customCategories,
            ),
      );
      if (result === "empty") toast.info(t.empty);
      else if (result !== "cancelled")
        toast.success(t.success.replace("{count}", String(count)));
    } catch {
      toast.error(failedCopy(t.failWhat), undefined, {
        label: "Повторити",
        onClick: () => void run(),
      });
    }
  };

  return (
    <SettingsSubGroup variant="bounded" title={t.title}>
      <p className="text-style-caption text-muted">{t.description}</p>
      <Button
        type="button"
        variant="outline"
        tone="finyk"
        className="min-h-[44px]"
        onClick={() => void run()}
      >
        {t.button}
      </Button>
    </SettingsSubGroup>
  );
}
