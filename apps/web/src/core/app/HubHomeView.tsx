import { type CSSProperties } from "react";
import { type User } from "@sergeant/shared";
import { SkipLink } from "@shared/components/ui/SkipLink";
import { KeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { AIPill } from "@shared/components/ui/AIPill";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";
import { HubBottomNav } from "./HubBottomNav";
import { HubHeader } from "./HubHeader";
import { HubMainContent } from "./HubMainContent";
import { HubModals } from "./HubModals";
import { OfflineBanner } from "./OfflineBanner";
import { HintsOrchestrator } from "../hints/HintsOrchestrator";
import { hasAnyRealEntry } from "../onboarding/firstRealEntry";
import { isFirstRealEntryDone } from "../onboarding/vibePicks";
import { shouldShowOnboarding } from "../onboarding/onboardingGate";
import { WhatsNewModal, useWhatsNew } from "../whatsNew";
import type { HubNavigation } from "../hooks/useHubNavigation";
import type { HubUIState } from "../hooks/useHubUIState";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";

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
  const whatsNew = useWhatsNew({
    enabled: hasFirstRealEntry && !inFtuxSession,
  });

  return (
    // Sergeant v2 redesign (2026-05, PR-5) — wraps the hub shell in
    // <MeshBackground> so the mesh-gradient surface (`.bg-mesh` utility
    // from theme.css) renders behind all hub content. `h-dvh flex flex-col
    // overflow-hidden` is baked into MeshBackground; the remaining
    // `safe-area-pt page-enter` slot through as className.
    // Sergeant v2 redesign Phase 1 (T6 synergy) — exposes
    // `--bottom-nav-height` so portaled <Sheet>s and the AIPill below
    // resolve their `var(--bottom-nav-height, 0px)` calc against a real
    // 60px floor instead of 0px. Closes M4 + M6 (Sheet positioning on
    // hub) with the same single edit. The 60px matches the inner
    // `h-[60px]` track of HubBottomNav (see HubBottomNav.tsx tablist).
    <MeshBackground
      className="safe-area-pt page-enter"
      style={{ "--bottom-nav-height": "60px" } as CSSProperties}
    >
      <SkipLink />
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
      />

      <HubMainContent
        updateAvailable={updateAvailable}
        onApplyUpdate={onApplyUpdate}
        canInstall={canInstall}
        onInstall={onInstall}
        onDismissInstall={onDismissInstall}
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
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />
      <WhatsNewModal
        open={whatsNew.open}
        release={whatsNew.release}
        onClose={whatsNew.onClose}
        onCtaClick={whatsNew.onCtaClick}
      />

      {/* Sergeant v2 redesign (2026-05, PR-7b) — persistent AI-assistant
          pill replaces the previous sparkle FAB. Shown only on the
          dashboard tab + hidden during FTUX so the first-action signal
          stays the single CTA. `bottom={96}` lifts the pill above the
          floating glass HubBottomNav (which sits at `mb-3` with ~60px
          inner height). `module={null}` selects the hub-level
          placeholder copy ("Запитай Sergeant…"). AIPill itself owns the
          navigate(CHAT_PATH) handler — caller doesn't need to plumb it. */}
      {ui.hubView === "dashboard" && !inFtuxSession && (
        <AIPill module={null} bottom={96} />
      )}
    </MeshBackground>
  );
}
