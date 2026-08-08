/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { UserPreferences } from "@shared/api";
import type { UseAppLockReturn } from "../security/useAppLock";

// --- Mocks -----------------------------------------------------------------
//
// The point of this suite is to lock in the audit-F16 fix: PrivacySection
// must drive PIN state through the *user-scoped* `useAppLockContext` helpers
// (`hasPin` / `disablePin`), never the bare `lockStorage` functions that
// default to the `anon` partition. We therefore stub the context and assert
// the right closures are invoked.

const appLock: UseAppLockReturn = {
  state: "idle",
  startSetup: vi.fn(),
  startChange: vi.fn(),
  unlock: vi.fn().mockResolvedValue(true),
  finishSetup: vi.fn(),
  lock: vi.fn(),
  savePin: vi.fn().mockResolvedValue(undefined),
  hasPin: vi.fn().mockResolvedValue(false),
  disablePin: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../security/AppLockContext", () => ({
  useAppLockContext: () => appLock,
}));

const { mockUseFlag, mockSetFlag } = vi.hoisted(() => ({
  mockUseFlag: vi.fn().mockReturnValue(false),
  mockSetFlag: vi.fn(),
}));
vi.mock("../lib/featureFlags", () => ({
  useFlag: mockUseFlag,
  setFlag: mockSetFlag,
}));

vi.mock("@shared/api", () => {
  // Inlined inside the factory — `vi.mock` is hoisted above module-level
  // consts, so referencing `DEFAULT_PREFS` here would hit a TDZ error.
  const prefs: UserPreferences = {
    analytics: true,
    aiMemory: true,
    pushNotifications: false,
    sergeantNudges: false,
    healthDataConsent: false,
    activeModules: null,
    updatedAt: null,
  };
  return {
    meApi: {
      getPreferences: vi.fn().mockResolvedValue(prefs),
      updatePreferences: vi.fn().mockResolvedValue(prefs),
      clearAiMemory: vi.fn().mockResolvedValue({ ok: true, deleted: 2 }),
    },
  };
});

// LegalLinks pulls in router-aware navigation we don't exercise here.
vi.mock("../legal/LegalLinks", () => ({
  LegalLinks: () => null,
}));

// AiMemoryList drives its own React Query traffic (`/api/ai-memory/list`).
// This suite is about per-user PIN scoping — mounting the real list would
// force a QueryClientProvider into every `render()` here and couple an
// auth-audit regression test to an unrelated network surface. Its own
// behaviour is covered in `AiMemoryList.test.tsx`.
vi.mock("./AiMemoryList", () => ({
  AiMemoryList: () => null,
}));

import { meApi } from "@shared/api";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
} from "../observability/analyticsConsent";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { DEFAULT_PREFERENCES, PrivacySection } from "./PrivacySection";

async function openSection() {
  const trigger = await screen.findByRole("button", {
    name: /Конфіденційність/i,
  });
  fireEvent.click(trigger);
}

// L-20 fix pulled `useQueryClient()` straight into PrivacySection (the AI
// memory-clear invalidation), so every render now needs a real
// QueryClientProvider ancestor — a bare `render(<PrivacySection />)` throws
// "No QueryClient set, use QueryClientProvider to set one". Mirrors the
// wrapper `AiMemoryList.test.tsx` already uses for the same reason.
function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = render(<PrivacySection />, { wrapper });
  return { ...utils, queryClient };
}

