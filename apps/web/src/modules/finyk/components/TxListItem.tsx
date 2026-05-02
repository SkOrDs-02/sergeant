import { memo } from "react";
import { cn } from "@shared/lib/cn";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { Icon } from "@shared/components/ui/Icon";
import { TxRow } from "./TxRow";

function TxListItemImpl({
  tx,
  rowIndex,
  selectMode,
  selected,
  hidden,
  overrideCatId,
  txSplits,
  accounts,
  hideAmount,
  customCategories,
  onToggleSelect,
  onSwipeHideTx,
  onSwipeDeleteManual,
  onEditManual,
  onHideTx,
  onCatChange,
  onSplitChange,
}) {
  const isManual = !!tx._manual;
  const canSwipeLeft = isManual
    ? typeof onSwipeDeleteManual === "function"
    : !hidden && typeof onSwipeHideTx === "function";

  return (
    <div
      className={cn(
        "px-1 sm:px-2 relative",
        rowIndex % 2 === 1 && "bg-panelHi/25",
        selectMode && selected && "bg-primary/8",
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
            "absolute left-3 top-1/2 -translate-y-1/2 z-20 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
            selected ? "bg-primary border-primary" : "border-muted bg-panel",
          )}
          aria-hidden
        >
          {selected && (
            <Icon
              name="check"
              size={10}
              strokeWidth={3}
              className="text-white"
            />
          )}
        </span>
      )}
      <div className={cn(selectMode && "pl-8", "relative")}>
        <SwipeToAction
          disabled={selectMode}
          onSwipeLeft={
            canSwipeLeft
              ? isManual
                ? () => onSwipeDeleteManual(tx)
                : () => onSwipeHideTx(tx.id)
              : undefined
          }
          onSwipeRight={undefined}
          rightLabel="🙈 Приховати"
          rightColor="bg-warning/80"
          // Surface the swipe-affordance peek on the first row of the list
          // for first-time users only — `SwipeToAction` reads/writes a
          // single localStorage flag (`sergeant:swipe_hint_shown`) so the
          // hint is dismissed for good after the first successful swipe
          // anywhere in the app.
          showHint={canSwipeLeft && rowIndex === 0}
          hintText={
            isManual ? "Свайпни вліво — видалити" : "Свайпни вліво — приховати"
          }
        >
          <TxRow
            tx={tx}
            onClick={
              isManual && typeof onEditManual === "function"
                ? () => onEditManual(tx._manualId)
                : undefined
            }
            onHide={isManual ? undefined : onHideTx}
            hidden={hidden}
            overrideCatId={overrideCatId}
            onCatChange={isManual ? undefined : onCatChange}
            accounts={accounts}
            hideAmount={hideAmount}
            txSplits={txSplits}
            onSplitChange={isManual ? undefined : onSplitChange}
            customCategories={customCategories}
          />
        </SwipeToAction>
      </div>
    </div>
  );
}

export const TxListItem = memo(TxListItemImpl);
