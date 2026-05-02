/**
 * Mobile port of the inline `FirstActionHeroCard` exported by
 * `apps/web/src/core/onboarding/FirstActionSheet.tsx`.
 *
 * Renders an opinionated "one tap to your first real entry" hero on
 * top of the hub dashboard. The primary CTA is derived from the
 * user's vibe picks (splash screen selection). «Інший модуль»
 * expands a row of secondary chips; «Пізніше» dismisses the card for
 * this install.
 *
 * Deferred from the web version:
 *   - `PresetSheet`. On web each module opens a preset sheet that
 *     writes a real storage entry directly — the shortest FTUX. The
 *     mobile ports of `finyk`/`fizruk`/`routine` preset sheets are
 *     not ready yet, so mobile currently routes into the module via
 *     `onAction` and lets the user type a first entry there. Once
 *     `PresetSheet` lands we can remove the routing fallback and
 *     trigger the sheet inline, keeping parity with web.
 *   - Analytics (`trackEvent`). Mobile doesn't have a sink wired yet
 *     (see migration plan Phase 6). Callers can inject one via
 *     `onShown` / `onPicked` if they want to observe the lifecycle.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  clearFirstActionPending,
  getVibePicks,
  hapticTap,
  type DashboardModuleId,
  type KVStore,
} from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  safeReadLS as mmkvGet,
  safeRemoveLS as mmkvRemove,
  safeWriteLS as mmkvWrite,
} from "@/lib/storage";

// MMKV-backed `KVStore` that delegates through the thin helpers in
// `@/lib/storage`. `vibePicks` only needs string I/O, so the shared
// helpers' JSON wrappers are sidestepped by storing strings directly.
const mmkvStore: KVStore = {
  getString(key) {
    try {
      // `safeReadLS` JSON-parses; but `vibePicks` writes raw strings
      // (`"1"`, `"2025-01-15"`, comma/JSON payloads). Read as a
      // permissive `unknown` and coerce back to string.
      const raw = mmkvGet<unknown>(key, null);
      if (raw === null || raw === undefined) return null;
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      return null;
    }
  },
  setString(key, value) {
    try {
      mmkvWrite(key, value);
    } catch {
      /* noop */
    }
  },
  remove(key) {
    try {
      mmkvRemove(key);
    } catch {
      /* noop */
    }
  },
};

interface ActionSpec {
  title: string;
  desc: string;
  accentChip: string;
  accentText: string;
  shortLabel: string;
}

const ACTIONS: Record<DashboardModuleId, ActionSpec> = {
  routine: {
    title: "Створи першу звичку",
    desc: "~5 секунд. Стрік почнеться сьогодні.",
    accentChip: "bg-coral-50 border border-coral-300/60",
    accentText: "text-coral-700",
    shortLabel: "Звичка",
  },
  finyk: {
    title: "Додай першу витрату",
    desc: "~5 секунд, будь-яка сума.",
    accentChip: "bg-brand-50 border border-brand-200/60",
    accentText: "text-brand-700",
    shortLabel: "Витрата",
  },
  nutrition: {
    title: "Запиши перший прийом їжі",
    desc: "Калорії порахую я.",
    accentChip: "bg-lime-50 border border-lime-200/60",
    accentText: "text-lime-800",
    shortLabel: "Їжа",
  },
  fizruk: {
    title: "Увімкни розминку",
    desc: "10 хв, таймер сам.",
    accentChip: "bg-teal-50 border border-teal-200/60",
    accentText: "text-teal-700",
    shortLabel: "Розминка",
  },
};

// Same priority as web — routine first because habit creation is the
// lowest-friction path to a real entry and the highest emotional
// payoff. Nutrition is Phase 7 on mobile so it sits behind finyk.
const PRIORITY: DashboardModuleId[] = ["routine", "finyk", "fizruk"];

function pickPrimary(picks: readonly DashboardModuleId[]): DashboardModuleId {
  for (const id of PRIORITY) {
    if (picks.includes(id)) return id;
  }
  return "routine";
}