describe("PrivacySection — audit F16 (per-user PIN scoping)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFlag.mockReturnValue(false);
    appLock.hasPin = vi.fn().mockResolvedValue(false);
    appLock.disablePin = vi.fn().mockResolvedValue(undefined);
    appLock.startSetup = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("enabling the lock checks the user-scoped partition (appLock.hasPin), not anon", async () => {
    renderSection();
    await openSection();

    const toggle = screen.getByRole("switch", { name: /Блокування додатку/i });
    fireEvent.click(toggle);

    // hasPin() (scoped to user?.id) drives the setup decision — and with no
    // PIN on file the setup flow opens.
    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appLock.startSetup).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", true);
  });

  it("does NOT open setup when the signed-in user already has a PIN", async () => {
    appLock.hasPin = vi.fn().mockResolvedValue(true);
    renderSection();
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    expect(appLock.startSetup).not.toHaveBeenCalled();
  });

  it("disabling the lock clears the user-scoped credential (appLock.disablePin)", async () => {
    // Finding #3 (2026-08-08 adversarial review): the `describe`-level
    // `beforeEach` resolves `appLock.hasPin()` to `false`, which also
    // feeds the L-11 mount-reconciliation effect in `PrivacySection`
    // (audit F16 fix living alongside this one) — on mount it likewise
    // calls `setFlag("app-lock-enabled", false)`, so without this
    // override the assertion below passed regardless of whether the
    // disable-confirm flow below ever ran `handleDisableConfirm`.
    // Resolving `true` here makes that reconciliation effect a no-op, so
    // the only source of a `false` call is the click flow under test.
    appLock.hasPin = vi.fn().mockResolvedValue(true);
    // Flag already on → the toggle renders checked; clicking it disables.
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    // Confirm the destructive action in the modal.
    const confirm = await screen.findByRole("button", { name: "Вимкнути" });
    fireEvent.click(confirm);

    await waitFor(() => expect(appLock.disablePin).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("does not produce an unhandled rejection when hasPin() rejects on mount (finding #6)", async () => {
    // ПРИЧИНА: `lockStorage.hasPinSet` -> `loadCred` REJECTS on an
    // IndexedDB failure (Safari private mode, storage pressure) rather
    // than resolving `false`. The mount-time reconciliation effect in
    // `PrivacySection` chains `.then()` off `appLock.hasPin()` without a
    // `.catch()`, so every Settings mount with the flag on would leave an
    // unhandled promise rejection — Vitest (like the browser) surfaces
    // that as a failure even though nothing in this test asserts on it
    // directly.
    mockUseFlag.mockReturnValue(true);
    appLock.hasPin = vi.fn().mockRejectedValue(new Error("IDB unavailable"));
    renderSection();
    await openSection();

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    // Give the rejected promise's microtask queue a turn — an unhandled
    // rejection here would otherwise surface after this test already
    // "passed", attributed to whichever test runs next.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("PrivacySection — preferences (analytics / aiMemory / pushNotifications)", () => {
  const basePrefs: UserPreferences = {
    analytics: true,
    aiMemory: true,
    pushNotifications: false,
    sergeantNudges: false,
    healthDataConsent: false,
    activeModules: null,
    updatedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFlag.mockReturnValue(false);
    vi.mocked(meApi.getPreferences).mockResolvedValue({ ...basePrefs });
    vi.mocked(meApi.updatePreferences).mockResolvedValue({ ...basePrefs });
    __resetAnalyticsConsentForTests();
    // This describe isn't about app-lock — reset its shared-module state
    // explicitly rather than inherit whatever the F16 describe above left
    // behind. `hasPin` resolving `true` here means "a PIN already exists",
    // the realistic backdrop for these preference-only tests: it keeps the
    // L-11 wipe-reconciliation effect (PrivacySection.tsx) a no-op unless a
    // test deliberately sets up the wipe scenario itself.
    appLock.state = "idle";
    appLock.hasPin = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    __resetAnalyticsConsentForTests();
  });

  it("loads and displays preferences from the API on mount", async () => {
    renderSection();
    await openSection();

    await waitFor(() => expect(meApi.getPreferences).toHaveBeenCalledTimes(1));
  });

  it("L-3: does not assert a consent state before hydration, and the pre-hydration default is analytics:false", async () => {
    // ПРИЧИНА: DEFAULT_PREFERENCES.analytics раніше було `true`, хоча
    // сервер (dataRights.ts DEFAULT_PREFERENCES), analyticsConsent.ts
    // ("DENY UNTIL HYDRATED") і DB DEFAULT (міграція 111) усі узгоджені на
    // opt-in (false). Гість/офлайн-юзер, чий getPreferences() ще не
    // відповів (або ніколи не відповість), бачив тумблер "Аналітика
    // продукту" одразу ввімкненим — суперечність, яка стверджує згоду,
    // якої нема. Перевіряємо і сам дефолт (кінцевий стан = false), і те,
    // що до відповіді сервера немає жодного тумблера — ні ON, ні OFF.
    //
    // Finding #4 (2026-08-08 adversarial review): the *rendered* toggle
    // below reflects whatever `resolveGetPreferences` is called with —
    // i.e. the server mock — not `DEFAULT_PREFERENCES.analytics`. The
    // loading gate a few lines up means the default can never leak into
    // the DOM or `analyticsConsent` before hydration resolves, so the
    // constant is asserted directly instead of inferred from output that
    // would stay green even if the default flipped back to `true`.
    let resolveGetPreferences!: (value: UserPreferences) => void;
    const pending = new Promise<UserPreferences>((resolve) => {
      resolveGetPreferences = resolve;
    });
    vi.mocked(meApi.getPreferences).mockReturnValue(pending);

    renderSection();
    await openSection();

    // До гідрації секція показує явний loading-стан, а не тумблер, що
    // мовчки бреше про згоду в той чи інший бік.
    expect(
      screen.queryByRole("switch", { name: /Аналітика продукту/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Завантажую налаштування/i)).toBeInTheDocument();
    expect(DEFAULT_PREFERENCES.analytics).toBe(false);

    resolveGetPreferences({ ...basePrefs, analytics: false });

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    expect(analyticsToggle).not.toBeChecked();
  });

  it("L-9: shows a visible error banner when saving a preference fails after a successful load", async () => {
    // ПРИЧИНА: банер помилки рендерився лише під умовою
    // `!preferencesLoaded && preferencesError` — тобто ДО першого
    // успішного завантаження. Помилка ЗБЕРЕЖЕННЯ (updatePreference)
    // стається вже ПІСЛЯ того, як preferencesLoaded стало true, тож умова
    // гейтила її назавжди: тумблер мовчки відкочувався до старого
    // значення, а людина не бачила жодного сигналу, що клік не мав
    // ефекту.
    vi.mocked(meApi.updatePreferences).mockRejectedValue(new Error("500"));
    renderSection();
    await openSection();

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);

    expect(
      await screen.findByText(/Не вдалося зберегти налаштування/i),
    ).toBeInTheDocument();
  });

  it("finding #7: renders the save-error banner right next to the toggle group, before the AI-memory card", async () => {
    // ПРИЧИНА: до цього фіксу банер стояв ПІСЛЯ картки AI-памʼяті, за три
    // блоки від тумблерів, що фактично впали, — сигнал про помилку існував
    // (L-9), але зорово губився під списком фактів ШІ.
    vi.mocked(meApi.updatePreferences).mockRejectedValue(new Error("500"));
    const { container } = renderSection();
    await openSection();

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);
    await screen.findByText(/Не вдалося зберегти налаштування/i);

    const text = container.textContent ?? "";
    const bannerIndex = text.indexOf("Не вдалося зберегти налаштування");
    const memoryCardIndex = text.indexOf(
      "Памʼять зберігає підтверджені факти профілю",
    );
    expect(bannerIndex).toBeGreaterThan(-1);
    expect(memoryCardIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(memoryCardIndex);
  });

  it("toggles analytics preference and calls updatePreferences", async () => {
    vi.mocked(meApi.updatePreferences).mockResolvedValue({
      ...basePrefs,
      analytics: false,
    });
    renderSection();
    await openSection();

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);

    await waitFor(() =>
      expect(meApi.updatePreferences).toHaveBeenCalledWith({
        analytics: false,
      }),
    );
  });

  it("caches the fetched analytics preference into the analyticsConsent module on mount", async () => {
    vi.mocked(meApi.getPreferences).mockResolvedValue({
      ...basePrefs,
      analytics: false,
    });
    renderSection();
    await openSection();

    await waitFor(() => expect(getAnalyticsConsent()).toBe(false));
  });

  it("updates the cached analytics consent after toggling", async () => {
    vi.mocked(meApi.updatePreferences).mockResolvedValue({
      ...basePrefs,
      analytics: false,
    });
    renderSection();
    await openSection();
    await waitFor(() => expect(getAnalyticsConsent()).toBe(true));

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);

    await waitFor(() => expect(getAnalyticsConsent()).toBe(false));
  });

  it("sets analytics consent optimistically while the update request is still pending, and reverts it on failure (CodeRabbit PR #627)", async () => {
    let rejectUpdate!: (err: unknown) => void;
    const pending = new Promise<UserPreferences>((_resolve, reject) => {
      rejectUpdate = reject;
    });
    vi.mocked(meApi.updatePreferences).mockReturnValue(pending);

    renderSection();
    await openSection();
    await waitFor(() => expect(getAnalyticsConsent()).toBe(true));

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);

    // The PUT is still in flight, but the synchronous consent gate must
    // already reflect the user's choice — this is exactly the window an
    // `InsightCard` dismiss can race into.
    expect(getAnalyticsConsent()).toBe(false);
    expect(meApi.updatePreferences).toHaveBeenCalledTimes(1);

    // The request eventually fails (network drop, 5xx) — the optimistic
    // consent value must revert along with the toggle itself. The
    // `preferencesError` banner also becomes visible at this point (see
    // the dedicated L-9 test above, which asserts on it directly); this
    // test's job is narrower — the toggle's own reverted `checked` state
    // and the `analyticsConsent` cache are the two values under test
    // here, same as the pre-existing "handles failure without crashing"
    // test above.
    rejectUpdate(new Error("500"));
    await waitFor(() => expect(analyticsToggle).toBeChecked());
    expect(getAnalyticsConsent()).toBe(true);
  });

  it("toggles aiMemory preference and calls updatePreferences", async () => {
    vi.mocked(meApi.updatePreferences).mockResolvedValue({
      ...basePrefs,
      aiMemory: false,
    });
    renderSection();
    await openSection();

    const aiMemoryToggle = await screen.findByRole("switch", {
      name: /Памʼять для ШІ/i,
    });
    fireEvent.click(aiMemoryToggle);

    await waitFor(() =>
      expect(meApi.updatePreferences).toHaveBeenCalledWith({ aiMemory: false }),
    );
  });

  it("defaults healthDataConsent off and toggles it via updatePreferences", async () => {
    vi.mocked(meApi.updatePreferences).mockResolvedValue({
      ...basePrefs,
      healthDataConsent: true,
    });
    renderSection();
    await openSection();

    const consentToggle = await screen.findByRole("switch", {
      name: /Дані про здоровʼя/i,
    });
    expect(consentToggle).not.toBeChecked();
    fireEvent.click(consentToggle);

    await waitFor(() =>
      expect(meApi.updatePreferences).toHaveBeenCalledWith({
        healthDataConsent: true,
      }),
    );
  });

  it("V-6: confirms AI-memory clear via the app's dialog primitive, not window.confirm", async () => {
    // ПРИЧИНА: незворотне видалення раніше підтверджувалось нативним
    // `window.confirm` — паттерн, заборонений дизайн-системою (не
    // стилізується, синхронно блокує event loop, немає focus-trap). Якщо
    // хтось поверне window.confirm, клік по кнопці одразу зітре пам'ять
    // БЕЗ проміжного діалогу — `meApi.clearAiMemory` буде викликано ДО
    // того, як тест встигне знайти кнопку підтвердження нижче.
    const confirmSpy = vi.spyOn(window, "confirm");
    renderSection();
    await openSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити памʼять ШІ" }),
    );

    const confirmButton = await screen.findByRole("button", {
      name: "Очистити назавжди",
    });
    expect(meApi.clearAiMemory).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(confirmButton);

    await waitFor(() => expect(meApi.clearAiMemory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Памʼять ШІ очищено.")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger button after confirming AI-memory clear, not <body> (finding #2)", async () => {
    // ПРИЧИНА: `handleClearMemoryConfirm` used to batch closing the
    // dialog (`setClearMemoryConfirmOpen(false)`) with disabling this
    // same trigger (`setClearingMemory(true)`) in one render.
    // `ConfirmDialog`'s focus-trap cleanup restores focus to whatever was
    // focused when the dialog opened — a `disabled` button is
    // unfocusable, so `.focus()` there silently no-ops and the keyboard
    // user is dropped on `<body>` instead of back on this button.
    renderSection();
    await openSection();

    const trigger = await screen.findByRole("button", {
      name: "Очистити памʼять ШІ",
    });
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const confirmButton = await screen.findByRole("button", {
      name: "Очистити назавжди",
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(meApi.clearAiMemory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("L-20: invalidates the aiMemoryKeys factory cache after clearing AI memory", async () => {
    // ПРИЧИНА: без інвалідації `AiMemoryList` (useInfiniteQuery на
    // aiMemoryKeys.list) продовжує показувати вже стерті факти зі старого
    // кешу, поки щось інше не спричинить refetch. Перевіряємо саме виклик
    // через фабричний ключ (Hard Rule #2), а не будь-яку інвалідацію.
    const { queryClient } = renderSection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await openSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити памʼять ШІ" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити назавжди" }),
    );

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: aiMemoryKeys.all,
      }),
    );
  });

  it("finding #10: does not block the cleared-status message on the cache invalidation settling", async () => {
    // ПРИЧИНА: `await queryClient.invalidateQueries(...)` стояв ПЕРЕД
    // `setMemoryClearStatus(...)`, а `clearingMemory` знімається лише у
    // `finally` — тож на повільній мережі стирання вже відбулось, а
    // кнопка ще секунди тримала "Очищаю…". Мокаємо invalidateQueries
    // проміс, що НІКОЛИ не резолвиться: якби компонент досі чекав на
    // нього, статус-текст і не з'явився б.
    const { queryClient } = renderSection();
    vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(
      new Promise(() => {
        /* never settles */
      }),
    );
    await openSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити памʼять ШІ" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити назавжди" }),
    );

    await waitFor(() => expect(meApi.clearAiMemory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Памʼять ШІ очищено.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Очистити памʼять ШІ" }),
    ).toBeInTheDocument();
  });

  it("does not duplicate the notification toggle from Notifications settings", async () => {
    renderSection();
    await openSection();
    expect(
      screen.queryByRole("switch", { name: /Системні сповіщення/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/окремому розділі/i)).toBeInTheDocument();
  });

  it("calls updatePreferences and handles failure without crashing", async () => {
    vi.mocked(meApi.updatePreferences).mockRejectedValue(new Error("500"));
    renderSection();
    await openSection();

    const analyticsToggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    fireEvent.click(analyticsToggle);

    await waitFor(() =>
      expect(meApi.updatePreferences).toHaveBeenCalledTimes(1),
    );
    // Component remains mounted after failure (no crash)
    expect(analyticsToggle).toBeInTheDocument();
  });

  it("shows an error when getPreferences API call fails", async () => {
    vi.mocked(meApi.getPreferences).mockRejectedValue(new Error("401"));
    renderSection();
    await openSection();

    await waitFor(() =>
      expect(screen.getByText(/Увійди в акаунт/i)).toBeInTheDocument(),
    );
  });

  it("finding #9: offers a real retry after a failed initial preferences load", async () => {
    // ПРИЧИНА: раніше провалене ПЕРШЕ завантаження рендерило порожнечу —
    // ні тумблерів (коректно, L-3), ні способу вийти з цього стану, крім
    // виходу зі сторінки Налаштувань і повернення. Тепер поруч із
    // повідомленням є кнопка, що повторно кличе той самий фетч.
    vi.mocked(meApi.getPreferences).mockRejectedValueOnce(new Error("401"));
    renderSection();
    await openSection();

    await screen.findByText(/Увійди в акаунт/i);
    expect(
      screen.queryByRole("switch", { name: /Аналітика продукту/i }),
    ).not.toBeInTheDocument();

    vi.mocked(meApi.getPreferences).mockResolvedValueOnce({ ...basePrefs });
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));

    await waitFor(() => expect(meApi.getPreferences).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("switch", { name: /Аналітика продукту/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Увійди в акаунт/i)).not.toBeInTheDocument();
  });

  it("dismisses disable-confirm dialog on cancel without calling disablePin", async () => {
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    // `getByText`, not `getByRole("button", { name: … })`: `ConfirmDialog`
    // also renders a same-named scrim button (`aria-label="Скасувати"`,
    // no visible text) to dismiss on tap-outside, so a name-based role
    // query matches two elements. Mirrors `PWASection.test.tsx`'s
    // existing `ConfirmDialog` cancel-click pattern.
    const cancel = await screen.findByText("Скасувати");
    fireEvent.click(cancel);

    expect(appLock.disablePin).not.toHaveBeenCalled();
    expect(mockSetFlag).not.toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("shows Change PIN and Lock Now buttons when app-lock flag is enabled", async () => {
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    // Buttons are rendered inside the flagEnabled branch
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Змінити PIN/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Заблокувати зараз/i }),
      ).toBeInTheDocument();
    });
  });
});

