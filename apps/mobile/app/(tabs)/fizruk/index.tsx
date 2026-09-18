/**
 * `/fizruk` — Fizruk Dashboard route (stack root).
 *
 * Thin wrapper around `@/modules/fizruk/pages/Dashboard`. All logic
 * lives in the module so the route file stays a no-op entry point.
 */

import { Dashboard } from "@/modules/fizruk/pages/Dashboard";

export default function FizrukDashboardRoute() {
  return <Dashboard />;
}
