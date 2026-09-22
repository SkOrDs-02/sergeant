/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
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
import { useCallback } from "react";
import { WelcomeModulePicker } from "./WelcomeModulePicker";
import type { DashboardModuleId } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

// Static preview of the populated hub that sits behind the splash card on
// `/welcome`. Renders a 2×2 bento grid matching `HubDashboard`'s module
// cards so the blurred silhouette under the splash accurately teases the
// real dashboard layout new users are about to see.
//
// PR-06 — canonical Cyrillic without emoji. Module labels are bare brand
// names (`Фінік / Фізрук / Рутина / Харчування`) — the colored module-icon
// bubble already carries the visual association, so emoji prefixed to the
// text was duplicative and broke uniformity vs the hub bottom-nav and
// settings groups.
//
// AI-CONTEXT: картки навмисно БЕЗ числових значень. Доти тут стояли
// `−320 ₴`, `5 трен.`, `7 днів`, `420 ккал`, а підпис «Це приклад» мав
// `hidden sm:flex` — тобто на телефоні, основній платформі web-first PWA,
// новачок бачив чужі числа без жодної ознаки, що вони несправжні
// (`docs/work/specs/audits/2026-09-20-rada-skeptykiv.md` § G). Форму
// дашборда тепер тримають скелетон-риски: вони не вдають дані, тож і
// дисклеймер більше не потрібен.
const PEEK_CARDS = [
  {
    id: "finyk",
    label: "Фінік",
    cardBg: "bg-finyk-soft/40 dark:bg-finyk-surface-dark/8",
    iconClass: "bg-finyk-soft text-finyk dark:bg-finyk-surface-dark/15",
    icon: "credit-card",
  },
  {
    id: "fizruk",
    label: "Фізрук",
    cardBg: "bg-fizruk-soft/40 dark:bg-fizruk-surface-dark/8",
    iconClass: "bg-fizruk-soft text-fizruk dark:bg-fizruk-surface-dark/15",
    icon: "dumbbell",
  },
  {
    id: "routine",
    label: "Рутина",
    cardBg: "bg-routine-surface/40 dark:bg-routine-surface-dark/8",
    iconClass:
      "bg-routine-surface text-routine dark:bg-routine-surface-dark/15",
    icon: "check",
  },
  {
    id: "nutrition",
    label: "Їжа",
    cardBg: "bg-nutrition-soft/40 dark:bg-nutrition-surface-dark/8",
    iconClass:
      "bg-nutrition-soft text-nutrition dark:bg-nutrition-surface-dark/15",
    icon: "utensils",
  },
];

function PeekBackdrop() {
  // 2026-05-08 — `fixed inset-0` (not `absolute inset-0`).
  // Раніше backdrop сидів у тому самому потоці page-wrapper'а, тож
  // коли scroll-шар розширювався (через «Що це за розділи?»),
  // floating-shapes / blurred bento теж тягнулися вниз разом із
  // вмістом. `fixed` пришпилює backdrop до viewport — він залишається
  // на місці, а splash-картка прокручується над ним. Дзеркало того
  // ж патерну, що й у `OnboardingWizard` modal-варіанті.
  return (
    <div
      aria-hidden
      role="presentation"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <div
        className={cn(
          "absolute inset-0",
          // Soft brand wash so the backdrop never looks empty on cold load.
          "bg-linear-to-b from-brand-500/5 via-transparent to-transparent",
        )}
      />
      {/* Animated floating shapes for visual interest */}
      <div className="absolute inset-0">
        <div
          className="absolute top-[15%] left-[10%] w-24 h-24 rounded-full bg-brand-500/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="absolute top-[30%] right-[15%] w-32 h-32 rounded-full bg-finyk/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-[25%] left-[20%] w-20 h-20 rounded-full bg-fizruk/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>
      {/* Faux hub rendered under a blur so the user perceives the shape
          and accent colors of their about-to-be-populated dashboard. The
          cards carry skeleton bars, not numbers — nothing here pretends to
          be data, so no disclaimer is needed. Uses a 2×2 bento grid
          matching the real dashboard. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 pt-[max(2.5rem,env(safe-area-inset-top))] px-5 max-w-lg mx-auto w-full",
          "opacity-0 motion-safe:animate-fade-in-slow",
        )}
        style={{
          filter: "blur(6px) saturate(0.85)",
          animationDelay: "0.3s",
          animationFillMode: "forwards",
        }}
      >
        <div className="space-y-3 opacity-40">
          <div>
            <div className="h-6 w-32 rounded-xl bg-panelHi" />
            <div className="h-3 w-24 rounded-xl bg-panelHi mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PEEK_CARDS.map((card, idx) => (
              <div
                key={card.id}
                className={cn(
                  "flex flex-col rounded-3xl border border-line p-3.5 shadow-card",
                  card.cardBg,
                  "motion-safe:animate-card-enter",
                )}
                // Hard Rule #17 — крок стагеру ≤30 мс (було 100 мс).
                // 0.4 с — це затримка входу всієї peek-групи, не крок
                // між дітьми, тому лишається.
                style={{
                  animationDelay: `calc(0.4s + ${Math.min(idx * 30, 150)}ms)`,
                }}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mb-2",
                    card.iconClass,
                  )}
                >
                  <Icon
                    name={card.icon}
                    size="md"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <span className="text-style-label font-semibold text-text">
                  {card.label}
                </span>
                <div className="h-5 w-16 rounded-xl bg-panelHi mt-1" />
                <div className="h-3 w-12 rounded-xl bg-panelHi mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // Phase 7 D4 preset-picker submit path. Persists the user's module
  // selection, marks onboarding done, fires the canonical analytics
  // funnel and bubbles the picks up to App-level navigation. Mirrors
  // `useOnboardingWizardState.finish()` so legacy consumers
  // (onboardingGate) see identical state.
  const handlePicksComplete = useCallback(
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
  // `overscroll-contain` (гасить body-bounce на iOS). `PeekBackdrop`
  // переведено на `fixed inset-0`, тож floating-shapes / blurred
  // bento залишаються в viewport, а splash-блок ковзає над ними.
  // Внутрішній шар — `min-h-full flex items-end sm:items-center`:
  // коли вміст вміщується — картка центрується як раніше; коли
  // overflow — зовнішній скролить і вертикально розкриває і верх
  // (логотип), і низ (auth-кнопка + «Згорнути»).
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
      <PeekBackdrop />
      <div className="relative min-h-full flex items-end sm:items-center justify-center p-4 pb-safe">
        <h1 className="sr-only">{messages.nav.welcome}</h1>
        <div className="w-full max-w-md space-y-3">
          {/* Phase 7 D4 — preset picker replaces the row-based
              OnboardingWizard as the cold-start surface. The wizard
              still ships for tour-replay (Settings → "Подивитись
              екскурсію"); only this `/welcome` entry point swaps. */}
          <WelcomeModulePicker
            onComplete={handlePicksComplete}
            onOpenAuth={handleOpenAuth}
          />
        </div>
      </div>
    </main>
  );
}
