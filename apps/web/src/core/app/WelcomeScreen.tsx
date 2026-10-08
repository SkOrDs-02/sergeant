/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import {
  markFirstActionPending,
  markFirstActionStartedAt,
  saveVibePicks,
} from "../onboarding/vibePicks";
import { pushActiveModules } from "../hub/activeModulesSync";
import {
  isOnboardingCompletedFired,
  markOnboardingCompletedFired,
  markOnboardingDone,
} from "../onboarding/onboardingGate";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { getAnalyticsDecision } from "../observability/analyticsConsent";
import { OnboardingConsentStep } from "../onboarding/OnboardingConsentStep";
import { useCallback, useState } from "react";
import { WelcomeModulePicker } from "./WelcomeModulePicker";
import type { DashboardModuleId } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

// AI-CONTEXT: до 2026-10-08 за карткою стояв `PeekBackdrop`: три розмиті
// плаваючі плями (`blur-2xl animate-float-slow`) і розмитий псевдо-хаб із
// скелетон-рисками. Це T3 «aurora/orbs» і T13 «floating blobs» з матриці
// анти-слоп аудиту 2026-09-01, тобто перший екран продукту стояв на
// найпоширенішому відбитку генераторів. Знято рішенням власника
// (`docs/work/specs/audits/2026-10-08-anti-slop-round4-research.md`, Q1):
// верх екрана лишається тихим, картка центрується. Повертати декор сюди не
// треба: §8 анти-слоп стратегії, «не додавати характеру декором».

interface WelcomeScreenProps {
  /** Called when onboarding completes. Receives the selected start module and optional wizard options. */
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  /** Navigate to the sign-in route for users who already have an account. */
  onOpenAuth: () => void;
}

/**
 * Full-page cold-start at `/welcome`. Owns the page chrome + peek
 * backdrop and delegates the splash card to `WelcomeModulePicker`.
 *
 * Phase 7 D4 (2026-05-22) swapped the row-based `OnboardingWizard`
 * splash for a preset-first 2x2 module-card grid — see
 * `docs/design/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`
 * § D4. The wizard component still ships for tour-replay launched
 * from Settings → «Переглянути вступну екскурсію»; only this
 * `/welcome` cold-start surface swapped. Persistence still flows
 * through `vibePicks` + `onboardingGate` so HubDashboard,
 * `getActiveModules` observe the same
 * downstream state regardless of which welcome surface ran.
 *
 * До 2026-09-17 картка несла ще й другорядний CTA «Подивитись
 * приклад», що сіяв демо-payload. Демо-режим знято — лишається один
 * шлях: обрати модулі або увійти в наявний акаунт.
 *
 * З 2026-10-01 після вибору модулів іде другий крок — згода на продуктову
 * аналітику (`OnboardingConsentStep`, рішення власника): вона частина
 * онбордингу, а не плаваючий банер над ним (`AnalyticsConsentGate` на цих
 * маршрутах мовчить). Крок пропускається, якщо рішення на пристрої вже є.
 */
