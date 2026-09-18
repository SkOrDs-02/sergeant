/**
 * Assistant capability catalogue route.
 *
 * Modal stack screen registered in `app/_layout.tsx`. Mirrors the web
 * `/assistant` route — surfaces the full `ASSISTANT_CAPABILITIES`
 * registry from `@sergeant/shared` so the user can browse what the
 * AI assistant can do.
 *
 * See `apps/mobile/src/core/AssistantCataloguePage.tsx` for the page
 * implementation and `apps/mobile/src/core/settings/AssistantCatalogueSection.tsx`
 * for the settings-shell launcher.
 */

import { AssistantCataloguePage } from "@/core/AssistantCataloguePage";

export default function AssistantRoute() {
  return <AssistantCataloguePage />;
}
