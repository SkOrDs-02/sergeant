/**
 * Last validated: 2026-07-20
 * Status: Active
 */
import { memo, useMemo } from "react";
import { fmtAmt, getCategory, getIncomeCategory } from "../utils";
import { CURRENCY } from "../constants";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/ui/cn";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import {
  CATEGORY_ICON_MAP,
  getAccountShortName,
  type TxRowTx,
} from "./txRowHelpers";
import { TxRowMetaChips } from "./TxRowMetaChips";
import { MaskedAmount } from "@shared/components/ui/MaskedAmount";

export type { TxRowTx };

interface TxRowProps {
  tx: TxRowTx;
  onClick?: ((() => void) | null) | undefined;
  highlighted?: boolean | undefined;
  hidden?: boolean | undefined;
  overrideCatId?: string | null | undefined;
  /** User's own free-text annotation for this transaction. */
  note?: string | undefined;
  accounts?: readonly MonoAccount[] | undefined;
  hideAmount?: boolean | undefined;
  txSplits?: TxSplitsMap | undefined;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  /**
   * Draw the built-in bottom hairline. Defaults to `true` for the Assets
   * pickers that stack rows directly. The transaction list (#13) sets this
   * to `false` and paints its own inset dividers at the group-card level so
   * the last row doesn't collide with the card's rounded bottom edge.
   */
  divider?: boolean | undefined;
}

function TxRowImpl({
  tx,
  onClick,
  highlighted,
  hidden,
  overrideCatId,
  note,
  accounts,
  hideAmount = false,
  txSplits,
  customCategories = [],
  divider = true,
}: TxRowProps) {
  const isIncome = tx.amount > 0;
  const cat = isIncome
    ? getIncomeCategory(tx.description ?? "", overrideCatId)
    : getCategory(
        tx.description ?? "",
        tx.mcc ?? 0,
        overrideCatId,
        customCategories as readonly unknown[],
      );
  const catName = isIncome
    ? cat.label
    : cat.label.slice(cat.label.indexOf(" ") + 1);

  const account: MonoAccount | undefined = accounts?.find(
    (a) => a.id === tx._accountId,
  );
  const isCreditCard = (account?.creditLimit ?? 0) > 0;
  const accountName = getAccountShortName(account);

  // useMemo — стабілізуємо масив сплітів, щоб `openSplitEditor` (useCallback
  // нижче) не перестворювався, коли `txSplits` — той самий об'єкт.
  const existingSplits = useMemo(
    () => txSplits?.[tx.id] ?? [],
    [txSplits, tx.id],
  );
  // Resolve the icon name for the category pill (Phase 6.1).
  const pillIconName: IconName = CATEGORY_ICON_MAP[cat.id] ?? "tag";

  const mainRowInner = (
    <>
      {highlighted ? (
        <span className="text-success shrink-0">
          <Icon name="check-circle" size={22} title="Вибрана транзакція" />
        </span>
      ) : (
        // 28px tinted circle — decorative, non-interactive (aria-hidden).
        // bg-finyk/10 gives a soft teal wash; text-finyk-strong
        // ensures ≥4.5:1 contrast on the bg-panel surface in light mode.
        // dark:bg-finyk/15 lifts the wash slightly for dark-surface parity.
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 inline-flex items-center justify-center rounded-full",
            "w-7 h-7",
            "bg-finyk/10 dark:bg-finyk/15",
            "text-finyk-strong dark:text-finyk",
          )}
        >
          <Icon name={pillIconName} size={16} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "text-style-label text-text truncate",
            hidden && "line-through",
          )}
        >
          {tx.description || "Транзакція"}
        </div>
        <TxRowMetaChips
          tx={tx}
          catId={cat.id}
          catName={catName}
          isIncome={isIncome}
          overrideCatId={overrideCatId}
          existingSplitsCount={existingSplits.length}
          isCreditCard={isCreditCard}
          account={account}
          accountName={accountName}
          note={note}
        />
      </div>
    </>
  );

  return (
    <div
      className={cn(
        divider && "border-b border-line last:border-0",
        highlighted && "bg-primary/5 rounded-xl border-0 my-0.5",
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          "flex items-center justify-between py-3",
          highlighted && "px-2",
          hidden && "opacity-35",
        )}
      >
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 flex-1 min-w-0 cursor-pointer text-left",
              "border-0 bg-transparent p-0 font-inherit",
            )}
          >
            {mainRowInner}
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {mainRowInner}
          </div>
        )}

        <div className="shrink-0 ml-2 text-right">
          <div
            className={cn(
              "text-style-label tabular-nums",
              isIncome ? "text-success-strong dark:text-success" : "text-text",
            )}
          >
            <MaskedAmount masked={hideAmount}>
              {fmtAmt(tx.amount, CURRENCY.UAH)}
            </MaskedAmount>
          </div>
          {tx.currencyCode !== CURRENCY.UAH && tx.operationAmount && (
            <div className="text-style-caption text-muted tabular-nums">
              <MaskedAmount masked={hideAmount}>
                {fmtAmt(tx.operationAmount, tx.currencyCode)}
              </MaskedAmount>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const TxRow = memo(TxRowImpl);
