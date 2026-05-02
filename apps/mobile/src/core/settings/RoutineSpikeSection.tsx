/**
 * Routine SPIKE — settings entry-point (mobile / React Native).
 *
 * Mobile mirror of `apps/web/src/core/settings/RoutineSpikeSection.tsx`.
 *
 * The section is always rendered in `HubSettingsPage`'s «Акаунт»
 * group, but the actual `RoutineSpikeDevPanel` is mounted only when
 * `feature.routine.sqlite_v2` is on. This keeps the SPIKE library and
 * the `expo-sqlite` runtime path inert when the flag is off — the
 * same «zero-cost when disabled» property the web side enforces via
 * `React.lazy`. On RN, lazy chunking is less load-bearing because the
 * full bundle ships with the binary, but gating mount still avoids
 * any `expo-sqlite` `openDatabaseAsync` work for users who never
 * enable the flag.
 *
 * The flag is exposed in `ExperimentalSection` (auto-generated from
 * `EXPERIMENTAL_FLAGS` in `apps/mobile/src/core/lib/featureFlags.ts`)
 * so dev users can flip it from the same screen and immediately see
 * the panel appear below.
 */

import { Text } from "react-native";

import { useFlag } from "../lib/featureFlags";
import { RoutineSpikeDevPanel } from "../../modules/routine/components/RoutineSpikeDevPanel";
import { SettingsGroup } from "./SettingsPrimitives";

const ROUTINE_SPIKE_FLAG = "feature.routine.sqlite_v2";

export function RoutineSpikeSection() {
  const enabled = useFlag(ROUTINE_SPIKE_FLAG);
  return (
    <SettingsGroup title="Routine SPIKE — dev panel" emoji="🧪">
      {enabled ? (
        <RoutineSpikeDevPanel />
      ) : (
        <Text className="text-xs text-fg-muted leading-snug">
          Прапорець <Text className="font-mono">{ROUTINE_SPIKE_FLAG}</Text>{" "}
          вимкнений. Увімкни його в секції «Експериментальне» вище, щоб
          змонтувати панель і запустити заміри.
        </Text>
      )}
    </SettingsGroup>
  );
}

export default RoutineSpikeSection;
