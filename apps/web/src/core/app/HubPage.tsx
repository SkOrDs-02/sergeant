import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import { shouldShowOnboarding } from "../onboarding/onboardingGate";
import { useHubShell } from "./HubShellContext";
import { renderStandaloneRoute } from "./StandaloneRoutes";
import { HubHomeView } from "./HubHomeView";
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

  const openAuth = useCallback(
    () => navigate(SIGN_IN_PATH),
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
    onLeaveAuth: leaveAuth,
    onLeaveWelcome: leaveWelcome,
    onOpenAuth: openAuth,
    onAssistantClose,
  });
  if (standalone) {
    return <>{standalone}</>;
  }

  // 3. First-time visitors → /welcome
  if (!shell.activeModule && shouldShowOnboarding()) {
    return <RedirectTo to={WELCOME_PATH} />;
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
