/**
 * Hub tab — top-level dashboard.
 *
 * Thin route file that delegates to `HubDashboard` under
 * `src/core/dashboard`. Account / dev tooling (sign-out, dev push
 * test) now live in the Hub Settings screen (`app/settings.tsx`).
 */

import { HubDashboard } from "@/core/dashboard/HubDashboard";

export default function HubScreen() {
  return <HubDashboard />;
}