export function WelcomeScreen({ onDone, onOpenAuth }: WelcomeScreenProps) {
  // "У мене вже є акаунт" — just navigates to `/sign-in`. Does NOT mark
  // onboarding done here (PR-H7, design-audit 2026-09-13): a mistaken tap
  // followed by "Поки що пропустити" on `/sign-in` used to leave the local
  // gate closed forever (a plain nav.click before we knew whether this
  // visitor had an account at all), so the visitor landed on an empty hub
  // with no FTUX hero and no way back to the splash. The gate now closes
  // in exactly one place, once a session is actually confirmed — see the
  // `SIGN_IN_PATH` entry in `StandaloneRoutes.tsx`, which covers both a
  // fresh sign-in on this screen and an already-restored session.
  const handleOpenAuth = useCallback(() => {
    onOpenAuth();
  }, [onOpenAuth]);

  // Два кроки на одному маршруті: вибір модулів → згода на аналітику
  // (рішення власника 2026-10-01). Обрані модулі чекають у стані, доки людина
  // не відповість; нічого не пишемо в сховище й не шлемо в аналітику до кінця
  // кроку згоди, тож `onboarding_vibe_picked` / `onboarding_completed`
  // стартують ПІСЛЯ рішення і потрапляють у PostHog, якщо згода є.
  const [pendingPicks, setPendingPicks] = useState<DashboardModuleId[] | null>(
    null,
  );

  // Phase 7 D4 preset-picker submit path. Persists the user's module
  // selection, marks onboarding done, fires the canonical analytics
  // funnel and bubbles the picks up to App-level navigation. Mirrors
  // `useOnboardingWizardState.finish()` so legacy consumers
  // (onboardingGate) see identical state.
  const completeOnboarding = useCallback(
    (picks: DashboardModuleId[]) => {
      saveVibePicks(picks);
      // Див. `useOnboardingWizardState`: boot-гідрація вже відпрацювала на
      // порожньому стані, тож без явного пушу вибір не потрапляє на акаунт
      // до наступного буту.
      pushActiveModules(picks);
      markOnboardingDone();
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
        picks,
        picksCount: picks.length,
        intent: "preset_picker",
      });
      if (!isOnboardingCompletedFired()) {
        trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          intent: "preset_picker",
          picksCount: picks.length,
        });
        markOnboardingCompletedFired();
      }
      markFirstActionStartedAt();
      markFirstActionPending();
      onDone(null, { intent: "preset_picker", picks });
    },
    [onDone],
  );

  // Модулі обрано. Рішення про аналітику на цьому пристрої вже є (повторний
  // прохід, тумблер у налаштуваннях, згода з іншого пристрою) — питати вдруге
  // не треба, завершуємо одразу.
  const handlePicksSelected = useCallback(
    (picks: DashboardModuleId[]) => {
      if (getAnalyticsDecision() !== null) {
        completeOnboarding(picks);
        return;
      }
      setPendingPicks(picks);
    },
    [completeOnboarding],
  );

  // `OnboardingConsentStep` викликає це вже ПІСЛЯ запису згоди.
  const handleConsentDecided = useCallback(() => {
    if (pendingPicks) completeOnboarding(pendingPicks);
  }, [pendingPicks, completeOnboarding]);

  // 2026-05-08 — окремий scroll-шар на page-wrapper'і.
  // `html`/`body` не прокручуються, а `#root` має точну висоту viewport
  // (`100dvh` у browser mode, `100vh` у standalone PWA; див.
  // `apps/web/src/styles/base.css`), тож натуральний body-scroll вимкнений.
  // До цього фіксу page-wrapper був
  // `min-h-dvh ... overflow-hidden`: коли користувач розгортав
  // модулі через «Що це за розділи?», splash-картка ставала вищою
  // за viewport, але body не міг прокрутитись,
  // а `overflow-hidden` обрізав картку зверху (логотип) і знизу
  // (CTA / «Згорнути») — без можливості скрола взагалі.
  //
  // Тепер page-wrapper — справжній scroll-контейнер: `h-app-dvh`
  // (рівно viewport), `overflow-y-auto` (внутрішній скрол),
  // `overscroll-contain` (гасить body-bounce на iOS).
  // Внутрішній шар — `min-h-full flex items-center`: коли вміст
  // вміщується — картка по центру (до 2026-10-08 на телефоні вона стояла
  // внизу, а верх займав декор); коли overflow — зовнішній скролить і
  // вертикально розкриває і верх (логотип), і низ (auth-кнопка +
  // «Згорнути»).
  return (
    // `<main>` (not `<div>`) — `/welcome` is a standalone landing route
    // rendered outside `ActiveModuleView`, so without a `<main>` landmark
    // here the page has no `main` AT region and the Critical-flow E2E
    // suite's `await expect(page.locator("main")).toBeVisible()` after
    // sign-up (which redirects to `/welcome` for fresh accounts) hits an
    // element-not-found timeout. `id="main"` keeps the SkipLink target
    // contract (`#main` + focusable) consistent with what `ActiveModule
    // View` renders for the authenticated hub.
    <main
      id="main"
      tabIndex={-1}
      className="relative h-app-dvh overflow-y-auto overscroll-contain bg-mesh text-text outline-none"
    >
      <div className="relative min-h-full flex items-center justify-center p-4 pb-safe">
        <h1 className="sr-only">{messages.nav.welcome}</h1>
        <div className="w-full max-w-md space-y-3">
          {/* Phase 7 D4 — preset picker replaces the row-based
              OnboardingWizard as the cold-start surface. The wizard
              still ships for tour-replay (Settings → "Подивитись
              екскурсію"); only this `/welcome` entry point swaps. */}
          {pendingPicks ? (
            <OnboardingConsentStep onDecided={handleConsentDecided} />
          ) : (
            <WelcomeModulePicker
              onComplete={handlePicksSelected}
              onOpenAuth={handleOpenAuth}
            />
          )}
        </div>
      </div>
    </main>
  );
}
