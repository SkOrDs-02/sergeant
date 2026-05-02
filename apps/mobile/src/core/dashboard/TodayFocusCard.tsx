/**
 * Mobile port of `apps/web/src/core/insights/TodayFocusCard.tsx`.
 *
 * Shape mirrors the web version: one hero card that shows the current
 * `focus` rec (primary CTA + optional dismiss). When there is no focus
 * rec the card renders nothing — the bento module rows below already
 * expose per-module quick-add affordances, so a chip fallback would
 * duplicate them and split the user's attention (ONE-HERO rule,
 * mirrored in `HubDashboard`).
 *
 * Optional `coachInsight` — короткий AI-підзаголовок (як на web), якщо
 * `useCoachInsight` вже зібрав копію.
 *   - `focus.pwaAction` → `openHubModuleWithAction` wiring. Web's
 *     `hubNav` dispatches a custom DOM event caught by each module
 *     screen; mobile uses expo-router intent params (Phase 3) so for
 *     now the CTA just navigates via `onAction`.
 */

import { Pressable, Text, View } from "react-native";

import { hapticTap, type Rec } from "@sergeant/shared";

const MODULE_ACCENT_CLASS = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-brand-500",
} as const;

const MODULE_WASH_CLASS = {
  finyk: "bg-brand-50/60 hero-gradient-finyk",
  fizruk: "bg-cyan-50/60 hero-gradient-fizruk",
  routine: "bg-coral-50/60 hero-gradient-routine",
  nutrition: "bg-lime-50/60 hero-gradient-nutrition",
  hub: "bg-cream-100 hero-gradient-brand",
} as const;

const MODULE_OPEN_CTA = {
  finyk: "Відкрити Фінік",
  fizruk: "Відкрити Фізрук",
  routine: "Відкрити Рутину",
  nutrition: "Відкрити Харчування",
  hub: "Подивитись",
} as const;

export interface TodayFocusCardProps {
  focus: Rec | null;
  onAction: (module: string, focus: Rec) => void;
  onDismiss?: (id: string) => void;
  /** Короткий AI-інсайт під рекомендацією (опційно). */
  coachInsight?: string | null;
}

/**
 * Primary hero on the mobile hub dashboard: one next-best-action
 * derived from the recommendation engine. Renders nothing when there
 * is no focus rec — the bento module rows below handle quick-add.
 */
export function TodayFocusCard({
  focus,
  onAction,
  onDismiss,
  coachInsight,
}: TodayFocusCardProps) {
  if (!focus) {
    return null;
  }

  const moduleKey = (focus.module as keyof typeof MODULE_ACCENT_CLASS) || "hub";
  const accent = MODULE_ACCENT_CLASS[moduleKey] ?? "bg-brand-500";
  const wash = MODULE_WASH_CLASS[moduleKey] ?? "bg-cream-100";
  const primaryLabel = MODULE_OPEN_CTA[moduleKey] ?? "Відкрити";

  return (
    <View
      className={`relative overflow-hidden rounded-2xl border border-cream-300 p-4 ${wash}`}
      testID={`today-focus-card-${focus.id}`}
    >
      <View
        className={`absolute bottom-4 left-0 top-4 w-1 rounded-r-full ${accent}`}
        accessibilityElementsHidden
      />

      <View className="pl-3">
        <View className="mb-1 flex-row items-center justify-between gap-3">
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional narrative eyebrow, mirrors web TodayFocusCard */}
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            Зараз
          </Text>
        </View>

        <Text className="text-base font-bold leading-snug text-fg">
          {focus.icon ? `${focus.icon} ` : ""}
          {focus.title}
        </Text>

        {focus.body ? (
          <Text className="mt-1 text-xs leading-relaxed text-fg-muted">
            {focus.body}
          </Text>
        ) : null}

        {coachInsight ? (
          <Text className="mt-2 border-l-2 border-brand-500/40 pl-2 text-xs italic leading-relaxed text-fg">
            {coachInsight}
          </Text>
        ) : null}

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={() => {
              hapticTap();
              onAction(focus.action, focus);
            }}
            className="flex-row items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 active:opacity-80"
            testID="today-focus-primary"
          >
            <Text className="text-xs font-semibold text-white">
              {primaryLabel}
            </Text>
            <Text className="text-xs font-semibold text-white">›</Text>
          </Pressable>
          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Відкласти рекомендацію"
              onPress={() => onDismiss(focus.id)}
              className="ml-auto rounded-lg px-2.5 py-1.5 active:opacity-60"
              testID="today-focus-dismiss"
            >
              <Text className="text-xs font-medium text-fg-muted">Пізніше</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
