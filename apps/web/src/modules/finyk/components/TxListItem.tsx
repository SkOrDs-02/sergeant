import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";

import { TxRow, type TxRowTx } from "./TxRow";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import type { MerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";

interface TxListItemProps {
  tx: TxRowTx;
  rowIndex: number;
  selectMode: boolean;
  selected: boolean;
  hidden: boolean;
  /** «Не враховувати у статистиці» (PR-F4) — threaded straight to `TxRow`. */
  isExcludedFromStats?: boolean | undefined;
  /** Нога скасованого платежу — threaded straight to `TxRow`. */
  isCancelled?: boolean | undefined;
  overrideCatId?: string | null | undefined;
  /** Правила мерчантів — threaded straight to `TxRow`. */
  merchantRules?: MerchantRuleIndex | undefined;
  txSplits: TxSplitsMap;
  /** User's own free-text annotation for this transaction. */
  note?: string | undefined;
  accounts: readonly MonoAccount[];
  hideAmount: boolean;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  /** Threaded straight to `TxRow` — see its docstring. */
  hasReceipt?: boolean | undefined;
  onToggleSelect: (id: string) => void;
  onSwipeHideTx?: ((id: string) => void) | undefined;
  onSwipeDeleteManual?: ((tx: TxRowTx) => void) | undefined;
  /** Canonical entry point for both manual and imported transaction details. */
  onOpenDetails?: ((tx: TxRowTx) => void) | undefined;
}

function TxListItemImpl({
  tx,
  rowIndex,
  selectMode,
  selected,
  hidden,
  isExcludedFromStats = false,
  isCancelled = false,
  overrideCatId,
  merchantRules,
  txSplits,
  note,
  accounts,
  hideAmount,
  customCategories,
  hasReceipt = false,
  onToggleSelect,
  onSwipeHideTx,
  onSwipeDeleteManual,
  onOpenDetails,
}: TxListItemProps) {
  const isManual = !!tx._manual;
  const canSwipeLeft = isManual
    ? typeof onSwipeDeleteManual === "function"
    : !hidden && typeof onSwipeHideTx === "function";

  return (
    <div
      className={cn(
        "px-1 sm:px-2 relative",
        selectMode && selected && "bg-line/40",
      )}
    >
      {selectMode && (
        <button
          type="button"
          aria-label={selected ? "Зняти вибір" : "Вибрати"}
          onClick={() => onToggleSelect(tx.id)}
          className="absolute inset-0 z-10 w-full h-full cursor-pointer"
        />
      )}
      {selectMode && (
        <span
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 z-20 w-[22px] h-[22px] rounded-[5px] border-2 flex items-center justify-center transition-colors",
            selected ? "bg-primary border-primary" : "border-muted bg-panel",
          )}
          aria-hidden
        ></span>
      )}
      <div className={cn(selectMode && "pl-8", "relative")}>
        <SwipeToAction
          disabled={selectMode}
          onSwipeLeft={
            canSwipeLeft
              ? isManual
                ? () => onSwipeDeleteManual?.(tx)
                : () => onSwipeHideTx?.(tx.id)
              : undefined
          }
          // Keep one directional destructive quick action only. Editing is
          // canonical on row tap and cannot compete with the page swipe.
          onSwipeRight={undefined}
          rightLabel={isManual ? "Видалити" : "Приховати"}
          rightColor={isManual ? "bg-danger" : "bg-warning/80"}
          // Surface the swipe-affordance peek on the first row of the list
          // for first-time users only — `SwipeToAction` reads/writes a
          // single localStorage flag (`sergeant:swipe_hint_shown`) so the
          // hint is dismissed for good after the first successful swipe
          // anywhere in the app.
          showHint={canSwipeLeft && rowIndex === 0}
          hintText={
            isManual ? "Свайпни вліво: видалити" : "Свайпни вліво: приховати"
          }
        >
          <TxRow
            tx={tx}
            onClick={onOpenDetails ? () => onOpenDetails(tx) : undefined}
            hidden={hidden}
            isExcludedFromStats={isExcludedFromStats}
            isCancelled={isCancelled}
            overrideCatId={overrideCatId}
            merchantRules={merchantRules}
            accounts={accounts}
            hideAmount={hideAmount}
            txSplits={txSplits}
            note={isManual ? undefined : note}
            customCategories={customCategories}
            hasReceipt={hasReceipt}
            divider={false}
          />
        </SwipeToAction>
      </div>
    </div>
  );
}

export const TxListItem = memo(TxListItemImpl);
