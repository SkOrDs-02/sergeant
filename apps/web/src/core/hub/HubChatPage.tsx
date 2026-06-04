import { useCallback, useEffect, useMemo } from "react";
import {
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { PageLoader } from "../app/PageLoader";
import { lazyDefault } from "../lib/lazyImport";
import {
  safeReadStringSS,
  safeWriteSS,
  safeRemoveSS,
} from "@shared/lib/storage/storage";

const HubChat = lazyDefault(() => import("./HubChat"));

// Marks the current `/chat` visit as reachable via in-app back navigation.
// Set on mount when the router reports a PUSH (router-driven in-app nav),
// cleared on close. Direct hits, refreshes, and history POPs leave the flag
// absent so `handleClose` falls back to the Hub instead of `navigate(-1)`,
// which could otherwise eject the user to a previous tab origin.
const IN_APP_ENTRY_FLAG = "hub-chat:in-app-entry";

/**
 * @scaffolded
 * @addedIn 2026-05-01
 * @owner @Skords-01
 * @nextStep Inline sessions sidebar on `lg+` screens once the
 *   in-chat history drawer is folded into a real two-pane layout.
 *
 * Dedicated `/chat` route. Replaces the fullscreen modal that used to
 * slam over the dashboard. Reads `?q=` from the URL so launcher /
 * catalogue / hint hand-offs all use the same shape:
 *
 *   navigate(`/chat?q=${encodeURIComponent(message)}`);
 *
 * `onClose` and `onOpenCatalogue` route through `react-router` instead
 * of imperative state, so the back button and deep-links behave as
 * expected.
 *
 * Audit 03 F4 (high/security): `?autoSend=1` is **not** honored on this
 * surface. The pre-fill stays so a user can review the text and hit
 * Send themselves; the auto-send path is only reachable from the
 * in-process `openChat` hub-bus event (`HubChatOverlay`), which is
 * not attacker-controllable from a hand-crafted URL.
 */
export function HubChatPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams] = useSearchParams();

  const initialMessage = useMemo(() => {
    const raw = searchParams.get("q");
    return raw && raw.trim().length > 0 ? raw : "";
  }, [searchParams]);

  useEffect(() => {
    if (navigationType !== "PUSH") {
      return;
    }
    // safeWriteSS never throws; swallows private-mode / quota errors.
    safeWriteSS(IN_APP_ENTRY_FLAG, "1");
  }, [navigationType]);

  const handleClose = useCallback(() => {
    const cameFromInApp = safeReadStringSS(IN_APP_ENTRY_FLAG) === "1";
    if (cameFromInApp) {
      safeRemoveSS(IN_APP_ENTRY_FLAG);
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  }, [navigate]);

  const handleOpenCatalogue = useCallback(() => {
    navigate("/assistant");
  }, [navigate]);

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden safe-area-pt-pb page-enter">
      <SuspenseWithMinDelay fallback={<PageLoader />}>
        <HubChat
          onClose={handleClose}
          initialMessage={initialMessage}
          autoSendInitial={false}
          onOpenCatalogue={handleOpenCatalogue}
        />
      </SuspenseWithMinDelay>
    </div>
  );
}

export default HubChatPage;
