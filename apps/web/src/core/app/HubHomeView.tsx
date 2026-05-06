import { useNavigate } from "react-router-dom";
import { type User } from "@sergeant/shared";
import { SkipLink } from "@shared/components/ui/SkipLink";
import { KeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";
import { CHAT_PATH } from "./appPaths";
import { HubBottomNav } from "./HubBottomNav";
import { HubHeader } from "./HubHeader";
import { HubMainContent } from "./HubMainContent";
import { HubModals } from "./HubModals";
import { OfflineBanner } from "./OfflineBanner";
import { HintsOrchestrator } from "../hints/HintsOrchestrator";
import { hasAnyRealEntry } from "../onboarding/firstRealEntry";
import { isFirstRealEntryDone } from "../onboarding/vibePicks";
import { shouldShowOnboarding } from "../onboarding/OnboardingWizard";
import { WhatsNewModal, useWhatsNew } from "../whatsNew";
import type { HubNavigation } from "../hooks/useHubNavigation";
import type { HubUIState } from "../hooks/useHubUIState";
import { messages } from "@shared/i18n/uk";

export interface HubHomeViewProps {
  ui: HubUIState;
  user: User | null;
  authLoading: boolean;
  onOpenAuth: () => void;
  dark: boolean;
  onToggleDark: () => void;
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
    dark,
    onToggleDark,
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

  const navigate = useNavigate();

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
    <div className="h-dvh bg-bg flex flex-col overflow-hidden safe-area-pt page-enter">
      <SkipLink />
      <HintsOrchestrator
        inFtuxSession={inFtuxSession}
        hasFirstRealEntry={hasFirstRealEntry}
      />
      <OfflineBanner />

      <HubHeader
        onOpenSearch={() => ui.setSearchOpen(true)}
        user={user}
        authLoading={authLoading}
        onShowAuth={onOpenAuth}
        dark={dark}
        onToggleDark={onToggleDark}
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
        // «Звіти» — пустий екран без даних, тому ховаємо tab до
        // першого реального запису. Якщо юзер уже обрав «Звіти» і
        // потім стер дані — повертаємо його на дашборд, щоб не
        // лишався на неіснуючому табі.
        showReports={hasAnyRealEntry()}
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

      {/* Floating AI-assistant entry. Shown only on the dashboard tab so
          it does not occlude reports / profile content; hidden during
          the FTUX splash window so the first-action signal stays the
          single CTA on screen. Replaces the sparkle icon that briefly
          lived in HubHeader (#1507) — bringing back the original FAB
          chrome the team had pre-#1357 keeps the assistant a one-tap
          target without crowding the header.

          The `bottom-[…]` override lifts the FAB above `HubBottomNav`
          (60 px / 64 px on coarse pointer + safe-area-pb). Without it
          the default `bottom: 1.5rem` lands the FAB on top of the
          «Налаштування» tab. Offset mirrors `ActiveWorkoutBanner`
          (5.25rem + safe-area-inset-bottom) so all hub-level floating
          chrome rises in lockstep above the same nav rail. */}
      {ui.hubView === "dashboard" && !inFtuxSession && (
        <FloatingActionButton
          icon="sparkle"
          onClick={() => navigate(CHAT_PATH)}
          aria-label={messages.nav.openAssistant}
          hideOnScroll
          className="bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
        />
      )}
    </div>
  );
}
