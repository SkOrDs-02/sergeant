/**
 * `/fizruk/plan` — Monthly plan calendar.
 * Thin wrapper around `@/modules/fizruk/pages/PlanCalendar`.
 */

import { PlanCalendar } from "@/modules/fizruk/pages/PlanCalendar";

export default function FizrukPlanRoute() {
  return <PlanCalendar />;
}