describe("PrivacySection — audit L-11 (lock toggle reflects a PIN-store wipe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(meApi.getPreferences).mockResolvedValue({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
      healthDataConsent: false,
      activeModules: null,
      updatedAt: null,
    });
    mockUseFlag.mockReturnValue(true);
    appLock.state = "locked";
    appLock.startSetup = vi.fn();
    appLock.disablePin = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    appLock.state = "idle";
    cleanup();
  });

  it("auto-corrects the 'Блокування' flag to off when the lock unlocks with no PIN on record (10-attempt wipe)", async () => {
    // ПРИЧИНА: lockStorage.verifyPinAttempt стирає PIN-креденшел на 10-й
    // невдалій спробі (MAX_FAILED_UNLOCK_ATTEMPTS), а useAppLock.unlock()
    // на wipe-гілці лише скидає `state` в "idle" — прапор
    // "app-lock-enabled" він НЕ чіпає. Без реконсиляції в PrivacySection
    // тумблер "Блокування" лишається ON назавжди, хоча PIN-а вже нема на
    // диску, і людина думає, що дані захищені, коли їх ніхто не захищає.
    appLock.hasPin = vi.fn().mockResolvedValue(false); // wiped
    const { rerender } = renderSection();
    await openSection();

    // Це саме той перехід, який useAppLock.unlock() виконує і на успіху,
    // і на wipe — розрізняє їх лише те, що тут hasPin() повертає false.
    appLock.state = "idle";
    rerender(<PrivacySection />);

    await waitFor(() =>
      expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false),
    );
  });

  it("does NOT touch the flag on the same transition when a PIN is still on record (normal unlock)", async () => {
    // Негативний контроль: перехід locked -> idle сам по собі не має
    // вимикати прапор — лише коли PIN дійсно відсутній.
    appLock.hasPin = vi.fn().mockResolvedValue(true);
    const { rerender } = renderSection();
    await openSection();

    appLock.state = "idle";
    rerender(<PrivacySection />);

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalled());
    expect(mockSetFlag).not.toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("re-checks hasPin when the signed-in user changes without a lock-state transition (finding #5)", async () => {
    // ПРИЧИНА: `appLock.hasPin`'s identity changes only when the
    // signed-in user changes (`useCallback([userId])` in `useAppLock`).
    // On a shared device, switching users touches neither `appLock.state`
    // nor the (global) `app-lock-enabled` flag, so without tracking that
    // identity change the reconciliation effect always fell into its
    // `!isMount && !cameFromLocked` early-return and left "Блокування
    // додатку" showing ON for a user with no PIN in their own partition.
    appLock.state = "idle";
    appLock.hasPin = vi.fn().mockResolvedValue(true); // user A has a PIN
    const { rerender } = renderSection();
    await openSection();

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).not.toHaveBeenCalledWith("app-lock-enabled", false);

    // Switch users — a brand-new `hasPin` closure, `state` stays "idle"
    // throughout (no locked -> idle transition to key off of).
    appLock.hasPin = vi.fn().mockResolvedValue(false); // user B has no PIN
    rerender(<PrivacySection />);

    await waitFor(() =>
      expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false),
    );
  });
});
