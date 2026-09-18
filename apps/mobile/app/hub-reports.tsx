/**
 * HubReports route — renders the cross-module reports surface.
 *
 * Lives outside `(tabs)` so it can be pushed/presented as a full-screen
 * stack screen from the Hub dashboard, mirroring `hub-search` / `hub-chat`.
 * Registered in `app/_layout.tsx` as a modal presentation.
 *
 * See `apps/mobile/src/core/hub/HubReports.tsx` for the shell and
 * `apps/web/src/core/hub/HubReports.tsx` for the canonical web behaviour.
 */

import { router } from "expo-router";

import { HubReports } from "@/core/hub/HubReports";

export default function HubReportsRoute() {
  const onClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return <HubReports onClose={onClose} />;
}
