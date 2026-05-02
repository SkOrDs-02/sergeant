/**
 * Sergeant Hub — DraggableDashboard (mobile)
 *
 * Thin wrapper that layers long-press drag-to-reorder onto the list
 * of module `StatusRow`s. The interaction model, gesture timings and
 * pure drop-index heuristic are deliberately reused from
 * `DraggableHabitList` (PR #475) so the dashboard and the habit list
 * feel identical to the user and share the same accessibility
 * contract (↑/↓ fallbacks live in Settings → Дашборд).
 *
 *   - `Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS)` — short
 *     taps still fall through to the row's `onPress` and deep-link
 *     into the module tab.
 *   - Row heights are measured via `onLayout` (rows are ~same height
 *     but we avoid hard-coding the value).
 *   - `computeDropIndex` walks sibling half-heights, matching the
 *     behaviour in `DraggableHabitList`.
 *   - `AccessibilityInfo.isReduceMotionEnabled()` collapses lift /
 *     snap-back durations per WCAG 2.3.3.
 *   - Haptics: `hapticTap` on drag-start, `hapticSuccess` on a
 *     committed drop, via `@sergeant/shared`.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated as RNAnimated,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { GripVertical, X } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  type DashboardModuleId,
  type ModulePreview,
  hapticSuccess,
  hapticTap,
} from "@sergeant/shared";

import { safeReadLS, safeWriteLS } from "@/lib/storage";

import { StatusRow } from "./StatusRow";

export type DashboardModulePreviews = Partial<
  Record<DashboardModuleId, ModulePreview | null>
>;

/** Storage key for tracking if the user has seen the drag reorder coach mark */
const COACH_MARK_SEEN_KEY = "dashboard_drag_coach_seen";

/**
 * DragReorderCoachMark — one-time tooltip explaining drag-to-reorder.
 * Dismisses automatically after first drag or manual dismiss.
 */
