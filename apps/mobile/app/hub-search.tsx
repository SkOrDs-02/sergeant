/**
 * HubSearch route — renders the global search palette.
 *
 * Lives outside `(tabs)` so the palette can be pushed/presented as a
 * full-screen stack screen from any module. The Hub dashboard's
 * header-search affordance routes here via `router.push("/hub-search")`.
 *
 * See `apps/mobile/src/core/hub/search/HubSearch.tsx` for the shell and
 * `docs/mobile/react-native-migration.md` (Phase 2 / Hub-core) for the
 * porting roadmap.
 */

import { router } from "expo-router";

import { HubSearch } from "@/core/hub/search/HubSearch";

export default function HubSearchRoute() {
  const onClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return <HubSearch onClose={onClose} />;
}
