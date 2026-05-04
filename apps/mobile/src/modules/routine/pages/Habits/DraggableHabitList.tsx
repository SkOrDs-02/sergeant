/**
 * Sergeant Routine — DraggableHabitList (React Native)
 *
 * Thin wrapper around the list of active habit rows that layers a
 * long-press → drag-to-reorder interaction on top of the existing
 * `HabitListItem` API. The pre-existing ↑ / ↓ buttons inside
 * `HabitListItem` are kept as-is and act as the keyboard / screen-reader
 * accessibility fallback.
 *
 * Gesture contract:
 *  - `Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS)` — a short
 *    tap on the row never captures the gesture, so the per-row
 *    Pressables (↑ / ↓ / Змінити / В архів / Видалити) keep working.
 *  - On activation the row lifts (`scale` / `opacity` / `zIndex`) and
 *    tracks the finger via a Reanimated shared value — the UI thread
 *    never hops back to React during the drag.
 *  - On release we compute the target index from the vertical
 *    translation + each row's measured height (via `onLayout`) and
 *    commit the new order through `onReorder`. Sibling re-slots are
 *    animated by Reanimated's `LinearTransition`, fulfilling the
 *    "layout animation" requirement without a dedicated RN
 *    `LayoutAnimation` call.
 *  - Haptic feedback fires on drag start (`hapticTap`) and on a
 *    committed drop (`hapticSuccess`) via `@sergeant/shared`, so we
 *    pick up the `expo-haptics` adapter registered in `app/_layout`.
 *  - `AccessibilityInfo.isReduceMotionEnabled()` collapses the lift /
 *    snap-back animations to zero-duration per WCAG 2.3.3, mirroring
 *    the pattern already established in `SwipeToAction` / `Sheet`.
 *
 * Only active (non-archived) habits are ever reordered — archived
 * habits render outside this list and use their own non-draggable
 * layout.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { Habit } from "@sergeant/routine-domain";
import { hapticSuccess, hapticTap } from "@sergeant/shared";

import { HabitListItem } from "./HabitListItem";

/** Fallback row height (in px) used until a row's `onLayout` fires. */
const FALLBACK_ROW_HEIGHT = 92;
/**
 * Long-press dwell time before the pan gesture activates. Matches the
 * Apple Human Interface Guidelines sensible default and keeps ordinary
 * taps on the per-row buttons unambiguous.
 */
const LONG_PRESS_MS = 300;
/** Duration of the "snap back" animation after a committed drop. */
const SNAP_DURATION_MS = 160;
/** Scale factor applied to the dragged row so it visually "lifts". */
const LIFT_SCALE = 1.03;

export interface DraggableHabitListProps {
  /** Source order of active habits (already filtered and sorted). */
  habits: Habit[];
  /** Called with the new full ordered list of active habit ids on drop. */
  onReorder: (orderedActiveIds: string[]) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onStartEdit: (habit: Habit) => void;
  onArchive: (id: string) => void;
  onRequestDelete: (id: string) => void;
  /** Id of the habit currently being edited (highlighted). */
  editingId: string | null;
  /** Id of the habit awaiting two-tap delete confirmation, if any. */
  pendingDeleteId: string | null;
  /** Optional testID root — children derive stable sub-ids. */
  testID?: string;
}

/**
 * Compute the drop-target index given a `fromIndex`, the current
 * `translationY` of the dragged row, and a map of measured row heights.
 *
 * The heuristic walks siblings either down (positive translation) or up
 * (negative translation), consuming their half-heights until we run out
 * of translation. This mirrors the behaviour of Apple's UITableView
 * reorder control without needing a separate `react-native-draggable-
 * flatlist` dependency — see PR body for the "no new runtime deps"
 * constraint.
 */
