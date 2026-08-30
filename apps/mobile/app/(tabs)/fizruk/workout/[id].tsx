/**
 * Deep-link target for `sergeant://workout/{id}`.
 *
 * Placeholder screen — the full active-workout UI lives inside
 * `/(tabs)/fizruk/workouts` on the current tab and is re-assembled
 * in a later fizruk PR. For now we surface the workout id and offer
 * a fall-back to the Fizruk list so a user arriving from an Android
 * shortcut or push-notification deep link is never stranded.
 */
import { useLocalSearchParams } from "expo-router";

import { DeepLinkPlaceholder } from "@/components/DeepLinkPlaceholder";

export default function FizrukWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DeepLinkPlaceholder
      title="Тренування"
      detail={id ? `ID: ${id}` : undefined}
      followUp="Окремий екран тренування: наступний PR фази Фізрук."
      primaryAction={{
        label: "До списку тренувань",
        href: "/(tabs)/fizruk/workouts",
      }}
    />
  );
}
