import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@shared/lib/ui/cn";
import { type User } from "@sergeant/shared";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { ErrorBoundary } from "../ErrorBoundary";
import { HubDashboard } from "../hub/HubDashboard";
import { lazyImport } from "../lib/lazyImport";
import {
  beginHubTabSwitch,
  endHubTabSwitch,
  type TrackedHubTab,
} from "../lib/hubPerf";
import type { OpenModuleOptions } from "../hooks/useHubNavigation";
import type { HubView } from "../hooks/useHubUIState";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { PageLoader } from "./PageLoader";
import { coachKeys, digestKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { messages } from "@shared/i18n/uk";
import { IOSInstallBanner } from "./IOSInstallBanner";
import { LocalOnlyDataBanner } from "../durability/LocalOnlyDataBanner";
import { HubBannerBudgetProvider } from "../hub/bannerBudget";
import { TrialBanner } from "../billing";

/**
 * Mounts only after the parent Suspense boundary resolves. Inside a
 * `useEffect` we defer through two `requestAnimationFrame` ticks so
 * the browser has had a chance to commit + paint the actual panel
 * content — the resulting `ttiMs` reflects post-paint reachability,
 * not just commit time. See [Initiative 0017](../../../docs/initiatives/0017-hub-tabs-mount-perf.md).
 */
function TabReadyProbe({ tab }: { tab: TrackedHubTab }) {
  useEffect(() => {
    let innerHandle: number | null = null;
    const outerHandle = requestAnimationFrame(() => {
      innerHandle = requestAnimationFrame(() => {
        endHubTabSwitch(tab);
      });
    });
    return () => {
      cancelAnimationFrame(outerHandle);
      if (innerHandle !== null) cancelAnimationFrame(innerHandle);
    };
  }, [tab]);
  return null;
}

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

// Дешевий inline-fallback для секцій хаба: повідомляємо про збій і
// даємо кнопку `reset`, щоб спробувати перемонтувати секцію без
// перезавантаження вкладки. Шапка/таби лишаються робочими, бо
// ErrorBoundary стоїть навколо окремого view, а не навколо `<main>`.
function HubSectionFallback({ resetError }: HubSectionFallbackProps) {
  return (
    <div className="px-1 py-6 text-center">
      <p className="text-style-body text-muted mb-3">
        Не вдалося показати цю секцію. Натисни «Спробувати ще раз».
      </p>
      <button
        type="button"
        onClick={resetError}
        className="px-4 py-2 rounded-xl bg-panel border border-line text-text text-style-label hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Спробувати ще раз
      </button>
    </div>
  );
}

export interface HubMainContentProps {
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
  onOpenModule,
  iosVisible,
  onDismissIos,
  hubView,
  user,
  onShowAuth,
  inFtuxSession = false,
}: HubMainContentProps) {
  const queryClient = useQueryClient();

  // Per-tab scroll persistence. Кожна hub-вкладка запамʼятовує свою
  // позицію скролу; при поверненні на вкладку її прокрутку відновлюємо
  // замість жорсткого скидання на верх (UX-пропозиція 2026-07: юзер, що
  // заходить у хаб десятки разів на день, повертається туди, де був).
  //
  // Скрол читаємо/пишемо на внутрішньому контейнері `PullToRefresh`
  // (реальний скролер) — `window.scrollTo` тут не працює, бо `#root`
  // володіє точною висотою viewport-а, а `HubHomeView` — `overflow-hidden`.
  // На iOS Safari / Capacitor виклик document-скролу тригерив visual-
  // viewport jump, що зіштовхував bottom-nav (user feedback 2026-05-13),
  // тому лишаємось строго на контейнері.
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const prevHubViewRef = useRef<HubView | null>(null);
  // Позиції скролу по кожній вкладці (best-effort, тримаємо в памʼяті на
  // час маунту хаба — не персистимо у storage, щоб холодний старт завжди
  // відкривав дашборд згори).
  const scrollPositionsRef = useRef<Map<HubView, number>>(new Map());
  // «Жива» вкладка для scroll-listener-а: він пише позицію саме тієї
  // вкладки, що зараз на екрані, а не тієї, на яку ми щойно перемкнулись.
  const liveViewRef = useRef<HubView>(hubView);
  const handleScrollElement = useCallback((el: HTMLDivElement | null) => {
    scrollElRef.current = el;
    setScrollElement(el);
  }, []);

  // Безперервно фіксуємо позицію активної вкладки — так до моменту
  // перемикання ми вже маємо збережений `scrollTop` вихідної вкладки.
  useEffect(() => {
    const el = scrollElement;
    if (!el) return;
    const onScroll = () => {
      scrollPositionsRef.current.set(liveViewRef.current, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollElement]);

  useEffect(() => {
    liveViewRef.current = hubView;
    if (prevHubViewRef.current !== null && prevHubViewRef.current !== hubView) {
      const el = scrollElRef.current;
      const saved = scrollPositionsRef.current.get(hubView) ?? 0;
      // Відкладаємо на два rAF, щоб контент нової вкладки встиг
      // змонтуватись/спейнтитись і мав достатню висоту для відновлення
      // (дашборд — eager; reports/profile/settings — lazy через Suspense,
      // де відновлення лишається best-effort до появи контенту).
      const outer = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Миттєве відновлення (не «smooth»): вкладка має відчуватись
          // так, ніби вона лишалась на цій позиції, а не доскролюватись
          // на очах. `top: 0` для першого відкриття вкладки теж має бути
          // без анімації.
          el?.scrollTo({ top: saved, behavior: "auto" });
        });
      });
      prevHubViewRef.current = hubView;
      return () => cancelAnimationFrame(outer);
    }
    prevHubViewRef.current = hubView;
    return undefined;
  }, [hubView]);

  // Initiative 0017 Sprint 0 — RUM baseline for hub tab switches.
  useEffect(() => {
    if (
      hubView === "reports" ||
      hubView === "settings" ||
      hubView === "profile"
    ) {
      beginHubTabSwitch(hubView);
    }
  }, [hubView]);

  // #11 — directional slide choreography between hub tabs.
  // The canonical tab order is: dashboard → reports → profile → settings.
  // Switching to a tab that is further right → slide-in from the right;
  // switching left → slide-in from the left. This mirrors the spatial model
  // of a physical tab strip, matching the user's mental map.
  const HUB_TAB_ORDER: HubView[] = [
    "dashboard",
    "reports",
    "profile",
    "settings",
  ];
  const prevHubViewForAnim = useRef<HubView>(hubView);
  const [slideClass, setSlideClass] = useState<string>("");

  useEffect(() => {
    const prev = prevHubViewForAnim.current;
    if (prev === hubView) return;
    const prevIdx = HUB_TAB_ORDER.indexOf(prev);
    const nextIdx = HUB_TAB_ORDER.indexOf(hubView);
    const goRight = nextIdx > prevIdx;
    setSlideClass(goRight ? "animate-slide-in-right" : "animate-slide-in-left");
    prevHubViewForAnim.current = hubView;
    // Clear the class after the animation completes so re-mounting
    // the same tab doesn't re-trigger the enter keyframe.
    const id = setTimeout(() => setSlideClass(""), 260);
    return () => clearTimeout(id);
    // HUB_TAB_ORDER is a module-level constant — no dep needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `HUB_TAB_ORDER` — module-level константа, dep не потрібен
  }, [hubView]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: coachKeys.all }),
      queryClient.invalidateQueries({ queryKey: digestKeys.all }),
      queryClient.invalidateQueries({ queryKey: hubKeys.all }),
    ]);
  }, [queryClient]);

  // SW-update + PWA-install chrome banners moved to the header bell
  // (`NotificationBell`) as part of the C · Контроль home redesign — they
  // were the loudest inline «шум» above the dashboard. The iOS-install
  // banner keeps its inline placement (bespoke step-by-step instructions
  // that don't compress into a bell row). Suppressed during the FTUX
  // session so the one signal on screen stays the FirstAction CTA.
  const showIos = !inFtuxSession && iosVisible;

  return (
    <>
      {!inFtuxSession && <TrialBanner />}

      {showIos && <IOSInstallBanner onDismiss={onDismissIos} />}

      <PullToRefresh
        as="main"
        id="main"
        tabIndex={-1}
        className="max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full rounded-xl focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-inset"
        contentClassName="px-5 pb-28"
        onRefresh={handleRefresh}
        onScrollElement={handleScrollElement}
        variant="default"
      >
        {hubView === "dashboard" && (
          <ErrorBoundary key="dashboard" fallback={HubSectionFallback}>
            <div
              id="hub-panel-dashboard"
              role="tabpanel"
              aria-labelledby="hub-tab-dashboard"
              className={cn("flex flex-col gap-5 pt-2", slideClass)}
            >
              <h1 className="sr-only">{messages.nav.dashboard}</h1>
              {/* Канон finyk §6.2 — durability. Банер жив лише всередині
                  finyk/Overview, тож відвідувач, який працює в routine,
                  nutrition чи fizruk, не дізнавався, що його дані існують
                  в одному екземплярі на цьому пристрої. Хаб — спільний
                  дах усіх модулів, тож попередження належить сюди.
                  Показуватись чи ні, вирішує сам банер (той самий предикат
                  `isSyncableUserId`, що вимикає запис в outbox), тому гейта
                  на `user` тут немає. Під час FTUX мовчить: перша сесія
                  тримає рівно один сигнал на екрані — CTA першої дії. */}
              {/* Стеля на кількість підказок одночасно — див.
                  `bannerBudget.tsx` (анти-слоп аудит 2026-09-01, F3). */}
              <HubBannerBudgetProvider>
                {!inFtuxSession && (
                  <LocalOnlyDataBanner onSignIn={onShowAuth} />
                )}
                <HubDashboard
                  onOpenModule={onOpenModule}
                  user={user}
                  onShowAuth={onShowAuth}
                />
              </HubBannerBudgetProvider>
            </div>
          </ErrorBoundary>
        )}

        {hubView === "reports" && (
          <ErrorBoundary key="reports" fallback={HubSectionFallback}>
            <div
              id="hub-panel-reports"
              role="tabpanel"
              aria-labelledby="hub-tab-reports"
              className={cn("pt-2", slideClass)}
            >
              <h1 className="sr-only">{messages.nav.reports}</h1>
              <SuspenseWithMinDelay fallback={<PageLoader />}>
                <HubReports />
                <TabReadyProbe tab="reports" />
              </SuspenseWithMinDelay>
            </div>
          </ErrorBoundary>
        )}

        {hubView === "profile" && (
          <ErrorBoundary key="profile" fallback={HubSectionFallback}>
            <div
              id="hub-panel-profile"
              role="tabpanel"
              aria-labelledby="hub-tab-profile"
              // Без `pt-2` — на відміну від dashboard/reports вище (V-10,
              // аудит Профілю/Налаштувань 2026-08-08). Рішення власника —
              // звести Профіль до сітки Налаштувань, а панель Налаштувань
              // теж не має тут відступу: його оголошує сама сторінка
              // (`pt-3` у корені `HubSettingsPage`), і `ProfilePage` тепер
              // повторює ту саму форму. Лишити `pt-2` означало б 20px
              // згори проти 12px у сусідній вкладці — рівно та розбіжність
              // сусідніх вкладок одного хаба, яку V-10 і фіксує, просто
              // переїхала б на рівень вище.
              className={slideClass || undefined}
            >
              <SuspenseWithMinDelay fallback={<PageLoader />}>
                <ProfilePage />
                <TabReadyProbe tab="profile" />
              </SuspenseWithMinDelay>
            </div>
          </ErrorBoundary>
        )}

        {hubView === "settings" && (
          <ErrorBoundary key="settings" fallback={HubSectionFallback}>
            <div
              id="hub-panel-settings"
              role="tabpanel"
              aria-labelledby="hub-tab-settings"
              className={slideClass || undefined}
            >
              <SuspenseWithMinDelay fallback={<PageLoader />}>
                <HubSettingsPage scrollContainer={scrollElement} />
                <TabReadyProbe tab="settings" />
              </SuspenseWithMinDelay>
            </div>
          </ErrorBoundary>
        )}
      </PullToRefresh>
    </>
  );
});
