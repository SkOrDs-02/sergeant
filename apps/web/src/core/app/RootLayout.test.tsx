// @vitest-environment jsdom
/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Integration tests for RootLayout — over-mocking refactor.
 *
 * RootLayout composes ~20 hooks + global UI around the child route. The
 * previous version of this file mocked every single one of them (26
 * `vi.mock` calls) and asserted against captured mock-callback refs — none
 * of it exercised RootLayout's real wiring to its collaborators, only its
 * own branching logic against stubs that always behaved exactly as
 * programmed.
 *
 * This version renders the REAL component tree wherever the collaborator
 * has no heavy browser dependency of its own: a real `AuthProvider` backed
 * by a real MSW transport for `/api/v1/me` (mirrors the pattern in
 * `modules/finyk/FinykApp.test.tsx`), a real `AppLockProvider`/`useAppLock`
 * (PIN flag stays off for the whole file, so its IndexedDB/WebCrypto path
 * never fires — see the note on the sqlite mocks below for the analogous
 * reasoning), and real `useHubNavigation` / `useHubUIState` /
 * `useHubKeyboardShortcuts` / `usePwaActions` / `useBrowserLocation` /
 * `useTheme` / `useActivationV2Boot` / `useDemoCommands` / `usePwaInstall` /
 * `useIosInstallBanner` / `useSWUpdate` / `featureFlags`. Every one of
 * those already has its own dedicated unit-test file (e.g.
 * `useHubNavigation.test.tsx`, `useHubKeyboardShortcuts.test.tsx`,
 * `AuthContext.test.tsx`), so this file only needs to prove RootLayout
 * *wires them together correctly* — real keyboard events dispatched
 * through a real `MemoryRouter`, asserted against real DOM/location output
 * via the `ShellProbe` child below (mirrors `HubShellContext`'s real
 * value), not against captured mock refs.
 *
 * Remaining mocks are all either a heavy browser API or UI already
 * covered by dedicated tests elsewhere:
 *   - `useNutritionDualWriteBoot` / `useNutritionSqliteReadBoot` /
 *     `useFinykDualWriteBoot` / `useFinykSqliteReadBoot` /
 *     `useFinykMonoMirrorBoot` / `useFizrukDualWriteBoot` /
 *     `useFizrukSqliteReadBoot` / `useRoutineDualWriteBoot` /
 *     `useSqliteReadBoot` (routine) — real sqlite-wasm/IndexedDB boot
 *     paths. Each already has its own dedicated test (e.g.
 *     `useFinykMonoMirrorBoot.test.tsx`) that mocks the underlying boot
 *     *function* one level down instead of running real SQLite — this
 *     file does the same thing one level up, at the hook boundary, purely
 *     so the auth/demo-gating assertions below stay fast and deterministic.
 *     `useFinykQuickStatsBoot` is intentionally left real: it only reads
 *     in-memory pub-sub caches (no SQLite I/O of its own — see its
 *     source), and is a no-op here because the mocked boots above never
 *     fire the cache-refresh notifications it listens for.
 *   - `AppLock` — heavy PIN/biometric UI, covered by `AppLock.test.tsx` /
 *     `AppLockContext.test.tsx`.
 *   - `HubChatOverlay` — heavy chat/AI overlay, covered by
 *     `HubChatOverlay.test.tsx`.
 *   - `useAppEffects` — fires idle-prefetch `import()`s of the full
 *     module apps (Finyk/Fizruk/Routine/Nutrition + settings/reports
 *     pages) on mount. jsdom has no `navigator.connection`, so
 *     `shouldPrefetchOnConnection()` fails open and the real hook would
 *     pull the entire lazy-chunk graph into every test in this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { http, HttpResponse } from "msw";
import { meFixtures } from "@sergeant/shared";

import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { server } from "../../test/msw/server";
import { AuthProvider } from "../auth/AuthContext";
import { AppLockProvider } from "../security/AppLockContext";
import * as featureFlags from "../lib/featureFlags";
import { DEMO_FLAG_KEY } from "../onboarding/seedDemoData/keys";
import { useHubShell } from "./HubShellContext";

