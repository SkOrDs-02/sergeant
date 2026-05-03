/**
 * Finyk — TxListItem (React Native)
 *
 * Swipeable wrapper around `TxRow`. Mirrors the web
 * `apps/web/src/modules/finyk/components/TxListItem.tsx` composition:
 *
 *   SwipeToAction ↘
 *     TxRow (display-only row)
 *
 * Select-mode (bulk selection / checkbox overlay) from the web file is
 * not ported in this PR — mobile will ship a dedicated "selection
 * mode" screen presentation once the virtualised `Transactions`
 * screen lands in PR4.
 */

import { memo, useCallback } from "react";
import { View } from "react-native";

import { SwipeToAction } from "@/components/ui/SwipeToAction";

import { TxRow, type TxRowProps, type TxRowTx } from "./TxRow";

export interface TxListItemProps extends Omit<TxRowProps, "onPress"> {
  rowIndex?: number;
  onPressManual?: (tx: TxRowTx) => void;
  onSwipeHideTx?: (id: string) => void;
  onSwipeDeleteManual?: (tx: TxRowTx) => void;
  onSwipeUnhideTx?: (id: string) => void;
}

function TxListItemImpl({
  tx,
  rowIndex = 0,
  hidden,
  onPressManual,
  onSwipeHideTx,
  onSwipeDeleteManual,
  onSwipeUnhideTx,
  ...rowProps
}: TxListItemProps) {
  const isManual = !!tx._manual;
  const canSwipeDelete = isManual && typeof onSwipeDeleteManual === "function";
  const canSwipeHide =
    !isManual && !hidden && typeof onSwipeHideTx === "function";
  const canSwipeUnhide =
    !isManual && hidden && typeof onSwipeUnhideTx === "function";

  const onSwipeLeft = useCallback(() => {
    if (canSwipeDelete) {
      onSwipeDeleteManual?.(tx);
      return;
    }
    if (canSwipeHide) {
      onSwipeHideTx?.(tx.id);
      return;
    }
    if (canSwipeUnhide) {
      onSwipeUnhideTx?.(tx.id);
    }
  }, [
    canSwipeDelete,
    canSwipeHide,
    canSwipeUnhide,
    onSwipeDeleteManual,
    onSwipeHideTx,
    onSwipeUnhideTx,
    tx,
  ]);

  const onPress = useCallback(() => {
    if (isManual && onPressManual) {
      onPressManual(tx);
    }
  }, [isManual, onPressManual, tx]);

  const swipeLabel = canSwipeDelete
    ? "🗑 Видалити"
    : canSwipeHide
      ? "🙈 Приховати"
      : canSwipeUnhide
        ? "👁 Показати"
        : "";
  const swipeColor = canSwipeDelete
    ? "bg-danger"
    : canSwipeUnhide
      ? "bg-brand-500"
      : "bg-fg-muted";

  const hasSwipe = canSwipeDelete || canSwipeHide || canSwipeUnhide;
  const hasPress = isManual && !!onPressManual;

  return (
    <View className={rowIndex % 2 === 1 ? "bg-panelHi/40" : ""}>
      <SwipeToAction
        onSwipeLeft={hasSwipe ? onSwipeLeft : undefined}
        leftLabel={swipeLabel}
        leftColor={swipeColor}
      >
        <TxRow
          tx={tx}
          hidden={hidden}
          onPress={hasPress ? onPress : undefined}
          {...rowProps}
        />
      </SwipeToAction>
    </View>
  );
}

export const TxListItem = memo(TxListItemImpl);
