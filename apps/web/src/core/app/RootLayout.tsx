import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@shared/hooks/useTheme";
import { useKeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { useCommandPaletteHotkey } from "@shared/components/ui/CommandPalette";
import { SkipLink } from "@shared/components/ui/SkipLink";
import { useAuth } from "../auth/AuthContext";
import { useActivationV2Boot } from "../activation";
import { NpsSurveyGate } from "../feedback/useNpsSurveyTrigger";
import { AppLock } from "../security/AppLock";
import { useAppLockContext } from "../security/AppLockContext";
import { setFlag, useFlag } from "../lib/featureFlags";
import { useDemoCommands } from "./useDemoCommands";
import { HubChatOverlay } from "../hub/HubChatOverlay";
import { DemoModeBadge } from "../onboarding/DemoModeBadge";
import {
  HubChatOverlayProvider,
  useHubChatOverlay,
  useHubChatOverlayState,
} from "../hub/useHubChatOverlay";
import { SIGN_IN_PATH, titleForPath } from "./appPaths";
import { useHubKeyboardShortcuts } from "../hooks/useHubKeyboardShortcuts";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import { useHubNavigation } from "../hooks/useHubNavigation";
import { useHubUIState } from "../hooks/useHubUIState";
import { usePwaActions } from "../hooks/usePwaActions";
import { useAppEffects } from "./useAppEffects";
import { useIosInstallBanner } from "./useIosInstallBanner";
import { usePwaInstall } from "./usePwaInstall";
import { useSWUpdate } from "./useSWUpdate";
// AI-CONTEXT: чотири модульні boot-кластери — ЛІНИВІ, і це не
// оптимізація «про всяк випадок». Вони самі по собі невидимі
// (рендерять `null`, працюють лише під автентифікованою чи demo-сесією),
// тож на них ніщо не чекає очима. Але статично вони дотягувались до
// `core/db/sqlite.ts` і `@sergeant/db-schema/sqlite`, а ті імпортують
// `drizzle-orm` — який `manualChunks` склеює в ОДИН чанк `vendor-sqlite`.
// Через це рівно одне eager-ребро звідси клало ~69 kB brotli на критичний
// шлях. Розбір: `docs/90-work/tech-debt/frontend.md` § eager-бюджет.
const NutritionBootCluster = lazy(
  () => import("../../modules/nutrition/hooks/NutritionBootCluster"),
);
const FinykBootCluster = lazy(
  () => import("../../modules/finyk/hooks/FinykBootCluster"),
);
const FizrukBootCluster = lazy(
  () => import("../../modules/fizruk/hooks/FizrukBootCluster"),
);
const RoutineBootCluster = lazy(
  () => import("../../modules/routine/hooks/RoutineBootCluster"),
);
import { useProfileWriteThroughBoot } from "../profile/useProfileWriteThroughBoot";
import { useAnalyticsConsentBoot } from "../observability/useAnalyticsConsentBoot";
import { useActiveModulesSync } from "../hub/useActiveModulesSync";
import { HubShellProvider, type HubShellValue } from "./HubShellContext";
import { ErrorBoundary } from "../ErrorBoundary";

// Side-effect-only children rendered for EVERY session — автентизованої,
// демо й анонімної. Всі вкладені boot-хуки резолвлять свій storage-id через
// `useLocalUserId`, а він покриває всі три випадки (auth-id, синтетичний
// `demo-local`, `LOCAL_ANON_USER_ID`), тож монтування прогріває SQLite
// read-кеш, на який спираються екрани модуля — і транзитивно картки Hub
// Reports, що читають той самий кеш, не відкриваючи модуль.
//
// Fizruk and Routine previously only booted their SQLite read path inside
// their own module shell (`FizrukApp.tsx`, `useRoutineAppState.ts`), so the
// Hub Reports "Тренування" / "Звички" cards — which read the same warm
// cache directly — stayed empty until the user opened that module at least
// once. Finyk's read/mirror boots likewise rebuild the derived Hub
// quick-stats snapshot after login.
//
// Each cluster renders `null` and is gated behind `<Suspense fallback={null}>`,
// so the extra async hop costs no visible render — only a short delay before
// the warm cache starts filling.
// Each cluster gets its own Suspense boundary so a chunk that fails to load
// only costs that module its warm cache, not all four.
// Гейта по auth тут свідомо НЕМАЄ, і це не недогляд.
//
// Донедавна стояло `if (!user && !isDemoActive()) return null` — точне
// дзеркало того, що `useLocalUserId` умів на момент написання: auth-id або
// синтетичний `demo-local`. Спека `anonymous-local-first-persistence.md`
// додала третій випадок, `LOCAL_ANON_USER_ID`, оновила резолвер — і лишила
// дзеркало. Два місця з одним предикатом розійшлись, як і мали.
//
// Ціна розходження: анонімний відвідувач не монтував жодного boot-хука, тож
// dual-write контекст не реєструвався, і FTUX-пресет на хабі («Яку звичку
// почнемо?») ДЕТЕРМІНОВАНО падав у «Не вдалося зберегти» — головна кнопка
// першого досвіду не мала куди писати. Знахідка founder-а 2026-08-10.
//
// Дублювати предикат не треба взагалі: кожен із семи хуків усередині
// кластерів уже виходить на `!userId`, а `useLocalUserId` віддає `null`
// рівно поки сесія в польоті. Тобто «не бутити, доки не знаємо id» тримає
// сам резолвер — на один рівень нижче, де його неможливо забути оновити.
function BootGate({ children }: { children: ReactNode }) {
  /*
    AI-DANGER: `Suspense` тут НЕ досить, і це поширена хиба. Він ловить
    лише ОЧІКУВАННЯ лінивого імпорту; ВІДХИЛЕНИЙ `React.lazy` кидає далі
    вгору — тобто збій одного чанка дійшов би до зовнішнього boundary й
    міг знести всю оболонку. А кластер тут невидимий: ціна його падіння
    мусить бути «цей модуль не прогрів кеш», не «застосунок зник».

    `ErrorBoundary` заразом дає stale-bundle recovery: після деплою старий
    таб має старі хеші чанків, і `isChunkLoadError` вмикає одноразовий
    `location.reload()` з cooldown-ом. Тобто найчастіший випадок збою
    лікується сам, а не тихо лишає модуль без кешу.
  */
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * App shell wrapper — renders global UI (AppLock, HubChatOverlay,
 * NutritionBootGate) around the child route content. The `HubChatOverlay`
 * provider is owned by `RootLayout` (above this component) so the overlay
 * state is shared with `RootLayout`'s own consumers — see that component's
 * docstring.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const appLock = useAppLockContext();
  // Write-through reconcile for `hub_biometrics_v1` ↔ `/api/me/profile`.
  // Self-gating: власний `useQuery` стоїть `enabled: false`, поки сесії
  // немає, тож хук монтується беззастережно — демо- й анонімним сесіям
  // просто нема з чим звірятись на сервері. Модульні boot-кластери нижче
  // тепер тримаються того самого принципу: гейт живе всередині, а не
  // дублюється предикатом зовні (див. коментар над `BootGate`).
  useProfileWriteThroughBoot();
  // Hydrates the synchronous `analyticsConsent` gate from the server as
  // soon as possible after an authenticated boot (CodeRabbit PR #627) —
  // see `useAnalyticsConsentBoot`'s doc comment for the race it closes.
  useAnalyticsConsentBoot();
  // Зводить вибір модулів між акаунтом і пристроєм (аудит 2026-08-05,
  // знахідка B2): без цього той самий акаунт на новому пристрої бачив
  // хаб із дефолтом «усі чотири» замість власного вибору.
  useActiveModulesSync();
  return (
    <>
      {/* Single app-wide skip-link — first focusable on EVERY route
          (hub, modules, and all standalone surfaces via <Outlet/>), so
          keyboard/SR users jump straight to the page's <main id="main">.
          Module/Hub shells no longer render their own (would duplicate). */}
      <SkipLink />
      <AppLock
        state={appLock.state}
        onUnlock={appLock.unlock}
        onSavePin={appLock.savePin}
        onSetupDone={appLock.finishSetup}
        onSetupCancel={() => {
          setFlag("app-lock-enabled", false);
          appLock.finishSetup();
        }}
        // Скасування "change PIN" не повинно чіпати вмикач блокування —
        // стара PIN лишається в сховищі валідною, тож просто закриваємо
        // діалог (audit L-6: раніше обидва режими ділили один хендлер, і
        // скасування зміни PIN тихо гасило захист повністю).
        onChangeCancel={appLock.finishSetup}
      />
      <BootGate>
        <NutritionBootCluster />
      </BootGate>
      <BootGate>
        <FinykBootCluster />
      </BootGate>
      <BootGate>
        <FizrukBootCluster />
      </BootGate>
      <BootGate>
        <RoutineBootCluster />
      </BootGate>
      <NpsSurveyGate />
      <DemoModeBadge />
      {children}
      <HubChatOverlay />
    </>
  );
}

/**
 * Outer layout route component (initiative 0006 Phase 5).
 *
 * Owns the HubChat overlay state and provides it ABOVE `RootLayoutInner`, so
 * every consumer inside the layout — the `useAppEffects` `openChat` hub-bus
 * listener, `hubShellValue.openAssistantChat`, and the `<HubChatOverlay/>`
 * sheet — shares one state. Previously the provider was created inside
 * `AppShell` (a descendant of these consumers), so they bound to the noop
 * fallback and the assistant FAB / Ctrl+/ shortcut never opened the overlay.
 */
export function RootLayout() {
  const chatOverlay = useHubChatOverlayState();
  return (
    <HubChatOverlayProvider value={chatOverlay}>
      <RootLayoutInner />
    </HubChatOverlayProvider>
  );
}

/**
 * Inner layout body. Runs global effects once, then renders matched child
 * routes via `<Outlet />`. Each child route gets a **different** component,
 * which fixes the React Router 7 location-context propagation bug
 * (mixed-shape match objects when multiple routes resolve to the same
 * `<App />`).
 *
 * Shared state (navigation, UI, PWA actions, auth) is provided via
 * `HubShellContext` so child routes don't need to call these hooks
 * independently.
 */
function RootLayoutInner() {
  const location = useLocation();
  const browserLocation = useBrowserLocation(location);
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(browserLocation.search);

  // Navigation FSM — determines activeModule from URL.
  // Destructure the individually-stable members up-front: `useHubNavigation`
  // returns a fresh object literal each render, so depending on `navigation`
  // wholesale would invalidate the memoized callbacks below every render
  // (and re-register the keyboard-shortcut listeners). The members are the
  // correct, stable dependency set — `goToHub`/`openModule`/`goToModuleSettings`
  // are `useCallback`-wrapped and `activeModule` is primitive state.
  const navigation = useHubNavigation();
  const {
    activeModule,
    openModule,
    goToHub,
    goBackOrHub,
    goToModuleSettings,
    moduleAnimClass,
  } = navigation;

  // Hub UI state (search, hub view tab)
  const ui = useHubUIState();

  // PWA shortcut actions (from URL or localStorage)
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const { pwaAction, setPwaAction, clearPwaAction, validActions } =
    usePwaActions(searchParams);

  // Global side effects
  useTheme();
  useActivationV2Boot();

  // Keep the tab title pinned per route on every navigation. The static
  // <title> in index.html is set once at load; some sub-routes (e.g.
  // /nutrition/log) were observed dropping it, so the browser fell back to
  // showing the raw URL. `titleForPath` resolves a route-specific title
  // (`/status`, `/chat`) and falls back to the generic app name for every
  // other route — module shells, the hub home, and the 404.
  useEffect(() => {
    const nextTitle = titleForPath(location.pathname);
    if (document.title !== nextTitle) {
      document.title = nextTitle;
    }
  }, [location.pathname]);

  // Registers the `?` hotkey for keyboard shortcuts modal (side-effect only).
  useKeyboardShortcutsModal();
  const { openChat: openAssistantChat } = useHubChatOverlay();
  const { canInstall, install, dismiss } = usePwaInstall();
  const { visible: iosVisible, dismiss: iosDismiss } = useIosInstallBanner();
  const { updateAvailable, applyUpdate } = useSWUpdate();
  const { user, isLoading: authLoading } = useAuth();

  // App-level effects (idle prefetch, SW messages, hub bus, etc.)
  useAppEffects({
    user,
    authLoading,
    ui,
    openModule,
    navigate,
    setPwaAction,
    validActions,
  });

  // Auth callback
  const openAuth = useCallback(() => navigate(SIGN_IN_PATH), [navigate]);

  // Keyboard shortcuts (work on all routes — hub + modules)
  const openSearchFromShortcut = useCallback(() => {
    if (activeModule) {
      goToHub();
      requestAnimationFrame(() => ui.setSearchOpen(true));
      return;
    }
    ui.setSearchOpen(true);
  }, [activeModule, goToHub, ui]);

  const handleNavigateChord = useCallback(
    (target: import("../hooks/useHubKeyboardShortcuts").NavChordTarget) => {
      if (target === "hub") {
        goToHub();
      } else {
        openModule(target);
      }
    },
    [goToHub, openModule],
  );

  useHubKeyboardShortcuts({
    onOpenSearch: openSearchFromShortcut,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onOpenAssistant: openAssistantChat,
    onNavigate: handleNavigateChord,
  });

  // Command palette (⌘K)
  const paletteEnabled = useFlag("hub_command_palette");
  useCommandPaletteHotkey(paletteEnabled);
  useDemoCommands();

  // Build the context value for child routes
  const hubShellValue: HubShellValue = {
    activeModule,
    openModule,
    goToHub,
    goBackOrHub,
    goToModuleSettings,
    moduleAnimClass,
    ui,
    pwaAction,
    clearPwaAction,
    user,
    authLoading,
    shortcutsOpen,
    onCloseShortcuts: closeShortcuts,
    canInstall,
    onInstall: install,
    onDismissInstall: dismiss,
    iosVisible,
    onDismissIos: iosDismiss,
    updateAvailable,
    onApplyUpdate: applyUpdate,
    openAssistantChat,
    onOpenAuth: openAuth,
  };

  return (
    <HubShellProvider value={hubShellValue}>
      <AppShell>
        <Outlet />
      </AppShell>
    </HubShellProvider>
  );
}
