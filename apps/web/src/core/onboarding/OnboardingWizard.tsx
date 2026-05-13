import { useMemo } from "react";
import { shouldShowOnboarding as sharedShouldShowOnboarding } from "./onboardingGate";
import { WelcomeOneScreen } from "./WelcomeOneScreen";
import { useOnboardingWizardState } from "./useOnboardingWizardState";

// Re-exported so `App.tsx` and any legacy call-site keep importing
// `shouldShowOnboarding` straight from this file.
export function shouldShowOnboarding() {
  return sharedShouldShowOnboarding();
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

/**
 * One-screen onboarding (v3).
 *
 * Hero + 4 module checkboxes (all on by default) + primary CTA. Tap
 * once → hub. Goal questions moved to per-module first-run sheets;
 * push permission asked just-in-time when the user enables a reminder
 * inside a module.
 *
 * Renders as a modal overlay (default) or inline card (`fullPage`
 * variant) inside the `/welcome` route.
 *
 * State, A/B variants and FTUX analytics live in
 * `useOnboardingWizardState`; the presentational tree is owned by
 * `WelcomeOneScreen` + `ModuleRow` siblings. This file is the
 * composition root + modal/fullPage chrome only.
 */
export function OnboardingWizard({
  onDone,
  variant = "modal",
  mode = "real",
  onSecondaryAction,
}: {
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  variant?: "modal" | "fullPage";
  /**
   * "real" (default) — first-run wizard: persists picks, fires the FTUX
   * funnel events, and marks onboarding done on finish.
   *
   * "tour" — read-only replay launched from Settings → "Подивитись tour".
   * Skips all storage writes and FTUX-funnel events, fires
   * `onboarding_replay_*` instead, and `finish` simply closes the
   * wizard without touching the user's onboarding / first-action state.
   */
  mode?: "real" | "tour";
  /**
   * PR-05 — demo mode as first-class CTA. Optional handler for the
   * "Подивитись приклад" button rendered inside the splash card. Only
   * passed by the `/welcome` host (`fullPage` variant); modal mode and
   * tour replay leave the secondary CTA hidden so demo seeding never
   * happens by accident from in-app surfaces.
   */
  onSecondaryAction?: () => void;
}) {
  const {
    picks,
    togglePick,
    expanded,
    toggleExpanded,
    heroCopy,
    ctaDisabled,
    ctaLabelOverride,
    emptyPicksHint,
    finish,
    secondaryAction,
  } = useOnboardingWizardState({ mode, onDone, onSecondaryAction });

  const content = useMemo(
    () => (
      <WelcomeOneScreen
        picks={picks}
        togglePick={togglePick}
        onOpen={finish}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        copy={heroCopy}
        ctaLabelOverride={ctaLabelOverride}
        ctaDisabled={ctaDisabled}
        emptyPicksHint={emptyPicksHint}
        onSecondaryAction={secondaryAction}
      />
    ),
    [
      picks,
      togglePick,
      finish,
      expanded,
      toggleExpanded,
      heroCopy,
      ctaLabelOverride,
      ctaDisabled,
      emptyPicksHint,
      secondaryAction,
    ],
  );

  if (variant === "fullPage") {
    return (
      <div
        className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter"
        aria-label="Вітальний екран"
      >
        {content}
      </div>
    );
  }

  // Виделена структура: окремий fixed-backdrop + окремий scroll-контейнер.
  // До 2026-05-08 dialog-обгортка була `fixed inset-0 ... flex items-end
  // sm:items-center` без `overflow-y-auto`, а внутрішня картка — без
  // `max-h`. Коли користувач у Settings → «Подивитись tour» розгортав
  // модулі через «Що це за розділи?», картка ставала вищою за viewport
  // і обрізалась і зверху (логотип), і знизу — без можливості прокрутки
  // дістатись до тогл-кнопки «Згорнути» (issue 2026-05-08).
  //
  // Backdrop тепер `fixed inset-0` (живе у viewport, не скролиться),
  // а scroll-шар — окремий wrapper з `min-h-full flex ...` усередині
  // зовнішнього `overflow-y-auto`, тож:
  //   - коли контент вміщується — картка центрується як раніше;
  //   - коли overflow — зовнішній шар прокручується, відкриваючи і
  //     верх (логотип), і низ (CTA + «Згорнути»). `overscroll-contain`
  //     гасить body-bounce на iOS.
  return (
    <div
      className="fixed inset-0 z-500 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label="Вітальний екран"
    >
      <div
        className="fixed inset-0 bg-bg/80 backdrop-blur-md"
        aria-hidden="true"
      />
      <div className="relative min-h-full flex items-end sm:items-center justify-center p-4 pb-safe">
        <div className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter">
          {content}
        </div>
      </div>
    </div>
  );
}
