/**
 * HubChat route — `sergeant://hub-chat`.
 *
 * Modal-style screen, registered explicitly у `app/_layout.tsx` (нижче).
 * Деталі deep-link mappings — `apps/mobile/src/lib/deepLinks.ts`
 * (varіант `{ type: "hub-chat" }`) + документація у
 * `docs/mobile/overview.md`.
 */

import { HubChat } from "@/core/hub/HubChat";

export default function HubChatRoute() {
  return <HubChat />;
}
