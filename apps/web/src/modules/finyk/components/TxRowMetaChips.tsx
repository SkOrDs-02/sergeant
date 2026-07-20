/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Secondary meta chips under the TxRow description (AI, transfer, account,
 * source, date). Extracted for Hard Rule #18 max-lines.
 */
import { INTERNAL_TRANSFER_ID } from "../constants";
import { fmtDate } from "../utils";
import { Badge } from "@shared/components/ui/Badge";
import { Icon } from "@shared/components/ui/Icon";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxRowTx } from "./txRowHelpers";

interface TxRowMetaChipsProps {
  tx: TxRowTx;
  catId: string;
  catName: string;
  isIncome: boolean;
  overrideCatId?: string | null | undefined;
  existingSplitsCount: number;
  isCreditCard: boolean;
  account: MonoAccount | undefined;
  accountName: string | null;
}

export function TxRowMetaChips({
  tx,
  catId,
  catName,
  isIncome,
  overrideCatId,
  existingSplitsCount,
  isCreditCard,
  account,
  accountName,
}: TxRowMetaChipsProps) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
      <span className="text-xs text-subtle">{catName}</span>
      {/* 6.4: AI-source tag — surfaces auto-categorized expense rows
          so users can tell which categorizations are inferred (MCC +
          description match) vs explicit (user override, manual entry,
          splits, transfers, fallback "other"). Sparkles icon-only
          keeps the row uncluttered — category label is right next to it.
          Skipped on:
            – manual expenses (`_manual`): user typed the category
            – overridden rows: explicit user choice, shows "змін." instead
            – internal transfers: special routing, not categorization
            – income rows: handled by separate income flow above
            – "other" fallback: no real inference happened
      */}
      {!tx._manual &&
        !overrideCatId &&
        !isIncome &&
        catId !== INTERNAL_TRANSFER_ID &&
        catId !== "other" && (
          <Badge
            variant="finyk"
            tone="soft"
            size="xs"
            className="shrink-0 inline-flex items-center gap-1 rounded-full"
            title="Категорію визначив AI на основі опису + MCC"
          >
            <Icon name="sparkles" size={10} aria-hidden />
            <span>AI</span>
          </Badge>
        )}
      {catId === INTERNAL_TRANSFER_ID && (
        <span className="text-style-caption bg-muted/15 text-muted px-1.5 py-0.5 rounded-full font-semibold">
          не в статистиці
        </span>
      )}
      {overrideCatId && catId !== INTERNAL_TRANSFER_ID && (
        <span className="text-style-caption bg-text/8 text-muted px-1.5 py-0.5 rounded-full font-semibold">
          змін.
        </span>
      )}
      {existingSplitsCount > 0 && (
        <span className="text-style-caption bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
          ⅔ спліт
        </span>
      )}
      {isCreditCard && (
        <span className="text-style-caption bg-danger/8 text-danger-strong dark:text-danger px-1.5 py-0.5 rounded-full font-semibold">
          <Icon name="credit-card" size={12} aria-hidden /> {accountName}
        </span>
      )}
      {!isCreditCard && account && (
        <span className="text-style-caption bg-panelHi text-muted border border-line px-1.5 py-0.5 rounded-full font-medium">
          {accountName}
        </span>
      )}
      {tx._source === "privatbank" && (
        <span className="text-style-caption bg-success/10 text-success-strong dark:text-success px-1.5 py-0.5 rounded-full font-semibold shrink-0">
          П24
        </span>
      )}
      <span className="text-xs text-subtle">· {fmtDate(tx.time ?? 0)}</span>
    </div>
  );
}
