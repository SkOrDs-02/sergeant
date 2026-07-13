import { Suspense, type CSSProperties } from "react";
import { type User } from "@sergeant/shared";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";
import { HubBottomNav } from "./HubBottomNav";
import { HubHeader } from "./HubHeader";
import { type HubNotification } from "./NotificationBell";
import { HubMainContent } from "./HubMainContent";
import { HubModals } from "./HubModals";
import { OfflineBanner } from "./OfflineBanner";
import { HintsOrchestrator } from "../hints/HintsOrchestrator";
import { hasAnyRealEntry } from "../onboarding/firstRealEntry";
import { isFirstRealEntryDone } from "../onboarding/vibePicks";
import {
  shouldShowOnboarding,
  isDemoActive,
} from "../onboarding/onboardingGate";
import { useWhatsNew } from "../whatsNew";
import { lazyImport } from "../lib/lazyImport";
import type { HubNavigation } from "../hooks/useHubNavigation";
import type { HubUIState } from "../hooks/useHubUIState";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";

// The shortcuts modal body is heavy (portal + focus-trap + key grid) and
// only renders on the `?` hotkey, so it ships as its own chunk and loads
// on first open instead of inflating the entry bundle (initiative 0017).
const KeyboardShortcutsModal = lazyImport(
  () => import("@shared/components/ui/KeyboardShortcutsModalUI"),
  "KeyboardShortcutsModal",
);

// `<WhatsNewModal />` is a returning-user-only overlay gated on the
// enabled/seen flag from `useWhatsNew` — it never renders on cold start
// and stays hidden until the 2.5s timer flips `open`. Lazy-loading its
// body (which pulls in `Modal` + the uk i18n messages) keeps it out of
// the hub entry chunk; the lightweight `useWhatsNew` gate stays eager so
// the open-state wiring is unchanged. `lazyImport` adds the canonical
// stale-chunk recovery contract (see core/lib/lazyImport.ts).
const WhatsNewModal = lazyImport(
  () => import("../whatsNew/WhatsNewModal"),
  "WhatsNewModal",
);

export interface HubHomeViewProps {
  ui: HubUIState;
  user: User | null;
  authLoading: boolean;
  onOpenAuth: () => void;
  canInstall: boolean;
  onInstall: () => Promise<void>;
  onDismissInstall: () => void;
  iosVisible: boolean;
  onDismissIos: () => void;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  openModule: HubNavigation["openModule"];
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;
}

