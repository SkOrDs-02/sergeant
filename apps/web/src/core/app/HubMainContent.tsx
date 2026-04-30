import { memo } from "react";
import { type User } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { ErrorBoundary } from "../ErrorBoundary";
import { HubDashboard } from "../hub/HubDashboard";
import { HubReports } from "../hub/HubReports";
import { HubSettingsPage } from "../hub/HubSettingsPage";
import { ProfilePage } from "../profile/ProfilePage";
import type { OpenModuleOptions } from "../hooks/useHubNavigation";
import type { HubView } from "../hooks/useHubUIState";
import { IOSInstallBanner } from "./IOSInstallBanner";

interface HubSectionFallbackProps {
  resetError: () => void;
}

// Дешевий inline-fallback для секцій хаба: повідомляємо про збій і
// даємо кнопку `reset`, щоб спробувати перемонтувати секцію без
// перезавантаження вкладки. Шапка/таби лишаються робочими, бо
// ErrorBoundary стоїть навколо окремого view, а не навколо `<main>`.
function HubSectionFallback({ resetError }: HubSectionFallbackProps) {
  return (
    <div className="px-1 py-6 text-center">
      <p className="text-sm text-muted mb-3">Щось пішло не так у цій секції.</p>
      <button
        type="button"
        onClick={resetError}
        className="px-4 py-2 rounded-xl bg-panel border border-line text-text text-sm font-medium hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Спробувати ще раз
      </button>
    </div>
  );
}

export interface HubMainContentProps {
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  canInstall: boolean;
  onInstall: () => Promise<void>;
  onDismissInstall: () => void;
  onOpenModule: (
    id: string | null | undefined,
    opts?: OpenModuleOptions,
  ) => void;
  iosVisible: boolean;
  onDismissIos: () => void;
  hubView: HubView;
  onOpenChat: () => void;
  syncing: boolean;
  onSync: () => void;
  onPull: () => void;
  user: User | null;
  onShowAuth: () => void;
  inFtuxSession?: boolean;
}

export const HubMainContent = memo(function HubMainContent({
  updateAvailable,
  onApplyUpdate,
  canInstall,
  onInstall,
  onDismissInstall,
  onOpenModule,
  iosVisible,
  onDismissIos,
  hubView,
  onOpenChat,
  syncing,
  onSync,
  onPull,
  user,
  onShowAuth,
  inFtuxSession = false,
}: HubMainContentProps) {
  // Banner budget: at most one chrome banner above the hub content.
  // Priority: update > install (PWA) > iOS install.
  //
  // During the FTUX session — between the splash and the user's first
  // real (non-demo) entry — we suppress all three so the dashboard
  // delivers one signal: the FirstActionRow. Otherwise a first-time
  // install would see update + install + iOS stack three chrome rows
  // before any data is visible, which contradicts the 30-second
  // promise. Banners rehydrate the moment the user logs their first
  // real entry (see `isFirstRealEntryDone`).
  const showUpdate = !inFtuxSession && !!updateAvailable;
  const showInstall = !inFtuxSession && !showUpdate && !!canInstall;
  const showIos = !inFtuxSession && !showUpdate && !showInstall && iosVisible;

  return (
    <>
      {showUpdate && (
        <div className="px-5 max-w-lg mx-auto w-full mb-2">
          <div className="px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary shrink-0"
              aria-hidden
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span className="text-sm text-text flex-1">
              Доступна нова версія
            </span>
            <button
              onClick={onApplyUpdate}
              className="text-sm font-semibold text-primary hover:underline shrink-0"
            >
              Оновити
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <div className="px-5 max-w-lg mx-auto w-full mb-2">
          <Card
            variant="default"
            radius="lg"
            padding="none"
            className="px-4 py-3 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">
                Встановити додаток
              </p>
              <p className="text-xs text-muted">
                Офлайн · пуш-нагадування · ярлик на ��крані
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={onInstall}
              className="shrink-0 font-semibold"
            >
              Так
            </Button>
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={onDismissInstall}
              aria-label="Закрити"
              className="shrink-0 text-muted hover:text-text"
            >
              <Icon name="close" size={16} />
            </Button>
          </Card>
        </div>
      )}

      {showIos && <IOSInstallBanner onDismiss={onDismissIos} />}

      <main
        id="main"
        tabIndex={-1}
        className="flex-1 px-5 pb-28 max-w-lg mx-auto w-full overflow-y-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-inset"
      >
        {hubView === "dashboard" && (
          <ErrorBoundary key="dashboard" fallback={HubSectionFallback}>
            <div className="flex flex-col gap-5 pt-2">
              <HubDashboard
                onOpenModule={onOpenModule}
                onOpenChat={onOpenChat}
                user={user}
                onShowAuth={onShowAuth}
              />
            </div>
          </ErrorBoundary>
        )}

        {hubView === "reports" && (
          <ErrorBoundary key="reports" fallback={HubSectionFallback}>
            <div className="pt-2">
              <HubReports />
            </div>
          </ErrorBoundary>
        )}

        {hubView === "profile" && (
          <ErrorBoundary key="profile" fallback={HubSectionFallback}>
            <div className="pt-2">
              <ProfilePage />
            </div>
          </ErrorBoundary>
        )}

        {hubView === "settings" && (
          <ErrorBoundary key="settings" fallback={HubSectionFallback}>
            <HubSettingsPage
              syncing={syncing}
              onSync={onSync}
              onPull={onPull}
              user={user}
            />
          </ErrorBoundary>
        )}
      </main>
    </>
  );
});