export function computeDropIndex(
  fromIndex: number,
  translationY: number,
  rowHeights: ReadonlyArray<number | undefined>,
): number {
  const total = rowHeights.length;
  if (fromIndex < 0 || fromIndex >= total) return fromIndex;
  if (!Number.isFinite(translationY) || translationY === 0) return fromIndex;

  let idx = fromIndex;
  if (translationY > 0) {
    let acc = 0;
    for (let i = fromIndex + 1; i < total; i++) {
      const h = rowHeights[i] ?? FALLBACK_ROW_HEIGHT;
      if (translationY > acc + h / 2) {
        idx = i;
        acc += h;
      } else {
        break;
      }
    }
  } else {
    let acc = 0;
    for (let i = fromIndex - 1; i >= 0; i--) {
      const h = rowHeights[i] ?? FALLBACK_ROW_HEIGHT;
      if (-translationY > acc + h / 2) {
        idx = i;
        acc += h;
      } else {
        break;
      }
    }
  }
  return idx;
}

/** Immutable array-move helper; keeps `computeDropIndex` callers tiny. */
export function moveInArray<T>(
  list: ReadonlyArray<T>,
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex === toIndex) return [...list];
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return next;
  next.splice(toIndex, 0, moved);
  return next;
}

interface DraggableHabitRowProps {
  habit: Habit;
  index: number;
  editing: boolean;
  pending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartEdit: () => void;
  onArchive: () => void;
  onRequestDelete: () => void;
  isDragging: boolean;
  onDragStart: (index: number) => void;
  onDragEnd: (index: number, translationY: number) => void;
  onLayoutHeight: (index: number, height: number) => void;
  reduceMotionRef: React.MutableRefObject<boolean>;
  testID?: string;
}

const DraggableHabitRow = memo(function DraggableHabitRow({
  habit,
  index,
  editing,
  onMoveUp,
  onMoveDown,
  onStartEdit,
  onArchive,
  onRequestDelete,
  isDragging,
  onDragStart,
  onDragEnd,
  onLayoutHeight,
  reduceMotionRef,
  testID,
}: DraggableHabitRowProps) {
  const translationY = useSharedValue(0);
  const lifted = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      "worklet";
      translationY.value = 0;
      lifted.value = 1;
      runOnJS(onDragStart)(index);
    })
    .onUpdate((event) => {
      "worklet";
      translationY.value = event.translationY;
    })
    .onEnd((event) => {
      "worklet";
      // Prefer the native event's translationY (always populated on
      // END) and fall back to the tracked shared value if the platform
      // ever delivers an END with no translation payload.
      const finalTranslation =
        event.translationY !== 0 ? event.translationY : translationY.value;
      const duration = reduceMotionRef.current ? 0 : SNAP_DURATION_MS;
      translationY.value = withTiming(0, { duration });
      lifted.value = withTiming(0, { duration });
      runOnJS(onDragEnd)(index, finalTranslation);
    })
    .onFinalize(() => {
      "worklet";
      // Safety net for cancellations (e.g. parent ScrollView stealing
      // the gesture) — ensure the visual state is always reset.
      if (translationY.value !== 0) {
        const duration = reduceMotionRef.current ? 0 : SNAP_DURATION_MS;
        translationY.value = withTiming(0, { duration });
        lifted.value = withTiming(0, { duration });
      }
    })
    .withTestId(`${testID ?? "habit-row"}-drag`);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = 1 + lifted.value * (LIFT_SCALE - 1);
    const opacity = 1 - lifted.value * 0.05;
    return {
      transform: [{ translateY: translationY.value }, { scale }],
      opacity,
      zIndex: lifted.value > 0 ? 10 : 0,
      elevation: lifted.value > 0 ? 6 : 0,
      shadowOpacity: lifted.value * 0.18,
      shadowRadius: lifted.value * 8,
      shadowOffset: { width: 0, height: lifted.value * 4 },
      shadowColor: "#000",
    };
  });

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayoutHeight(index, e.nativeEvent.layout.height);
    },
    [index, onLayoutHeight],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        layout={LinearTransition.duration(SNAP_DURATION_MS)}
        style={animatedStyle}
        onLayout={onLayout}
        accessibilityHint="Утримай і потягни, щоб змінити порядок"
        testID={
          testID ? `${testID}${isDragging ? "-dragging" : ""}` : undefined
        }
      >
        <HabitListItem
          habit={habit}
          editing={editing}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onStartEdit={onStartEdit}
          onArchive={onArchive}
          onRequestDelete={onRequestDelete}
          testID={testID}
        />
      </Animated.View>
    </GestureDetector>
  );
});

