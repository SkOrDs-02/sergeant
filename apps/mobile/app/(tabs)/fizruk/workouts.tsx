/**
 * `/fizruk/workouts` — Workouts list + active session.
 * Thin wrapper around `@/modules/fizruk/pages/Workouts`.
 */

import { Workouts } from "@/modules/fizruk/pages/Workouts";

export default function FizrukWorkoutsRoute() {
  return <Workouts />;
}