// «No active module» landing surface. Renders the hub header, main
// dashboard/reports/profile content, bottom nav, install / iOS / SW
// banners, the active-workout shortcut, and modal overlays. Computes
// the FTUX-session gate locally so AppInner stays a thin composition
// shell.
export function HubHomeView(props: HubHomeViewProps) {
  const {
    ui,
    user,
    authLoading,
    onOpenAuth,
    canInstall,
    onInstall,
    onDismissInstall,
    iosVisible,
    onDismissIos,
    updateAvailable,
    onApplyUpdate,
    openModule,
    shortcutsOpen,
    onCloseShortcuts,
  } = props;

  // FTUX session = the window between the splash and the user's first
  // real (non-demo) entry. During this window we intentionally
  // suppress PWA install / iOS install / SW update banners and other
  // noisy chrome so the one signal on screen is the FirstActionRow.
  // The update banner comes back the moment a real entry is logged.
  // Important: after the onboarding route is finished, the hub must still
  // allow the user to sign in. Otherwise they can land on the dashboard
  // (no entries yet) with no discoverable auth entry point.
  const hasFirstRealEntry = hasAnyRealEntry();
  const inFtuxSession = !hasFirstRealEntry && !isFirstRealEntryDone();

  // What's new modal — показуємо тільки повертаючимся юзерам, тобто
  // тим, хто вже минув FTUX-window і має `firstRealEntry`. Це
  // консистентно з §3.3 acceptance метрики PR-18:
  // `d7_returning_user_engagement_with_whats_new`. Юзера на cold-start
  // нічого не повинно витискати з outcome-card flow.
  //
  // Demo-режим теж глушимо: `hasAnyRealEntry()` рахує demo-seeded
  // записи як «справжні», тож без цього гейта модал «Що нового»
  // вискакував би одразу при вході в demo («Подивитись приклад») —
  // юзеру, що тільки відкрив приклад і ще нічого не робив, changelog
  // недоречний.
  const whatsNew = useWhatsNew({
    enabled: hasFirstRealEntry && !inFtuxSession && !isDemoActive(),
  });

  // C · Контроль (home redesign 2026-06): system chrome banners (SW update,
  // PWA install) move out of the content flow into the header bell. Suppressed
  // during the FTUX session like the old inline banners were, so the first
  // signal stays the FirstAction CTA. iOS-install + Trial keep their inline
  // banners (bespoke UX).
  const notifications: HubNotification[] = [];
  if (!inFtuxSession && updateAvailable) {
    notifications.push({
      id: "sw-update",
      icon: "refresh-cw",
      title: "Доступна нова версія",
      actionLabel: "Оновити",
      onAction: onApplyUpdate,
    });
  }
  if (!inFtuxSession && canInstall) {
    notifications.push({
      id: "pwa-install",
      icon: "download",
      title: "Встановити додаток",
      description: "Офлайн · пуш-нагадування · ярлик на екрані",
      actionLabel: "Встановити",
      onAction: () => {
        void onInstall();
      },
      onDismiss: onDismissInstall,
    });
  }

  return (
    // Sergeant v2 redesign (2026-05, PR-5) — wraps the hub shell in
    // <MeshBackground> so the mesh-gradient surface (`.bg-mesh` utility
    // from theme.css) renders behind all hub content. `h-dvh flex flex-col
    // overflow-hidden` is baked into MeshBackground; the remaining
    // `safe-area-pt` slots through as className. The full-height shell must
    // not carry `page-enter`: its translateY keyframe creates document-level
    // overflow on iOS and moves bottom-edge hit targets during the gesture.
    // Sergeant v2 redesign Phase 1 (T6 synergy) — exposes
    // `--bottom-nav-height` so portaled <Sheet>s
    // resolve their `var(--bottom-nav-height, 0px)` calc against a real
    // 60px floor instead of 0px. Closes M4 + M6 (Sheet positioning on
    // hub) with the same single edit. The 60px matches the inner
    // `h-[60px]` track of HubBottomNav (see HubBottomNav.tsx tablist); the
    // added `0.375rem` matches `bottom-nav-shell`'s fixed top padding
    // (round-3 UI audit — the round-2 env() mirror was reverted).
    <MeshBackground
      className="safe-area-pt"
      style={
        {
          "--bottom-nav-height": "calc(60px + 0.375rem)",
        } as CSSProperties
      }
    >
      <HintsOrchestrator
        inFtuxSession={inFtuxSession}
        hasFirstRealEntry={hasFirstRealEntry}
      />
      <OfflineBanner />

      <HubHeader
        onOpenSearch={() => ui.setSearchOpen(true)}
        onOpenPrivacy={() => openHubSettingsSection("privacy")}
        user={user}
        authLoading={authLoading}
        onShowAuth={onOpenAuth}
        hideAuthButton={shouldShowOnboarding() && !user && inFtuxSession}
        notifications={notifications}
      />

      <HubMainContent
        onOpenModule={openModule}
        iosVisible={iosVisible}
        onDismissIos={onDismissIos}
        hubView={ui.hubView}
        user={user}
        onShowAuth={onOpenAuth}
        inFtuxSession={inFtuxSession}
      />

      <HubBottomNav
        hubView={ui.hubView}
        onChange={ui.setHubView}
        // UX-feedback 2026-05-08: «Звіти» була прихована до першого
        // реального запису (щоб не показувати порожній екран). Юзери
        // не розуміли, куди зник tab («куди зникла сторінка звіти?»),
        // тому показуємо tab завжди — `HubReports` сам рендерить
        // «Немає даних» empty-state до першого запису.
        showReports
        showProfile={!!user}
        onShowAuth={!user ? onOpenAuth : undefined}
      />

      {/* Persistent shortcut back to an in-progress Fizruk workout.
          Hidden during FTUX so the splash stays single-CTA; otherwise
          visible whenever `fizruk_active_workout_id_v1` is set, so the
          user never loses the thread after jumping to another tab. */}
      <ActiveWorkoutBanner hidden={inFtuxSession} />

      <HubModals
        searchOpen={ui.searchOpen}
        onCloseSearch={ui.closeSearch}
        onOpenModule={openModule}
      />
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal
            open={shortcutsOpen}
            onClose={onCloseShortcuts}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <WhatsNewModal
          open={whatsNew.open}
          release={whatsNew.release}
          onClose={whatsNew.onClose}
          onCtaClick={whatsNew.onCtaClick}
        />
      </Suspense>

      {/* The global AI-assistant entry now lives in <HubHeader> (top-bar,
          brand-tinted sparkle) so it is present on every hub tab and does
          not depend on the dashboard-only FTUX gate. The previous
          dashboard FAB duplicated that entry and was invisible on the
          empty home + reports/profile tabs — user report 2026-07-03. */}
    </MeshBackground>
  );
}