export function DraggableHabitList({
  habits,
  onReorder,
  onMoveUp,
  onMoveDown,
  onStartEdit,
  onArchive,
  onRequestDelete,
  editingId,
  pendingDeleteId,
  testID,
}: DraggableHabitListProps) {
  // JS-thread mirror of the current order, kept in a ref so the pan
  // callbacks below don't close over a stale snapshot between renders.
  const orderRef = useRef<string[]>(habits.map((h) => h.id));
  orderRef.current = habits.map((h) => h.id);

  const heightsRef = useRef<number[]>([]);
  if (heightsRef.current.length !== habits.length) {
    heightsRef.current = habits.map(
      (_, i) => heightsRef.current[i] ?? FALLBACK_ROW_HEIGHT,
    );
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!mounted) return;
      reduceMotionRef.current = enabled;
      setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
        setReduceMotion(enabled);
      },
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const handleDragStart = useCallback((index: number) => {
    const id = orderRef.current[index];
    if (id) {
      setDraggingId(id);
      hapticTap();
    }
  }, []);

  const handleDragEnd = useCallback(
    (fromIndex: number, translationY: number) => {
      const currentOrder = orderRef.current;
      if (fromIndex < 0 || fromIndex >= currentOrder.length) {
        setDraggingId(null);
        return;
      }
      const toIndex = computeDropIndex(
        fromIndex,
        translationY,
        heightsRef.current,
      );
      if (toIndex !== fromIndex) {
        const next = moveInArray(currentOrder, fromIndex, toIndex);
        onReorder(next);
        hapticSuccess();
      }
      setDraggingId(null);
    },
    [onReorder],
  );

  const handleLayoutHeight = useCallback((index: number, height: number) => {
    heightsRef.current[index] = height;
  }, []);

  // `reduceMotion` is read once on mount to feed `reduceMotionRef`;
  // subscribing to it in state keeps the component re-rendering when
  // the setting flips so the `LinearTransition` layout animation can
  // be disabled (see `layoutTransition` below).
  const layoutTransition = reduceMotion
    ? LinearTransition.duration(0)
    : LinearTransition.duration(SNAP_DURATION_MS);

  return (
    <View testID={testID}>
      {habits.map((h, i) => {
        const pending = pendingDeleteId === h.id;
        const rowTestID = testID
          ? `${testID}-row-${h.id}${pending ? "-pending" : ""}`
          : undefined;
        return (
          <DraggableHabitRow
            key={h.id}
            habit={h}
            index={i}
            editing={editingId === h.id}
            pending={pending}
            onMoveUp={() => onMoveUp(h.id)}
            onMoveDown={() => onMoveDown(h.id)}
            onStartEdit={() => onStartEdit(h)}
            onArchive={() => onArchive(h.id)}
            onRequestDelete={() => onRequestDelete(h.id)}
            isDragging={draggingId === h.id}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onLayoutHeight={handleLayoutHeight}
            reduceMotionRef={reduceMotionRef}
            testID={rowTestID}
          />
        );
      })}
      {/* `layout` prop opts the list into Reanimated's layout-animation
      pipeline; the per-item `LinearTransition` picks up the duration
      above for smooth sibling re-slots on drop. */}
      <Animated.View
        layout={layoutTransition}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

export default DraggableHabitList;
