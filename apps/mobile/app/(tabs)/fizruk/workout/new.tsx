/**
 * Deep-link target for `sergeant://workout/new`.
 *
 * Placeholder — real "start a new workout" flow lives inside
 * `/(tabs)/fizruk/workouts`. Kept as a standalone file (rather than
 * a conditional inside `[id].tsx`) so Expo Router's typed-routes
 * map `workout/new` directly instead of interpreting "new" as an id.
 */
import { DeepLinkPlaceholder } from "@/components/DeepLinkPlaceholder";

export default function FizrukWorkoutNewScreen() {
  return (
    <DeepLinkPlaceholder
      title="Нове тренування"
      followUp="Стартер сесії тренування (вибір шаблону / швидкий старт): наступний PR фази Фізрук."
      primaryAction={{
        label: "До списку тренувань",
        href: "/(tabs)/fizruk/workouts",
      }}
    />
  );
}
