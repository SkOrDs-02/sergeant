/**
 * Mobile port of `apps/web/src/core/hub/ValueProgressBar.tsx` — the
 * pre-first-entry «value-promise» bar (FTUX S3.3a + S3.3b).
 *
 * Closes the S3.3 mobile parity gap explicitly tracked in
 * `docs/launch/product-os/ftux-sprint-plan.md` (line 174):
 *
 *   > Mobile parity для `ValueProgressBar` (S3.3) ще не зроблена —
 *   > окрема історія, відкладена як cross-cutting cleanup нижче.
 *
 * The bar list is computed by `buildValueProgressBars` from
 * `@sergeant/shared` so this component only owns the RN/NativeWind
 * presentation; copy and ordering are 100% in lockstep with web.
 *
 * Like the web version, this component is intentionally
 * presentational:
 *   - It renders `null` when no goal applies to any active module.
 *   - It does not gate on `hasFirstRealEntry` — the parent
 *     `HubDashboard` already drops the bar after the first real
 *     entry, mirroring the web hub's render path.
 *   - Goals come in as a prop; storage I/O lives at the call site.
 */

import { Text, View } from "react-native";

import { buildValueProgressBars, type OnboardingGoals } from "@sergeant/shared";

export interface ValueProgressBarProps {
  /**
   * Module ids the user has activated (e.g. via `getActiveModules`).
   * A bar renders only when its module is in this list AND has a
   * non-null goal. Empty list → no bars render.
   */
  activeModules: readonly string[];
  /** Goals payload from `getOnboardingGoals(mobileKVStore)`. */
  goals: OnboardingGoals;
}

export function ValueProgressBar({
  activeModules,
  goals,
}: ValueProgressBarProps) {
  const bars = buildValueProgressBars({ activeModules, goals });
  if (bars.length === 0) return null;

  return (
    <View
      className="flex flex-col gap-2"
      testID="value-progress-bars"
      accessibilityLabel="Прогрес до твоїх цілей"
    >
      {bars.map((bar) => (
        <View
          key={bar.testId}
          testID={bar.testId}
          className="flex-row items-center gap-3 px-1"
          accessibilityRole="progressbar"
          accessibilityValue={{ now: bar.percent, min: 0, max: 100 }}
          accessibilityLabel={`${bar.label} — ${bar.current}`}
        >
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
            <View
              style={{ width: `${bar.percent}%` }}
              className="h-full rounded-full bg-brand-500"
            />
          </View>
          <View className="flex-row items-center">
            <Text className="text-xs font-medium text-fg" numberOfLines={1}>
              {bar.label}
            </Text>
            <Text className="mx-1.5 text-xs text-fg-subtle">·</Text>
            <Text className="text-xs text-fg-muted" numberOfLines={1}>
              {bar.current}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
