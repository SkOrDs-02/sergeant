import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import { shouldShowOnboarding } from "../onboarding/onboardingGate";
import { useStorageReady } from "../db/storageReady";
import { useHubShell } from "./HubShellContext";
import { renderStandaloneRoute } from "./StandaloneRoutes";
import { HubHomeView } from "./HubHomeView";
import { PageLoader } from "./PageLoader";
import { RedirectTo } from "./RedirectTo";
import { SIGN_IN_PATH, WELCOME_PATH } from "./appPaths";

/**
 * Hub page — catch-all child route for hub home + standalone routes.
 *
 * Initiative 0006 Phase 5: with the `RootLayout + Outlet` pattern,
 * per-module routes (`/finyk/*`, `/fizruk/*`, etc.) are separate
 * children of RootLayout. This component handles everything else:
 *
 *  1. Legacy `?module=X` redirect → `/${X}` (path-based URL)
 *  2. Standalone routes (sign-in, welcome, pricing, legal, etc.)
 *  3. Onboarding redirect (first-time visitors → `/welcome`)
 *  4. Hub home (dashboard)
 */
export function HubPage() {
  const location = useLocation();
  const browserLocation = useBrowserLocation(location);
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(browserLocation.search);

  const shell = useHubShell();

  // The SQLite warm-cache that backs `shouldShowOnboarding()` boots
  // asynchronously; on a hard reload it is still empty when this guard first
  // runs. Gate the onboarding decision on it so a returning user is not bounced
  // to `/welcome` before the persistent store resolves. See
  // `core/db/storageReady.ts`.
  const storageReady = useStorageReady();

  const openAuth = useCallback(
    () => navigate(SIGN_IN_PATH, { flushSync: true }),
    [navigate],
  );

  // «Поки що пропустити» на /sign-in (same logic as legacy AppInner):
  const leaveAuth = useCallback(() => {
    if (shouldShowOnboarding()) {
      navigate(WELCOME_PATH, { replace: true });
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  }, [navigate, location.key]);

  const leaveWelcome = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const onAssistantClose = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // 1. Legacy `?module=X` → path-based redirect.
  //    Preserves hash so module-level compat shims can handle it.
  if (shell.activeModule && searchParams.has("module")) {
    const hash = browserLocation.hash;
    return <RedirectTo to={`/${shell.activeModule}${hash}`} />;
  }

  // 2. Standalone routes (sign-in, welcome, pricing, legal, etc.)
  const standalone = renderStandaloneRoute({
    pathname: browserLocation.pathname,
    user: shell.user,
    authLoading: shell.authLoading,
    storageReady,
    onLeaveAuth: leaveAuth,
    onLeaveWelcome: leaveWelcome,
    onOpenAuth: openAuth,
    onAssistantClose,
  });
  if (standalone) {
    return <>{standalone}</>;
  }

  // 3. First-time visitors → /welcome — but only once the persistent store has
  //    resolved. `shouldShowOnboarding()` reads (and, when it finds existing
  //    data, writes) the SQLite-backed warm-cache; evaluating it against the
  //    empty pre-boot store falsely redirects a returning user to `/welcome` on
  //    every hard reload. Render the splash until ready, then decide.
  if (!shell.activeModule) {
    if (!storageReady) {
      return <PageLoader />;
    }
    if (shouldShowOnboarding()) {
      return <RedirectTo to={WELCOME_PATH} />;
    }
  }

  // 4. Hub home (dashboard)
  return (
    <HubHomeView
      ui={shell.ui}
      user={shell.user}
      authLoading={shell.authLoading}
      onOpenAuth={openAuth}
      canInstall={shell.canInstall}
      onInstall={shell.onInstall}
      onDismissInstall={shell.onDismissInstall}
      iosVisible={shell.iosVisible}
      onDismissIos={shell.onDismissIos}
      updateAvailable={shell.updateAvailable}
      onApplyUpdate={shell.onApplyUpdate}
      openModule={shell.openModule}
      shortcutsOpen={shell.shortcutsOpen}
      onCloseShortcuts={shell.onCloseShortcuts}
    />
  );
}
