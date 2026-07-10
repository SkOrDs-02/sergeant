/**
 * Sergeant Hub-core — RoutineSection (React Native)
 *
 * Mobile mirror of `apps/web/src/core/settings/RoutineSection.tsx`.
 *
 * Previously persisted calendar-visibility prefs via the orphan
 * `@routine_prefs_v1` MMKV key.  Migrated (dual-write teardown) to the
 * canonical `useRoutinePrefs` hook, which reads from the SQLite warm
 * cache (`routine_prefs` table) and writes through `saveRoutineState` /
 * the dual-write pipeline.  The `@routine_prefs_v1` key is never written
 * here any more; boot-time residual import in `bootRoutineSqliteReadPath`
 * drains any leftover values once and removes the key.
 */

import { useRoutinePrefs } from "@/modules/routine/hooks/useRoutinePrefs";

import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

export function RoutineSection() {
  const { prefs, updatePrefs } = useRoutinePrefs();

  const showFizruk = prefs.showFizrukInCalendar !== false;
  const showFinyk = prefs.showFinykSubscriptionsInCalendar !== false;

  return (
    <SettingsGroup title="Рутина" emoji="✅">
      <ToggleRow
        label="Показувати тренування з Фізрука в календарі"
        checked={showFizruk}
        onChange={(next) => updatePrefs({ showFizrukInCalendar: next })}
      />
      <ToggleRow
        label="Показувати планові платежі підписок Фініка в календарі"
        checked={showFinyk}
        onChange={(next) =>
          updatePrefs({ showFinykSubscriptionsInCalendar: next })
        }
      />
    </SettingsGroup>
  );
}
