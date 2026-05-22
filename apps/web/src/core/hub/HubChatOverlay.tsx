import { useCallback } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { PageLoader } from "../app/PageLoader";
import { lazyDefault } from "../lib/lazyImport";
import { useHubChatOverlay } from "./useHubChatOverlay";

const HubChat = lazyDefault(() => import("./HubChat"));

/**
 * Sergeant v2 Phase 7 D5 — HubChat bottom-sheet overlay shell.
 *
 * Mounts once at the app root (inside `<HubChatOverlayProvider>`) and
 * renders `<HubChat>` inside a glass `<Sheet>` whenever
 * `useHubChatOverlay().open` flips true. The full-screen `/chat` route
 * remains mounted (see `StandaloneRoutes.tsx` → `HubChatPage`) so deep
 * links, the AIPill voice commit (`navigate('/chat?q=…')`), and
 * notification landing URLs still resolve to a real URL — the overlay
 * is purely an additive Hub-UX surface.
 *
 * Snap-points caveat: the canonical `<Sheet>` primitive does not yet
 * support a snap-point API (single `max-h-[90vh]` panel with swipe-down
 * to dismiss). The product spec called for `["60%", "100%"]` with
 * pull-up expansion; that is captured as a follow-up rather than
 * blocking this surface. The overlay currently opens at the full Sheet
 * height; the existing iOS-style swipe-down dismiss still works.
 */
export function HubChatOverlay() {
  const { open, initialMessage, autoSendInitial, closeChat } =
    useHubChatOverlay();

  const handleClose = useCallback(() => {
    closeChat();
  }, [closeChat]);

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      variant="glass"
      // HubChat ships its own `<HubChatHeader>` (title popover + close
      // pill); we suppress Sheet's built-in header row to avoid a
      // duplicate stack. `title` is still consumed by `aria-labelledby`
      // via the visually-hidden node Sheet renders when hideHeader=true.
      hideHeader
      title="AI-асистент"
      // HubChat owns the inner scroll (`HubChatBody` is the scrollable
      // surface). Override Sheet's default padded + overflow-y-auto
      // body so we don't nest two scrolling containers; the inner
      // `flex` lets HubChat's `flex-1 min-h-0` shell fill the panel.
      bodyClassName="!p-0 !overflow-hidden flex flex-col"
      closeLabel="Закрити чат"
    >
      <SuspenseWithMinDelay fallback={<PageLoader />}>
        <HubChat
          onClose={handleClose}
          initialMessage={initialMessage}
          autoSendInitial={autoSendInitial}
        />
      </SuspenseWithMinDelay>
    </Sheet>
  );
}

export default HubChatOverlay;
