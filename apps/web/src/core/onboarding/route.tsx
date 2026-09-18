/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyImport } from "../lib/lazyImport";
import { PageLoader } from "../app/PageLoader";
import { useHubShell } from "../app/HubShellContext";

const WelcomeScreen = lazyImport(
  () => import("../app/WelcomeScreen"),
  "WelcomeScreen",
);

/**
 * Lazy route entry for `/onboarding/*` (initiative 0006 — migrated off the
 * catch-all `path:"*"` HubPage).
 *
 * Exported as `Component` so React Router 7's `lazy()` picks it up, mirroring
 * the per-module route entries (`modules/<mod>/route.tsx`). The ~2k-LOC
 * onboarding flow (`WelcomeScreen` + `OnboardingWizard` + per-module
 * `seedDemoData/*`) loads on demand — first-time visitors pay the one-time
 * fetch on the splash, returning users never reach it.
 *
 * `WelcomeScreen` renders its own `<main id="main">` landmark, so the gate
 * here does not add a second one (a double-`<main>` would be an a11y
 * violation). `onDone` returns to the Hub root; `onOpenAuth` comes from the
 * shared shell.
 */
export function Component() {
  const { onOpenAuth } = useHubShell();
  const navigate = useNavigate();

  const handleDone = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <SuspenseWithMinDelay fallback={<PageLoader />}>
      <WelcomeScreen onDone={handleDone} onOpenAuth={onOpenAuth} />
    </SuspenseWithMinDelay>
  );
}
