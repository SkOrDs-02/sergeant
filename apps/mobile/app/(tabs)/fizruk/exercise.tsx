/**
 * `/fizruk/exercise` — Exercise detail.
 *
 * Reads the `id` query param from `useLocalSearchParams` so a card in
 * Workouts/Dashboard can `router.push("/fizruk/exercise?id=<exerciseId>")`.
 * Full detail rendering lands in a follow-up Phase 6 PR.
 */

import { useLocalSearchParams } from "expo-router";

import { Exercise } from "@/modules/fizruk/pages/Exercise";

export default function FizrukExerciseRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Exercise exerciseId={typeof id === "string" ? id : undefined} />;
}
