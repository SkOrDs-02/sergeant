import { memo, Suspense, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type User } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { ErrorBoundary } from "../ErrorBoundary";
import { HubDashboard } from "../hub/HubDashboard";
import { lazyImport } from "../lib/lazyImport";
import type { OpenModuleOptions } from "../hooks/useHubNavigation";
import type { HubView } from "../hooks/useHubUIState";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { PageLoader } from "./PageLoader";
import { coachKeys, digestKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { IOSInstallBanner } from "./IOSInstallBanner";

// Profile/Reports/Settings code-split out of the main hub bundle. Static
// imports defeat `useRoutePrefetch.prefetchPage("profile")` (Vite warns
// `INEFFECTIVE_DYNAMIC_IMPORT` and bakes the page into the eager chunk
// anyway) and inflate the synchronous shell — see
// `docs/audits/2026-05-07-full-app-regression-ux-audit.md` item 9.
// `HubDashboard` stays eager because it's the default view shown on
// first paint; the other three are only mounted after a tab change
// inside the same hub route. Profile's import path matches
// `useRoutePrefetch.ts:52` verbatim so Rollup dedupes onto a single
// chunk.
const ProfilePage = lazyImport(
  () => import("../profile/ProfilePage"),
  "ProfilePage",
);
const HubReports = lazyImport(() => import("../hub/HubReports"), "HubReports");
const HubSettingsPage = lazyImport(
  () => import("../hub/HubSettingsPage"),
  "HubSettingsPage",
);

interface HubSectionFallbackProps {
  resetError: () => void;
}

interface HubChromeBannerProps {
  iconName: string;
  title: string;
  description?: string;
  children: ReactNode;
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
        className="px-4 py-2 rounded-xl bg-panel border border-line text-text text-style-label hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Спробувати ще раз
      </button>
    </div>
  );
}

function HubChromeBanner({
  iconName,
  title,
  description,
  children,
}: HubChromeBannerProps) {
  return (
    <div className="px-5 max-w-lg mx-auto w-full mb-2">
      <Card
        variant="default"
        radius="lg"
        padding="none"
        className="px-4 py-3 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon name={iconName} size={20} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-style-label text-text">{title}</p>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {children}
      </Card>
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
  user,
  onShowAuth,
  inFtuxSession = false,
}: HubMainContentProps) {
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: coachKeys.all }),
      queryClient.invalidateQueries({ queryKey: digestKeys.all }),
      queryClient.invalidateQueries({ queryKey: hubKeys.all }),
    ]);
  }, [queryClient]);

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
        <HubChromeBanner iconName="refresh-cw" title="Доступна нова версія">
          <Button
            variant="secondary"
            size="xs"
            onClick={onApplyUpdate}
            className="shrink-0 font-semibold"
          >
            Оновити
          </Button>
        </HubChromeBanner>
      )}

      {showInstall && (
        <HubChromeBanner
          iconName="download"
          title="Встановити додаток"
          description="Офлайн · пуш-нагадування · ярлик на екрані"
        >
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
        </HubChromeBanner>
      )}

      {showIos && <IOSInstallBanner onDismiss={onDismissIos} />}

      <PullToRefresh
        as="main"
        id="main"
        tabIndex={-1}
        className="max-w-lg mx-auto w-full rounded-xl focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-inset"
        contentClassName="px-5 pb-28"
        onRefresh={handleRefresh}
        variant="default"
      >
        {hubView === "dashboard" && (
          <ErrorBoundary key="dashboard" fallback={HubSectionFallback}>
            <div
              id="hub-panel-dashboard"
              role="tabpanel"
              aria-labelledby="hub-tab-dashboard"
              className="flex flex-col gap-5 pt-2"
            >
              <HubDashboard
                onOpenModule={onOpenModule}
                user={user}
                onShowAuth={onShowAuth}
              />
            </div>
          </ErrorBoundary>
        )}

        {hubView === "reports" && (
          <ErrorBoundary key="reports" fallback={HubSectionFallback}>
            <div
              id="hub-panel-reports"
              role="tabpanel"
              aria-labelledby="hub-tab-reports"
              className="pt-2"
            >
              <Suspense fallback={<PageLoader />}>
                <HubReports />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}

        {hubView === "profile" && (
          <ErrorBoundary key="profile" fallback={HubSectionFallback}>
            <div
              id="hub-panel-profile"
              role="tabpanel"
              aria-labelledby="hub-tab-profile"
              className="pt-2"
            >
              <Suspense fallback={<PageLoader />}>
                <ProfilePage />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}

        {hubView === "settings" && (
          <ErrorBoundary key="settings" fallback={HubSectionFallback}>
            <div
              id="hub-panel-settings"
              role="tabpanel"
              aria-labelledby="hub-tab-settings"
            >
              <Suspense fallback={<PageLoader />}>
                <HubSettingsPage user={user} />
              </Suspense>
            </div>
          </ErrorBoundary>
        )}
      </PullToRefresh>
    </>
  );
});
