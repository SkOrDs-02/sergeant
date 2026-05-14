import { useCallback, useEffect, useMemo, useRef } from "react";
import { shouldShowOnboarding as sharedShouldShowOnboarding } from "./onboardingGate";
import { WelcomeOneScreen } from "./WelcomeOneScreen";
import { useOnboardingWizardState } from "./useOnboardingWizardState";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";

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
 * composition root + modal/fullPage chrome (focus trap, Escape, focus
 * restoration) only.
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
   * Host-owned secondary handler. Serves two purposes:
   *
   *   1. PR-05 demo-mode CTA. The «Подивитись приклад» button
   *      rendered inside the splash card invokes this when the
   *      `/welcome` host (`fullPage` variant) wires demo seeding.
   *      Tour replay leaves this hidden so the read-only replay can
   *      never accidentally trigger the seeder against the host's
   *      store.
   *   2. Soft-pause Escape handler for the modal variant. Real-mode
   *      modals call this when Escape is pressed inside the dialog,
   *      so the host can hide the wizard without firing onboarding
   *      analytics or touching the `hub_onboarding_done_v1` gate.
   *      Picks are already persisted on every state change, so
   *      reopening the wizard restores the in-progress selection
   *      exactly.
   *
   * Tour-mode Escape ignores this prop — it short-circuits to the
   * same `onDone(null, { intent: "tour_replay" })` payload as the
   * «Закрити» CTA so the dismissal path stays single-source.
   */
  onSecondaryAction?: () => void;
}) {
  const isTour = mode === "tour";

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
    submitting,
    secondaryAction,
  } = useOnboardingWizardState({ mode, onDone, onSecondaryAction });

  // Refs for the modal-variant focus contract. `panelRef` is the
  // scope passed to `useDialogFocusTrap` (Tab cycle + Escape).
  // `headingRef` is the `<h2>` that receives initial focus so screen
  // readers announce the new context (WCAG 2.4.3) instead of
  // stranding the user on `<body>`.
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move initial focus into the dialog so keyboard / screen-reader
  // users land on a sensible anchor instead of `<body>`. The heading
  // is the safest target — the primary CTA may be disabled (S6.1
  // empty-picks state) and focusing a disabled control would push
  // focus right back out. `preventScroll: true` keeps the page from
  // jumping when the wizard mounts mid-scroll. Fires once per mount;
  // `headingRef.current` becomes available after the first paint.
  useEffect(() => {
    if (variant !== "modal") return;
    const heading = headingRef.current;
    if (!heading) return;
    try {
      heading.focus({ preventScroll: true });
    } catch {
      /* heading is detached or non-focusable — nothing to recover */
    }
  }, [variant]);

  // Escape closes the modal variant. Strategy = **soft-pause**: picks
  // are persisted on every state change, so dismissing the modal
  // mid-flow drops the user back wherever the host renders the
  // wizard and a fresh mount restores the in-progress selection
  // exactly. No `<ConfirmDialog>` step because nothing destructive
  // happens — we just hide the overlay.
  //
  // Real-mode Escape forwards to `onSecondaryAction` so the host
  // owns the «where did the user end up» decision (close modal,
  // route to `/welcome`, seed demo, etc.) without the wizard
  // having to model the dismissal lifecycle itself.
  //
  // Tour replay short-circuits to `finish()` so Escape mirrors the
  // «Закрити» CTA exactly (single dismissal contract, single
  // `onDone` payload). The hook also gives us a Tab cycle inside the
  // panel and restores focus to whatever triggered the wizard.
  const handleEscape = useCallback(() => {
    if (isTour) {
      finish();
      return;
    }
    onSecondaryAction?.();
  }, [isTour, finish, onSecondaryAction]);
  useDialogFocusTrap(variant === "modal", panelRef, {
    onEscape: handleEscape,
  });

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
        headingRef={headingRef}
        ctaBusy={submitting}
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
      submitting,
    ],
  );

  if (variant === "fullPage") {
    return (
      <div
        ref={panelRef}
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
        <div
          ref={panelRef}
          className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter"
        >
          {content}
        </div>
      </div>
    </div>
  );
}