export interface FirstActionHeroCardProps {
  /** Called when the user taps a module CTA. The callee is
   *  responsible for routing into the module's quick-add flow. */
  onAction: (module: DashboardModuleId) => void;
  /** Called when the user dismisses the card. After dismissal the
   *  FTUX pending flag is cleared, so the hero stays hidden until a
   *  fresh install / store wipe. */
  onDismiss?: () => void;
  /** Optional analytics hook: fires once on first render with the
   *  resolved primary module. */
  onShown?: (info: {
    primary: DashboardModuleId;
    picks: DashboardModuleId[];
  }) => void;
  /** Optional analytics hook: fires when the user taps a CTA. */
  onPicked?: (info: {
    module: DashboardModuleId;
    via: "primary" | "expand";
  }) => void;
}

export function FirstActionHeroCard({
  onAction,
  onDismiss,
  onShown,
  onPicked,
}: FirstActionHeroCardProps) {
  // Nutrition is hidden until Phase 7 on mobile. Strip it from the
  // user's picks before deriving the primary so we never prompt the
  // user to «Запиши перший прийом їжі» while the module is gated.
  const picks = useMemo<DashboardModuleId[]>(() => {
    const raw = getVibePicks(mmkvStore).filter(
      (id): id is DashboardModuleId => id !== "nutrition",
    );
    return raw.length > 0
      ? raw
      : (["routine", "finyk", "fizruk"] as DashboardModuleId[]);
  }, []);

  const primaryId = pickPrimary(picks);
  const primary = ACTIONS[primaryId];
  const others = useMemo(
    () => picks.filter((id) => id !== primaryId && ACTIONS[id]),
    [picks, primaryId],
  );

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    onShown?.({ primary: primaryId, picks });
    // Report-on-mount only — treat like a mount-level analytics event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrimary = () => {
    hapticTap();
    onPicked?.({ module: primaryId, via: "primary" });
    onAction(primaryId);
  };

  const handleExpandedPick = (id: DashboardModuleId) => {
    hapticTap();
    onPicked?.({ module: id, via: "expand" });
    onAction(id);
  };

  const handleDismiss = () => {
    clearFirstActionPending(mmkvStore);
    onDismiss?.();
  };

  const gradientClass =
    primaryId === "finyk"
      ? "hero-gradient-finyk"
      : primaryId === "fizruk"
        ? "hero-gradient-fizruk"
        : primaryId === "routine"
          ? "hero-gradient-routine"
          : "hero-gradient-brand";

  return (
    <Card
      variant="default"
      padding="md"
      radius="lg"
      testID="first-action-hero"
      className={gradientClass}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional FTUX eyebrow, mirrors web FirstActionHeroCard */}
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            Почнемо
          </Text>
          <Text className="mt-1 text-base font-bold leading-snug text-fg">
            {primary.title}
          </Text>
          <Text className="mt-1 text-xs leading-relaxed text-fg-muted">
            {primary.desc}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Відкласти"
          onPress={handleDismiss}
          className="rounded-lg px-2 py-1 active:opacity-60"
          testID="first-action-dismiss"
        >
          <Text className="text-xs font-medium text-fg-subtle">Пізніше</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onPress={handlePrimary}
          testID="first-action-primary"
        >
          Почати
        </Button>
        {others.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              expanded ? "Приховати інші модулі" : "Показати інші модулі"
            }
            onPress={() => setExpanded((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 active:opacity-60"
            testID="first-action-expand"
          >
            <Text className="text-xs font-medium text-fg-muted">
              {expanded ? "Приховати" : "Інший модуль"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {expanded && others.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {others.map((id) => {
            const spec = ACTIONS[id];
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={spec.title}
                onPress={() => handleExpandedPick(id)}
                className={`flex-row items-center rounded-full px-3 py-1.5 active:opacity-80 ${spec.accentChip}`}
                testID={`first-action-alt-${id}`}
              >
                <Text className={`text-xs font-semibold ${spec.accentText}`}>
                  {spec.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
