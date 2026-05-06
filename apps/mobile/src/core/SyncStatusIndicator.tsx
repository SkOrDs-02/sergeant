/**
 * Sergeant Hub-core — SyncStatusIndicator (React Native)
 *
 * Mobile port of the web `SyncStatusIndicator` pill. Thin UI-consumer
 * of `useSyncStatus()` from `apps/mobile/src/sync/hook/useSyncStatus`.
 *
 * @see apps/web/src/core/SyncStatusIndicator.jsx — canonical source of truth
 * @see apps/web/src/modules/finyk/components/SyncStatusBadge.tsx — similar finyk-scoped badge
 *
 * States (derived from the hook + props):
 *  - `offline`  — `isOnline === false`
 *                 → bg-warning pill with "Офлайн — N змін у черзі"
 *                 (N = max(queuedCount, dirtyCount); hidden when 0).
 *  - `syncing`  — online + pending work (queuedCount > 0 || dirtyCount > 0)
 *                 → pulse dot + "Синхронізація…" (+ pending count).
 *  - `error`    — `error` prop provided
 *                 → bg-danger pill + optional `Retry` ghost button.
 *  - `idle`     — online + nothing pending
 *                 → tiny "Синк: on" pill, or nothing when
 *                 `variant="silent-when-idle"`.
 *
 * Error state lives behind a prop rather than the hook because
 * `useSyncStatus()` deliberately stays read-only (dirtyCount /
 * queuedCount / isOnline). A parent with a future explicit retry
 * command can feed its message and handler into `error` / `onRetry`.
 *
 * Accessibility:
 *  - Respects `AccessibilityInfo.isReduceMotionEnabled()` for the
 *    syncing pulse, mirroring `Skeleton.tsx`.
 *  - Sets `accessibilityRole="status"` + `accessibilityLiveRegion`
 *    on Android so VoiceOver / TalkBack announce state transitions.
 *
 * Non-goals (kept out of this PR by design):
 *  - Not mounted into `_layout.tsx` or any screen — wiring is a
 *    separate Phase-2 task once Dashboard / HubSettings land.
 *  - No `lastSyncedAt` formatting (the mobile hook does not expose
 *    it; a timestamp row can land later with a parallel hook
 *    extension).
 */

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { pluralUa } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { useSyncStatus } from "@/sync/hook/useSyncStatus";

export type SyncStatusIndicatorVariant = "default" | "silent-when-idle";

export interface SyncStatusIndicatorProps {
  /**
   * `silent-when-idle` — collapse to `null` while the sync state is
   * idle (nothing pending, online, no error). Use this in dense
   * surfaces (Dashboard hero, HubSettings header) where a static
   * "Синк: on" pill would be noise.
   */
  variant?: SyncStatusIndicatorVariant;
  /**
   * Latest sync-error message. When truthy the indicator switches
   * to the danger state regardless of connectivity.
   */
  error?: string | null;
  /**
   * Retry handler. When provided *and* `error` is truthy, renders a
   * ghost `Button` next to the error message.
   */
  onRetry?: () => void;
  className?: string;
}

type DerivedStatus = "idle" | "syncing" | "offline" | "error";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Reduced-motion-aware pulse. Mirrors `Skeleton.tsx` so the two
 * components feel part of the same motion family.
 */
function usePulse(active: boolean): Animated.AnimatedInterpolation<number> | 1 {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Platforms that don't expose the API default to motion-on.
      });

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!active || reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress, reduceMotion]);

  if (!active || reduceMotion) return 1;
  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.4],
  });
}

function pendingLabel(count: number): string {
  return `${count} ${pluralUa(count, {
    one: "зміна",
    few: "зміни",
    many: "змін",
  })} у черзі`;
}

export function SyncStatusIndicator({
  variant = "default",
  error = null,
  onRetry,
  className,
}: SyncStatusIndicatorProps) {
  const { dirtyCount, queuedCount, isOnline } = useSyncStatus();
  const pending = Math.max(dirtyCount, queuedCount);

  const status: DerivedStatus = error
    ? "error"
    : !isOnline
      ? "offline"
      : pending > 0
        ? "syncing"
        : "idle";

  const dotOpacity = usePulse(status === "syncing");

  if (status === "idle" && variant === "silent-when-idle") {
    return null;
  }

  if (status === "idle") {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel="Синхронізація активна"
        className={cx(
          "flex-row items-center gap-2 self-start",
          "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1",
          className,
        )}
      >
        <View className="h-2 w-2 rounded-full bg-emerald-500" />
        <Text className="text-[11px] font-medium text-emerald-800">
          Синк: on
        </Text>
      </View>
    );
  }

  if (status === "syncing") {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          pending > 0
            ? `Синхронізація, ${pendingLabel(pending)}`
            : "Синхронізація"
        }
        className={cx(
          "flex-row items-center gap-2 self-start",
          "rounded-full border border-cream-300 bg-cream-50 px-3 py-1",
          className,
        )}
      >
        <Animated.View
          style={{ opacity: dotOpacity }}
          className="h-2 w-2 rounded-full bg-amber-500"
        />
        <Text className="text-xs font-medium text-fg">Синхронізація…</Text>
        {pending > 0 ? (
          <Text className="text-xs text-fg-muted">{pendingLabel(pending)}</Text>
        ) : null}
      </View>
    );
  }

  if (status === "offline") {
    return (
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          pending > 0 ? `Офлайн, ${pendingLabel(pending)}` : "Офлайн"
        }
        className={cx(
          "flex-row items-center gap-2 self-start",
          "rounded-full border border-amber-300 bg-amber-50 px-3 py-1",
          className,
        )}
      >
        <View className="h-2 w-2 rounded-full bg-amber-500" />
        <Text className="text-xs font-semibold text-amber-900">
          {pending > 0 ? `Офлайн — ${pendingLabel(pending)}` : "Офлайн"}
        </Text>
      </View>
    );
  }

  // status === "error"
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={
        error ? `Помилка синхронізації: ${error}` : "Помилка синхронізації"
      }
      className={cx(
        "flex-row items-center gap-2 self-start",
        "rounded-full border border-red-300 bg-red-50 px-3 py-1",
        className,
      )}
    >
      <View className="h-2 w-2 rounded-full bg-red-500" />
      <Text className="text-xs font-semibold text-red-900" numberOfLines={1}>
        Помилка синхронізації
      </Text>
      {onRetry ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={onRetry}
          accessibilityLabel="Повторити синхронізацію"
        >
          Повторити
        </Button>
      ) : null}
    </View>
  );
}
