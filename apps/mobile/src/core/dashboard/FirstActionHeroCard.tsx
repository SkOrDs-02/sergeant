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
 * Parity with the web version:
 *   - `PresetStep` (mobile port of web `PresetSheet`). Tapping the
 *     primary CTA or an alt-module chip opens the module's preset sheet
 *     inline instead of routing directly. A `routine` preset writes a
 *     real habit and dismisses the hero; `finyk` presets stage a
 *     prefill and route into the add-expense sheet; `nutrition` /
 *     `fizruk` show only a fallback CTA. Navigation flows back out
 *     through `onAction(module, action)`.
 *   - Analytics (`trackEvent`). Wired via `onShown` / `onPicked` /
 *     `onDismiss` callbacks. The shared mobile sink lives at
 *     `apps/mobile/src/lib/analytics.ts`; `HubDashboard.tsx` is the
 *     canonical caller and fires `onboarding_first_action_shown` /
 *     `onboarding_first_action_picked` against PostHog (S0.4 mobile
 *     parity). Tests still rely on the prop callbacks directly so
 *     they don't depend on the sink.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  clearFirstActionPending,
  getOnboardingGoals,
  getVibePicks,
  hapticTap,
  rankFirstActionCandidates,
  type DashboardModuleId,
  type FirstActionPrimaryReason,
  type FirstActionRanking,
} from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { mobileKVStore as mmkvStore } from "@/lib/storage";
import {
  PresetStep,
  getPresetModule,
  type PresetAction,
} from "@/core/onboarding/PresetStep";
import type { ModuleId } from "@/core/onboarding/presetApply";

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
    desc: "~5 секунд. І серія днів стартує одразу.",
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

/**
 * Goal-aware primary + chip ordering + analytics reason for the mobile
 * FTUX hero (PR-11). Delegates to `rankFirstActionCandidates` so web
 * and mobile resolve the primary, the alt-module chip-row order, and
 * the SLO `primary_reason` faceting field identically. Nutrition is
 * already filtered out of `picks` upstream (Phase 7 on mobile), so
 * the helper will never promote nutrition here even if a
 * `nutritionGoal` happens to be persisted.
 */
function rankPrimary(picks: readonly DashboardModuleId[]): FirstActionRanking {
  return rankFirstActionCandidates(picks, getOnboardingGoals(mmkvStore));
}

export interface FirstActionHeroCardProps {
  /** Called when a preset (or the fallback CTA) needs to route into a
   *  module's quick-add flow. The optional `action` distinguishes the
   *  add-flow to deep-link into (e.g. `add_expense`); the callee maps it
   *  to an Expo-Router push. Routine presets persist inline and never
   *  call this. */
  onAction: (module: DashboardModuleId, action?: PresetAction) => void;
  /** Called when the user dismisses the card. After dismissal the
   *  FTUX pending flag is cleared, so the hero stays hidden until a
   *  fresh install / store wipe. */
  onDismiss?: () => void;
  /** Optional analytics hook: fires once on first render with the
   *  resolved primary module + selection reason (PR-11) so PostHog can
   *  break the SLO down by `single-goal` / `multi-goal-vibe` / etc. */
  onShown?: (info: {
    primary: DashboardModuleId;
    picks: DashboardModuleId[];
    primaryReason: FirstActionPrimaryReason;
  }) => void;
  /** Optional analytics hook: fires when the user taps a CTA. The
   *  `via` field carries the same vocabulary as the web counterpart
   *  (`apps/web/src/core/onboarding/FirstActionSheet.tsx` after S2.3):
   *  `"primary"` for the headline CTA, `"chip"` for the always-visible
   *  alt-module chip row. PostHog dashboards reading the canonical
   *  `onboarding_first_action_picked` event compute switch-rate as
   *  `count(via="chip") / count(*)`.
   *
   *  `primaryReason` (PR-11) carries the same `FirstActionPrimaryReason`
   *  faceting field as `onShown` so dashboards can correlate hero
   *  selection mode with first-entry rate.
   */
  onPicked?: (info: {
    module: DashboardModuleId;
    via: "primary" | "chip";
    primaryReason: FirstActionPrimaryReason;
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

  const ranking = rankPrimary(picks);
  const primaryId = ranking.primary;
  const primary = ACTIONS[primaryId];
  const others = useMemo(
    () => ranking.others.filter((id) => ACTIONS[id]),
    [ranking.others],
  );

  // Module id whose PresetStep is currently open, or `null` if closed.
  // Keeping the hero mounted while the sheet is open lets the user
  // dismiss the sheet and try another module without losing FTUX
  // context. Mirrors web `FirstActionSheet`'s `activePresetId` state.
  const [activePresetId, setActivePresetId] = useState<ModuleId | null>(null);

  useEffect(() => {
    onShown?.({
      primary: primaryId,
      picks,
      primaryReason: ranking.reason,
    });
    // Report-on-mount only — treat like a mount-level analytics event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the module's preset sheet instead of routing directly. Mirrors
  // web `FirstActionSheet.openPreset`: fire `onboarding_first_action_*`
  // with the same `via` vocabulary, then surface the sheet. Navigation
  // into the module is deferred to a preset / fallback tap inside the
  // sheet (`handlePresetNavigate`).
  const openPreset = (id: DashboardModuleId, via: "primary" | "chip") => {
    if (!getPresetModule(id)) return;
    hapticTap();
    onPicked?.({ module: id, via, primaryReason: ranking.reason });
    setActivePresetId(id);
  };

  const handlePrimary = () => openPreset(primaryId, "primary");

  const handleAltPick = (id: DashboardModuleId) => openPreset(id, "chip");

  const handlePresetNavigate = (module: ModuleId, action: PresetAction) => {
    onAction(module, action);
  };

  const handlePresetPick = ({ persisted }: { persisted: boolean }) => {
    // Only a routine preset truly persists. For finyk/fizruk/nutrition
    // we merely navigate into the module add-sheet; the real save
    // happens when the user taps «Зберегти» there. Clearing the FTUX
    // flag eagerly would hide the hero forever even if the user
    // cancelled the add-sheet, so we leave it pending — the hero
    // returns on the next dashboard mount. Mirrors web
    // `FirstActionSheet.handlePresetPick`.
    setActivePresetId(null);
    if (persisted) {
      clearFirstActionPending(mmkvStore);
      onDismiss?.();
    }
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
    <>
      <Card
        variant="default"
        padding="md"
        radius="lg"
        testID="first-action-hero"
        className={gradientClass}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <SectionHeading size="2xs" weight="semibold" variant="muted">
              Почнемо
            </SectionHeading>
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
        </View>

        {others.length > 0 ? (
          <View
            accessibilityRole="toolbar"
            accessibilityLabel="Інший модуль"
            className="mt-3 flex-row flex-wrap items-center gap-2"
          >
            <Text className="text-xs text-fg-muted">Або:</Text>
            {others.map((id) => {
              const spec = ACTIONS[id];
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={spec.title}
                  onPress={() => handleAltPick(id)}
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
      <PresetStep
        open={activePresetId != null}
        moduleId={activePresetId}
        onClose={() => setActivePresetId(null)}
        onNavigate={handlePresetNavigate}
        onPick={handlePresetPick}
      />
    </>
  );
}
