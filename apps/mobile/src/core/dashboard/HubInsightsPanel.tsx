/**
 * Sergeant Hub — HubInsightsPanel (mobile).
 *
 * Collapsible list of secondary coach-style recommendations rendered
 * below the Status row stack on the dashboard. Port of the web
 * component at `apps/web/src/core/hub/HubInsightsPanel.tsx` — same item
 * shape, same dismissal contract, same visual hierarchy (accent bar
 * → title → body → inline `Відкрити` link).
 *
 * Platform differences vs. web:
 *  - RN has no CSS grid / `grid-template-rows` animation trick we use
 *    on web for the expand / collapse. Instead we drive an
 *    `Animated.Value` 0→1 and interpolate both height (`maxHeight`)
 *    and opacity, with duration collapsed to 0 when Reduce Motion is
 *    on (WCAG 2.3.3).
 *  - `Pressable` replaces `<button>` for both the toggle header and
 *    the per-rec action / dismiss.
 *  - Uses the shared `Card` / `Button` primitives from
 *    `apps/mobile/src/components/ui` to stay on-brand without
 *    hand-rolling a button.
 *
 * Items fed in come from `useDashboardFocus().rest` — that hook is
 * part of the parallel PR-2 and is intentionally not imported here.
 * HubDashboard passes an empty array until PR-2 lands, which causes
 * this component to render nothing (see `total === 0` guard).
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";

import type { DashboardModuleId } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

/** Module id (or the generic hub bucket) used for accent colouring. */
export type InsightModuleId = DashboardModuleId | "hub";

export interface InsightItem {
  readonly id: string;
  readonly title: string;
  /** Optional module id for accent colouring. Falls back to `"hub"`. */
  readonly module?: InsightModuleId;
  /** Optional longer body copy rendered under the title. */
  readonly body?: string;
  /** Leading emoji / glyph rendered next to the title. */
  readonly icon?: string;
  /**
   * Optional action module id. When present the row renders an
   * inline "Відкрити" affordance that invokes `onOpenModule(action)`.
   */
  readonly action?: DashboardModuleId;
}

export interface HubInsightsPanelProps {
  items: readonly InsightItem[];
  onOpenModule: (module: DashboardModuleId) => void;
  onDismiss?: (id: string) => void;
  /**
   * Defaults to `false` — the panel starts collapsed to keep the
   * initial dashboard scroll light. The user taps the header to
   * expand.
   */
  defaultOpen?: boolean;
  testID?: string;
}

const MODULE_ACCENT: Record<InsightModuleId, string> = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-brand-500",
};

/**
 * Height budget for the expanded panel. RN's `Animated.View` needs a
 * concrete pixel ceiling to interpolate into — this is a generous
 * upper bound that still beats "animate to auto" as a tradeoff (web
 * uses a `grid-rows` trick that has no RN analogue). Rows overflow
 * the budget as a plain scrollable list below (`ScrollView` is the
 * caller's job; this panel stays inside the Hub's main scroll view).
 */
const MAX_EXPANDED_HEIGHT = 4000;
/** Panel expand/collapse duration (ms). */
const TOGGLE_DURATION_MS = 200;

/** Single rec row. Memo-ised to keep large lists cheap. */
const RecRow = memo(function RecRow({
  rec,
  onAction,
  onDismiss,
  testID,
}: {
  rec: InsightItem;
  onAction: (module: DashboardModuleId) => void;
  onDismiss?: (id: string) => void;
  testID?: string;
}) {
  const accent = MODULE_ACCENT[rec.module ?? "hub"] ?? "bg-brand-500";
  return (
    <View
      className="relative flex-row gap-3 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2.5"
      testID={testID}
    >
      <View
        className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full ${accent}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View className="flex-1 pl-1">
        <Text className="text-sm font-semibold text-fg">
          {rec.icon ? (
            <Text accessibilityElementsHidden>{`${rec.icon} `}</Text>
          ) : null}
          {rec.title}
        </Text>
        {rec.body ? (
          <Text className="mt-0.5 text-xs leading-relaxed text-fg-muted">
            {rec.body}
          </Text>
        ) : null}
        {rec.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Відкрити ${rec.action}`}
            onPress={() => onAction(rec.action as DashboardModuleId)}
            className="mt-1.5 flex-row items-center gap-1 self-start active:opacity-70"
            testID={testID ? `${testID}-action` : undefined}
          >
            <Text className="text-xs font-semibold text-fg">Відкрити</Text>
            <Text className="text-xs text-fg">›</Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onPress={() => onDismiss(rec.id)}
          accessibilityLabel="Прибрати"
          className="shrink-0 -mr-1 -mt-1"
          testID={testID ? `${testID}-dismiss` : undefined}
        >
          <Text className="text-sm text-fg-muted">✕</Text>
        </Button>
      ) : null}
    </View>
  );
});

export function HubInsightsPanel({
  items,
  onOpenModule,
  onDismiss,
  defaultOpen = false,
  testID,
}: HubInsightsPanelProps) {
  const total = items.length;
  const [open, setOpen] = useState(defaultOpen);
  // AI-CONTEXT: lazy `useState` (not `useRef(...).current`) — the
  // Animated.Value is created once on mount and its identity never changes,
  // which keeps render free of ref reads (react-hooks/refs) without touching
  // animation behavior.
  const [progress] = useState(() => new Animated.Value(defaultOpen ? 1 : 0));
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduceMotionRef.current ? 0 : TOGGLE_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start();
    // Stop the animation on unmount so Animated's internal setTimeout
    // doesn't fire after a host test renderer has been torn down
    // (avoids "Jest environment torn down" log spam).
    return () => animation.stop();
  }, [open, progress]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  const animatedHeight = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, MAX_EXPANDED_HEIGHT],
      }),
    [progress],
  );

  if (total === 0) return null;

  const baseTestID = testID ?? "hub-insights-panel";

  return (
    <View className="gap-2" testID={baseTestID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Інсайти, ${total}`}
        onPress={toggle}
        className="flex-row items-center justify-between gap-2 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 active:opacity-80"
        testID={`${baseTestID}-toggle`}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-semibold text-fg">Інсайти</Text>
          <View className="min-w-[20px] items-center justify-center rounded-full bg-cream-200 px-1.5 py-0.5">
            <Text className="text-[10px] font-bold text-fg-muted">{total}</Text>
          </View>
        </View>
        <Text
          className="text-sm text-fg-muted"
          style={{
            transform: [{ rotate: open ? "90deg" : "0deg" }],
          }}
        >
          ›
        </Text>
      </Pressable>

      <Animated.View
        style={{
          maxHeight: animatedHeight,
          opacity: progress,
          overflow: "hidden",
        }}
        // Hide the collapsed subtree from accessibility so a screen
        // reader doesn't surface offscreen insights.
        importantForAccessibility={open ? "yes" : "no-hide-descendants"}
        accessibilityElementsHidden={!open}
      >
        <View className="gap-2 pt-1">
          {items.map((rec) => (
            <RecRow
              key={rec.id}
              rec={rec}
              onAction={onOpenModule}
              onDismiss={onDismiss}
              testID={`${baseTestID}-rec-${rec.id}`}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