const {
  useNutritionDualWriteBootMock,
  useNutritionSqliteReadBootMock,
  useFinykDualWriteBootMock,
  useFinykSqliteReadBootMock,
  useFinykMonoMirrorBootMock,
  useFizrukDualWriteBootMock,
  useFizrukSqliteReadBootMock,
  useRoutineDualWriteBootMock,
  useRoutineSqliteReadBootMock,
} = vi.hoisted(() => ({
  useNutritionDualWriteBootMock: vi.fn(),
  useNutritionSqliteReadBootMock: vi.fn(),
  useFinykDualWriteBootMock: vi.fn(),
  useFinykSqliteReadBootMock: vi.fn(),
  useFinykMonoMirrorBootMock: vi.fn(),
  useFizrukDualWriteBootMock: vi.fn(),
  useFizrukSqliteReadBootMock: vi.fn(),
  useRoutineDualWriteBootMock: vi.fn(),
  useRoutineSqliteReadBootMock: vi.fn(),
}));

// ── Heavy browser API (real sqlite-wasm/IndexedDB boot pipeline) — see
// file docstring. `useFinykQuickStatsBoot` is intentionally NOT mocked.
vi.mock("../../modules/nutrition/hooks/useNutritionDualWriteBoot", () => ({
  useNutritionDualWriteBoot: () => useNutritionDualWriteBootMock(),
}));
vi.mock("../../modules/nutrition/hooks/useNutritionSqliteReadBoot", () => ({
  useNutritionSqliteReadBoot: () => useNutritionSqliteReadBootMock(),
}));
vi.mock("../../modules/finyk/hooks/useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: () => useFinykDualWriteBootMock(),
}));
vi.mock("../../modules/finyk/hooks/useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: () => useFinykSqliteReadBootMock(),
}));
vi.mock("../../modules/finyk/hooks/useFinykMonoMirrorBoot", () => ({
  useFinykMonoMirrorBoot: () => useFinykMonoMirrorBootMock(),
}));
vi.mock("../../modules/fizruk/hooks/useFizrukDualWriteBoot", () => ({
  useFizrukDualWriteBoot: () => useFizrukDualWriteBootMock(),
}));
vi.mock("../../modules/fizruk/hooks/useFizrukSqliteReadBoot", () => ({
  useFizrukSqliteReadBoot: () => useFizrukSqliteReadBootMock(),
}));
vi.mock("../../modules/routine/hooks/useRoutineDualWriteBoot", () => ({
  useRoutineDualWriteBoot: () => useRoutineDualWriteBootMock(),
}));
vi.mock("../../modules/routine/hooks/useSqliteReadBoot", () => ({
  useSqliteReadBoot: () => useRoutineSqliteReadBootMock(),
}));

// ── Heavy child UI with its own dedicated coverage — see file docstring.
//
// L-6 regression coverage needs the REAL props RootLayout passes down, not
// just "was the spy called after a click" — the pre-fix call site didn't
// pass `onChangeCancel` at all, so a click on a button whose `onClick` is
// `undefined` is a silent no-op and never calls anything, `setFlag`
// included. A spy-based "not called" assertion alone passes identically in
// that broken world and the fixed one. Capturing the props lets the tests
// below assert the handler actually exists and is distinct from
// `onSetupCancel` before ever dispatching the click.
const { appLockPropsRef } = vi.hoisted(() => ({
  appLockPropsRef: {
    current: null as null | {
      onSetupCancel: () => void;
      onChangeCancel: () => void;
    },
  },
}));
vi.mock("../security/AppLock", () => ({
  AppLock: (props: {
    onSetupCancel: () => void;
    onChangeCancel: () => void;
  }) => {
    appLockPropsRef.current = props;
    return (
      <>
        <button
          type="button"
          data-testid="app-lock-cancel"
          onClick={props.onSetupCancel}
        >
          cancel-setup
        </button>
        {/* L-6 regression coverage: RootLayout must wire a SEPARATE handler
            for the "change PIN" cancel button, not the same onSetupCancel it
            uses for first-time setup (see the tests below this mock). */}
        <button
          type="button"
          data-testid="app-lock-cancel-change"
          onClick={props.onChangeCancel}
        >
          cancel-change
        </button>
      </>
    );
  },
}));
vi.mock("../hub/HubChatOverlay", () => ({
  HubChatOverlay: () => <div data-testid="chat-overlay" />,
}));

// ── Heavy bundle-weight side effect — see file docstring.
vi.mock("./useAppEffects", () => ({ useAppEffects: vi.fn() }));