function DragReorderCoachMark({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(-8)).current;

  useEffect(() => {
    if (visible) {
      RNAnimated.parallel([
        RNAnimated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        RNAnimated.spring(translateY, {
          toValue: 0,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      RNAnimated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity, translateY]);

  if (!visible) return null;

  return (
    <RNAnimated.View
      style={{ opacity, transform: [{ translateY }] }}
      className="mb-3 px-4 py-3 bg-brand rounded-2xl flex-row items-center gap-3"
      accessibilityRole="alert"
      accessibilityLabel="Утримуй модуль, щоб змінити порядок"
    >
      <View className="w-8 h-8 rounded-xl bg-white/20 items-center justify-center">
        <GripVertical size={18} color="#fff" strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-white">
          Утримуй, щоб перетягнути
        </Text>
        <Text className="text-xs text-white/80 mt-0.5">
          Змінюй порядок модулів на свій смак
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Закрити підказку"
        className="w-7 h-7 rounded-full bg-white/20 items-center justify-center active:bg-white/30"
      >
        <X size={14} color="#fff" strokeWidth={2.5} />
      </Pressable>
    </RNAnimated.View>
  );
}

/** Fallback row height (px) used until `onLayout` fires for a row. */
const FALLBACK_ROW_HEIGHT = 72;
/** Long-press dwell before a drag can begin. */
const LONG_PRESS_MS = 300;
/** Snap-back animation duration after a drop. */
const SNAP_DURATION_MS = 160;
/** Scale factor applied to the lifted row. */
const LIFT_SCALE = 1.03;

/**
 * Translation-aware drop-index arithmetic. Same shape as the
 * `DraggableHabitList` helper so the logic stays unit-testable in
 * isolation.
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

export interface DraggableDashboardProps {
  /** Visible module ids in current order. Hidden modules are handled upstream. */
  modules: readonly DashboardModuleId[];
  /** Called on successful drop with the from/to indices within `modules`. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Tap handler — fires only for a short tap (drag short-circuits it). */
  onOpenModule: (id: DashboardModuleId) => void;
  /**
   * Optional per-module preview map. Missing entries / `null` values
   * render the row without a preview section — callers can omit this
   * prop entirely while the quick-stats writers roll out module by
   * module.
   */
  previews?: DashboardModulePreviews;
  /**
   * Module ids that should render in the muted/greyed-out "inactive"
   * state. Driven by the user's onboarding picks; rows not in this
   * set render normally.
   */
  inactiveModules?: ReadonlySet<DashboardModuleId>;
  testID?: string;
}

interface DraggableRowProps {
  id: DashboardModuleId;
  index: number;
  onOpenModule: (id: DashboardModuleId) => void;
  onDragStart: (index: number) => void;
  onDragEnd: (index: number, translationY: number) => void;
  onLayoutHeight: (index: number, height: number) => void;
  reduceMotionRef: React.MutableRefObject<boolean>;
  preview?: ModulePreview | null;
  inactive?: boolean;
  testID?: string;
}

const DraggableRow = memo(function DraggableRow({
  id,
  index,
  onOpenModule,
  onDragStart,
  onDragEnd,
  onLayoutHeight,
  reduceMotionRef,
  preview,
  inactive,
  testID,
}: DraggableRowProps) {
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
      const finalTranslation =
        event.translationY !== 0 ? event.translationY : translationY.value;
      const duration = reduceMotionRef.current ? 0 : SNAP_DURATION_MS;
      translationY.value = withTiming(0, { duration });
      lifted.value = withTiming(0, { duration });
      runOnJS(onDragEnd)(index, finalTranslation);
    })
    .onFinalize(() => {
      "worklet";
      if (translationY.value !== 0) {
        const duration = reduceMotionRef.current ? 0 : SNAP_DURATION_MS;
        translationY.value = withTiming(0, { duration });
        lifted.value = withTiming(0, { duration });
      }
    });

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
      <Reanimated.View
        layout={LinearTransition.duration(SNAP_DURATION_MS)}
        style={animatedStyle}
        onLayout={onLayout}
      >
        <StatusRow
          id={id}
          onPress={onOpenModule}
          preview={preview}
          inactive={inactive}
          testID={testID ? `${testID}-${id}` : undefined}
        />
      </Reanimated.View>
    </GestureDetector>
  );
});

export function DraggableDashboard({
  modules,
  onReorder,
  onOpenModule,
  previews,
  inactiveModules,
  testID,
}: DraggableDashboardProps) {
  const orderRef = useRef<DashboardModuleId[]>([...modules]);
  orderRef.current = [...modules];

  const heightsRef = useRef<number[]>([]);
  if (heightsRef.current.length !== modules.length) {
    heightsRef.current = modules.map(
      (_, i) => heightsRef.current[i] ?? FALLBACK_ROW_HEIGHT,
    );
  }

  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  // Coach mark state
  const [showCoachMark, setShowCoachMark] = useState(() => {
    const seen = safeReadLS<boolean>(COACH_MARK_SEEN_KEY, false);
    return !seen;
  });

  const dismissCoachMark = useCallback(() => {
    setShowCoachMark(false);
    safeWriteLS(COACH_MARK_SEEN_KEY, true);
  }, []);

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

  const handleDragStart = useCallback(
    (_index: number) => {
      hapticTap();
      // Dismiss coach mark on first drag
      if (showCoachMark) {
        dismissCoachMark();
      }
    },
    [showCoachMark, dismissCoachMark],
  );

  const handleDragEnd = useCallback(
    (fromIndex: number, translationY: number) => {
      const toIndex = computeDropIndex(
        fromIndex,
        translationY,
        heightsRef.current,
      );
      if (toIndex === fromIndex) return;
      onReorder(fromIndex, toIndex);
      hapticSuccess();
    },
    [onReorder],
  );

  const handleLayoutHeight = useCallback((index: number, height: number) => {
    heightsRef.current[index] = height;
  }, []);

  // `reduceMotion` is read inside the worklet via the ref — the state
  // setter here only exists so re-mounts after OS-level changes pick
  // up the new value immediately; the value is otherwise unused at
  // render time.
  void reduceMotion;

  return (
    <View testID={testID ?? "dashboard-module-list"}>
      <DragReorderCoachMark
        visible={showCoachMark && modules.length > 1}
        onDismiss={dismissCoachMark}
      />
      <View className="gap-2">
        {modules.map((id, index) => (
          <DraggableRow
            key={id}
            id={id}
            index={index}
            onOpenModule={onOpenModule}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onLayoutHeight={handleLayoutHeight}
            reduceMotionRef={reduceMotionRef}
            preview={previews?.[id] ?? null}
            inactive={inactiveModules?.has(id) ?? false}
            testID={testID ?? "dashboard-module-row"}
          />
        ))}
      </View>
    </View>
  );
}
