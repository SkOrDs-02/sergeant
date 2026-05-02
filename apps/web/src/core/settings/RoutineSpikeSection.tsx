/**
 * Settings → «Routine SPIKE — dev panel» section.
 *
 * Sits next to the regular «Експериментальне» group in
 * `HubSettingsPage` (advanced tab) and only mounts the actual dev
 * panel when `feature.routine.sqlite_v2` is on. The panel itself
 * lives in `apps/web/src/modules/routine/components/RoutineSpikeDevPanel.tsx`
 * and is lazy-loaded via `React.lazy` so the SPIKE library + its
 * sqlite-wasm chunk only ship to users who explicitly opt in. This
 * matters for the Stage 3 «bundle delta ≤ +5 KB when the flag is off»
 * decision-gate metric documented in
 * `docs/notes/spikes/routine-sqlite-v2.md`.
 */

import { lazy, Suspense } from "react";

import { useFlag } from "../lib/featureFlags";
import { SettingsGroup } from "./SettingsPrimitives";

const ROUTINE_SPIKE_FLAG = "feature.routine.sqlite_v2";

const RoutineSpikeDevPanel = lazy(() =>
  import("../../modules/routine/components/RoutineSpikeDevPanel").then(
    (mod) => ({ default: mod.RoutineSpikeDevPanel }),
  ),
);

export function RoutineSpikeSection() {
  const enabled = useFlag(ROUTINE_SPIKE_FLAG);

  return (
    <SettingsGroup title="Routine SPIKE — dev panel" emoji="🧪">
      {enabled ? (
        <Suspense
          fallback={
            <p
              className="text-xs text-muted"
              data-testid="routine-spike-loading"
            >
              Завантажую панель…
            </p>
          }
        >
          <RoutineSpikeDevPanel />
        </Suspense>
      ) : (
        <p className="text-xs text-subtle leading-snug">
          Прапорець <code className="font-mono">{ROUTINE_SPIKE_FLAG}</code>{" "}
          вимкнений. Увімкни його у блоці «Експериментальне» вище — після цього
          тут з&apos;явиться панель з кнопками <strong>Init</strong>,{" "}
          <strong>Запис</strong>, <strong>Push</strong>, <strong>Pull</strong>{" "}
          та лічильниками латентності для замірів decision-gate.
        </p>
      )}
    </SettingsGroup>
  );
}
