import { Suspense, lazy, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLoader } from "../app/PageLoader";

const HubChat = lazy(() => import("./HubChat"));

/**
 * @scaffolded
 * @addedIn 2026-05-01
 * @owner @Skords-01
 * @nextStep Inline sessions sidebar on `lg+` screens once the
 *   in-chat history drawer is folded into a real two-pane layout.
 *
 * Dedicated `/chat` route. Replaces the fullscreen modal that used to
 * slam over the dashboard. Reads `?q=` and `?autoSend=1` from the URL
 * so launcher / catalogue / hint hand-offs all use the same shape:
 *
 *   navigate(`/chat?q=${encodeURIComponent(message)}`);
 *
 * `onClose` and `onOpenCatalogue` route through `react-router` instead
 * of imperative state, so the back button and deep-links behave as
 * expected.
 */
export function HubChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialMessage = useMemo(() => {
    const raw = searchParams.get("q");
    return raw && raw.trim().length > 0 ? raw : "";
  }, [searchParams]);

  const autoSendInitial = useMemo(
    () => searchParams.get("autoSend") === "1",
    [searchParams],
  );

  const handleClose = useCallback(() => {
    // Prefer an in-app back navigation so the user lands on whatever
    // surface they came from (dashboard, module). Fallback to `/` for
    // direct hits (deep link, refresh on `/chat`).
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  }, [navigate]);

  const handleOpenCatalogue = useCallback(() => {
    navigate("/assistant");
  }, [navigate]);

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden safe-area-pt-pb page-enter">
      <Suspense fallback={<PageLoader />}>
        <HubChat
          onClose={handleClose}
          initialMessage={initialMessage}
          autoSendInitial={autoSendInitial}
          onOpenCatalogue={handleOpenCatalogue}
        />
      </Suspense>
    </div>
  );
}

export default HubChatPage;
