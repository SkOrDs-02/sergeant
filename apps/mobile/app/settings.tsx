/**
 * HubSettings route — renders the Hub-core settings shell.
 *
 * Lives outside `(tabs)` so it can be pushed/presented as a modal
 * stack screen from any module without bloating the already-full
 * bottom tab bar (5 tabs: Хаб / ФІНІК / ФІЗРУК / Рутина / Їжа).
 *
 * See `apps/mobile/src/core/settings/HubSettingsPage.tsx` for the
 * shell + first-cut sections, and `docs/engineering/mobile/react-native-migration.md`
 * (Phase 2 / Hub-core) for the porting roadmap.
 */

import { HubSettingsPage } from "@/core/settings/HubSettingsPage";

export default function SettingsRoute() {
  return <HubSettingsPage />;
}