import { RootLayout } from "./RootLayout";
import { titleForPath } from "./appPaths";

function meUnauthenticatedHandler() {
  return http.get("*/api/v1/me", () =>
    HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function meAuthenticatedHandler() {
  return http.get("*/api/v1/me", () => HttpResponse.json(meFixtures.minimal));
}

/**
 * Reflects RootLayout's real internal state (route, auth, hub-shell UI
 * state) through the DOM so tests assert on rendered output instead of
 * captured mock-callback refs.
 */
function ShellProbe() {
  const { shortcutsOpen, ui, activeModule, user, authLoading } = useHubShell();
  const location = useLocation();
  return (
    <>
      <div data-testid="child">child</div>
      <div data-testid="shortcuts-open">{String(shortcutsOpen)}</div>
      <div data-testid="search-open">{String(ui.searchOpen)}</div>
      <div data-testid="active-module">{String(activeModule)}</div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="auth-user">{user ? user.id : "anon"}</div>
      <div data-testid="auth-loading">{String(authLoading)}</div>
    </>
  );
}

function renderAt(path = "/") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={apiClient}>
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>
            <AuthProvider>
              <AppLockProvider>
                <Routes>
                  <Route element={<RootLayout />}>
                    <Route path="*" element={<ShellProbe />} />
                  </Route>
                </Routes>
              </AppLockProvider>
            </AuthProvider>
          </ToastProvider>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * Скільки чекати на ПЕРШИЙ boot-хук кожного модуля.
 *
 * AI-NOTE: це не повільність продукту. Boot-кластери тепер за
 * `React.lazy`, і кожен — окремий чанк зі своїм графом, у якому лежить
 * справжній `use*QuickStatsBoot` (лишений реальним навмисно, див. шапку
 * файлу). vitest трансформує цей граф саме всередині очікування; замір
 * 2026-08-07 — ~11 с на два кластери. Раніше та сама вартість платилась
 * при синхронному імпорті `RootLayout`, тобто ДО рендера, тому в
 * таймаути не потрапляла.
 *
 * Довший таймаут потрібен першому ассерту КОЖНОГО модуля, а не одному
 * на тест: чанки різні, і кожен платить за себе. Наступним ассертам
 * того самого модуля вистачає дефолтного — він уже в памʼяті.
 */
const CLUSTER_LOAD_TIMEOUT_MS = 20_000;

describe("RootLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    featureFlags.resetFlags();
    document.title = "";
    appLockPropsRef.current = null;
    server.use(meUnauthenticatedHandler());
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.className = "";
  });

  it("renders the shell (skip-link, app-lock, overlay) and the child route", () => {
    renderAt("/");
    expect(
      screen.getByRole("link", { name: "Перейти до основного вмісту" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-lock-cancel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  // Раніше цей тест закріплював ПРОТИЛЕЖНЕ — що анонімний відвідувач
  // кластери не бутить. Те закріплення було вірним дзеркалом свого часу:
  // `useLocalUserId` тоді знав лише два id, auth і `demo-local`, тож
  // `user || isDemoActive()` у гейті точно повторював його область
  // визначення.
  //
  // Спека `anonymous-local-first-persistence.md` додала третій випадок —
  // `LOCAL_ANON_USER_ID` — і оновила резолвер, але дзеркало в `BootGate`
  // лишила. Наслідок бачив кожен новий бета-тестер: FTUX-пресет «Яку
  // звичку почнемо?» на хабі писав через `applyPreset` →
  // `dualWriteRoutineState`, той не знаходив зареєстрованого контексту
  // (бо хук, що його реєструє, не змонтований) і повертав
  // `skipped/context-unset` → червона плашка «Не вдалося зберегти»
  // ДЕТЕРМІНОВАНО, скільки не тисни. Знахідка founder-а 2026-08-10.
  //
  // Гейт по auth тут зайвий за побудовою: кожен із семи хуків уже
  // самостійно виходить на `!userId`, а `useLocalUserId` віддає `null`
  // рівно поки сесія в польоті — тобто саме тоді, коли бутити й не треба.
  it("boots nutrition/finyk/fizruk/routine sqlite hooks for an anonymous, non-demo visitor", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("auth-user")).toHaveTextContent("anon");
    await waitFor(
      () => expect(useRoutineDualWriteBootMock).toHaveBeenCalled(),
      { timeout: CLUSTER_LOAD_TIMEOUT_MS },
    );
    await waitFor(() =>
      expect(useRoutineSqliteReadBootMock).toHaveBeenCalled(),
    );
    await waitFor(
      () => expect(useNutritionDualWriteBootMock).toHaveBeenCalled(),
      { timeout: CLUSTER_LOAD_TIMEOUT_MS },
    );
    await waitFor(() =>
      expect(useNutritionSqliteReadBootMock).toHaveBeenCalled(),
    );
    await waitFor(() => expect(useFinykDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFinykSqliteReadBootMock).toHaveBeenCalled());
    await waitFor(() => expect(useFizrukDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFizrukSqliteReadBootMock).toHaveBeenCalled());
  });

  it("boots nutrition/finyk/fizruk/routine sqlite hooks once the /api/v1/me fetch resolves a user", async () => {
    server.use(meAuthenticatedHandler());
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByTestId("auth-user")).toHaveTextContent(
        meFixtures.minimal.user.id,
      ),
    );
    await waitFor(
      () => expect(useNutritionDualWriteBootMock).toHaveBeenCalled(),
      {
        timeout: CLUSTER_LOAD_TIMEOUT_MS,
      },
    );
    await waitFor(() =>
      expect(useNutritionSqliteReadBootMock).toHaveBeenCalled(),
    );
    await waitFor(() => expect(useFinykDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFinykSqliteReadBootMock).toHaveBeenCalled());
    await waitFor(() => expect(useFinykMonoMirrorBootMock).toHaveBeenCalled());
    await waitFor(() => expect(useFizrukDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFizrukSqliteReadBootMock).toHaveBeenCalled());
    await waitFor(
      () => expect(useRoutineDualWriteBootMock).toHaveBeenCalled(),
      {
        timeout: CLUSTER_LOAD_TIMEOUT_MS,
      },
    );
    await waitFor(() =>
      expect(useRoutineSqliteReadBootMock).toHaveBeenCalled(),
    );
  });

  // Regression coverage for the demo-mode Hub Reports empty-cards bug: an
  // unauthenticated `?demo=1` session (synthetic `demo-local` id) must warm
  // the same per-module SQLite read caches Hub Reports reads directly, or
  // the Fitness/Expenses/Habits/Nutrition cards stay empty even though the
  // seeded demo payload exists in localStorage.
  it("boots nutrition/finyk/fizruk/routine sqlite hooks for an unauthenticated demo session", async () => {
    window.localStorage.setItem(DEMO_FLAG_KEY, "1");
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByTestId("auth-loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("auth-user")).toHaveTextContent("anon");
    await waitFor(
      () => expect(useNutritionDualWriteBootMock).toHaveBeenCalled(),
      {
        timeout: CLUSTER_LOAD_TIMEOUT_MS,
      },
    );
    await waitFor(() =>
      expect(useNutritionSqliteReadBootMock).toHaveBeenCalled(),
    );
    await waitFor(() => expect(useFinykDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFinykSqliteReadBootMock).toHaveBeenCalled());
    // `useFinykMonoMirrorBoot` is mounted unconditionally alongside the
    // other Finyk boots here — its own internal gate (real `user.id` via
    // `useAuth`, not `useLocalUserId`) is what keeps it a no-op for demo
    // sessions in production; that real gate lives one level below this
    // mock, so it is covered by `useFinykMonoMirrorBoot`'s own test file,
    // not asserted here.
    await waitFor(() => expect(useFinykMonoMirrorBootMock).toHaveBeenCalled());
    await waitFor(() => expect(useFizrukDualWriteBootMock).toHaveBeenCalled(), {
      timeout: CLUSTER_LOAD_TIMEOUT_MS,
    });
    await waitFor(() => expect(useFizrukSqliteReadBootMock).toHaveBeenCalled());
    await waitFor(
      () => expect(useRoutineDualWriteBootMock).toHaveBeenCalled(),
      {
        timeout: CLUSTER_LOAD_TIMEOUT_MS,
      },
    );
    await waitFor(() =>
      expect(useRoutineSqliteReadBootMock).toHaveBeenCalled(),
    );
  });

  it("pins the document title for the active route", () => {
    renderAt("/chat");
    expect(document.title).toBe(titleForPath("/chat"));
  });

  it("skips document.title writes when the tab title is already correct", () => {
    const expected = titleForPath("/chat");
    document.title = expected;
    const titleSpy = vi.spyOn(document, "title", "set");
    renderAt("/chat");
    expect(titleSpy).not.toHaveBeenCalled();
    titleSpy.mockRestore();
  });

  it("disables app-lock setup for real through featureFlags when cancel is pressed", async () => {
    const setFlagSpy = vi.spyOn(featureFlags, "setFlag");
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByTestId("app-lock-cancel"));
    expect(setFlagSpy).toHaveBeenCalledWith("app-lock-enabled", false);
    // Call-through spy — the real store was actually written.
    expect(featureFlags.getFlag("app-lock-enabled")).toBe(false);
    setFlagSpy.mockRestore();
  });

  // L-6 audit: RootLayout used to wire the SAME onSetupCancel handler for
  // both "setup" (lock not yet enabled) and "change" (lock already on,
  // just rotating the PIN). Cancelling a change flowed through the
  // setup-cancel branch and force-disabled "app-lock-enabled" — a user who
  // tapped "Змінити PIN" → "Скасувати" lost their lock entirely while the
  // old PIN silently stayed in storage, unreachable because the feature
  // was now off.
  //
  // The pre-fix `<AppLock>` call site didn't pass an `onChangeCancel` prop
  // at all, so this mock's destructured `onChangeCancel` was `undefined`
  // and the "cancel-change" button's `onClick` was a no-op — clicking it
  // called nothing, `setFlag` included. A bare "setFlag was not called
  // with the disabling args" assertion therefore passes identically in
  // that broken world and this fixed one. The two checks below close that
  // hole by failing the instant `onChangeCancel` goes missing (not a
  // function) or gets pointed at the very same handler as `onSetupCancel`
  // — both are exactly the shapes the L-6 regression can take.
  it("wires a real, distinct onChangeCancel handler that does not disable app-lock", async () => {
    const setFlagSpy = vi.spyOn(featureFlags, "setFlag");
    const user = userEvent.setup();
    renderAt("/");

    const props = appLockPropsRef.current;
    if (!props) throw new Error("AppLock mock never rendered");
    expect(props.onChangeCancel).toBeTypeOf("function");
    expect(props.onChangeCancel).not.toBe(props.onSetupCancel);

    // NB: не виставляємо тут "app-lock-enabled" у true через реальний
    // featureFlags-стор — цей файл навмисно тримає флаг вимкненим (див.
    // докстрінг файлу), інакше реальний `useAppLock()` піде в свій
    // IndexedDB-шлях (`hasPinSet`), якого немає в jsdom. `AppLock`
    // тут замокано повністю, тож для перевірки wiring RootLayout→cancel
    // справжнє значення флага не потрібне.
    await user.click(screen.getByTestId("app-lock-cancel-change"));
    expect(setFlagSpy).not.toHaveBeenCalledWith("app-lock-enabled", false);
    setFlagSpy.mockRestore();
  });

  it("opens hub search directly when already on the hub", () => {
    renderAt("/");
    expect(screen.getByTestId("active-module")).toHaveTextContent("null");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("search-open")).toHaveTextContent("true");
    expect(screen.getByTestId("pathname")).toHaveTextContent("/");
  });

  it("returns to the hub before opening search from inside a module", () => {
    renderAt("/finyk");
    expect(screen.getByTestId("active-module")).toHaveTextContent("finyk");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("pathname")).toHaveTextContent("/");
    expect(screen.getByTestId("search-open")).toHaveTextContent("true");
  });

  it("routes G-chord keyboard navigation to the hub and to module openers", () => {
    renderAt("/finyk");
    expect(screen.getByTestId("active-module")).toHaveTextContent("finyk");

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });
    expect(screen.getByTestId("pathname")).toHaveTextContent("/");
    expect(screen.getByTestId("active-module")).toHaveTextContent("null");

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByTestId("pathname")).toHaveTextContent("/nutrition");
  });

  it("toggles shortcutsOpen via the real '?' keyboard shortcut", () => {
    renderAt("/");
    expect(screen.getByTestId("shortcuts-open")).toHaveTextContent("false");
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(screen.getByTestId("shortcuts-open")).toHaveTextContent("true");
  });
});
