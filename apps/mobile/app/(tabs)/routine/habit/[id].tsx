/**
 * Deep-link target for `sergeant://routine/habit/{id}`.
 *
 * Stays as a lightweight placeholder while the full per-habit detail
 * screen is scoped (see follow-up in `docs/mobile/react-native-migration.md`
 * § 5.4). Today it surfaces the habit id so that a user who arrived
 * from a push-notification reminder or an Android app-shortcut still
 * has a visible confirmation that the deep link was routed correctly;
 * a later PR hangs the habit-completion + streak UI directly off the
 * shared `useRoutineStore()` state.
 */
import { useLocalSearchParams } from "expo-router";

import { DeepLinkPlaceholder } from "@/components/DeepLinkPlaceholder";

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DeepLinkPlaceholder
      title="Звичка"
      detail={id ? `ID: ${id}` : undefined}
      followUp="Повний екран звички (деталі, streak, історія, нотатки): наступний PR фази Рутина."
      primaryAction={{ label: "До списку звичок", href: "/(tabs)/routine" }}
    />
  );
}
