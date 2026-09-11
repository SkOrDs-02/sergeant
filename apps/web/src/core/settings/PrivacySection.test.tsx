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

// --- Моки -------------------------------------------------------------------
// Дефект #5 (CodeRabbit post-merge review PR #756): за замовчуванням
// поводиться як реальний `writeMemoryEntries` у щасливому шляху (нічого не
// кидає) — окремі тести можуть змусити його впасти через
// `mockImplementationOnce`, щоб перевірити розбіжність "сервер очистив,
// локальний запис впав".
const { mockWriteMemoryEntries } = vi.hoisted(() => ({
  mockWriteMemoryEntries: vi.fn(),
}));
vi.mock("../profile/memoryBank", () => ({
  writeMemoryEntries: (entries: unknown) => mockWriteMemoryEntries(entries),
}));

vi.mock("@shared/api", () => {
  // Інлайновано прямо у фабриці — `vi.mock` хойститься вище
  // module-level-констант, тож звернення тут до `DEFAULT_PREFS` впало б у
  // TDZ-помилку.
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

// LegalLinks тягне router-aware навігацію, яку тут не тестуємо.
vi.mock("../legal/LegalLinks", () => ({
  LegalLinks: () => null,
}));

// AiMemoryList ганяє власний React Query трафік (`/api/ai-memory/list`).
// Цей набір — про per-user PIN scoping — монтування реального списку
// змусило б додавати QueryClientProvider у КОЖЕН `render()` тут і
// привʼязало б auth-audit regression-тест до неповʼязаної мережевої
// поверхні. Власна поведінка списку покрита в `AiMemoryList.test.tsx`.
vi.mock("./AiMemoryList", () => ({
  AiMemoryList: () => null,
}));

import { meApi } from "@shared/api";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
} from "../observability/analyticsConsent";
import { DEFAULT_PREFERENCES, PrivacySection } from "./PrivacySection";

// Огляд 2026-09-04: PIN-блокування живе в `security/AppLockSettings`
// (тести — `AppLockSettings.test.tsx`), серверна памʼять з очищенням — у
// `profile/AiMemorySection` (тести там же). Тут лишились згоди.

async function openSection() {
  const trigger = await screen.findByRole("button", {
    name: /Дані та приватність/i,
  });
  fireEvent.click(trigger);
}

// L-20-фікс притягнув `useQueryClient()` прямо в PrivacySection
// (інвалідація очищення памʼяті ШІ), тож кожному render-у тепер потрібен
// справжній предок QueryClientProvider — голий `render(<PrivacySection />)`
// кидає "No QueryClient set, use QueryClientProvider to set one". Дзеркалить
// обгортку, яку `AiMemoryList.test.tsx` уже використовує з тієї ж причини.
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

describe("PrivacySection — preferences (analytics / aiMemory / healthDataConsent)", () => {
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
    vi.mocked(meApi.getPreferences).mockResolvedValue({ ...basePrefs });
    vi.mocked(meApi.updatePreferences).mockResolvedValue({ ...basePrefs });
    __resetAnalyticsConsentForTests();
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
    // Finding #4 (2026-08-08 adversarial review): відрендерений тумблер
    // нижче відображає те, чим викликано `resolveGetPreferences` — тобто
    // server-мок, а НЕ `DEFAULT_PREFERENCES.analytics`. Loading-гейт
    // кількома рядками вище означає, що дефолт ніколи не може просочитись
    // у DOM чи `analyticsConsent` до завершення гідрації, тож константа
    // перевіряється напряму, а не виводиться з виводу, який лишався б
    // зеленим навіть якби дефолт відкотився назад у `true`.
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

    // Огляд 2026-09-04: картки AI-памʼяті тут більше немає (переїхала в
    // Профіль) — банер має стояти одразу ПІСЛЯ останнього тумблера групи
    // і ПЕРЕД правовими посиланнями/підказкою про Профіль.
    const text = container.textContent ?? "";
    const bannerIndex = text.indexOf("Не вдалося зберегти налаштування");
    const lastToggleIndex = text.indexOf("Дані про здоровʼя");
    expect(bannerIndex).toBeGreaterThan(-1);
    expect(lastToggleIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeGreaterThan(lastToggleIndex);
    const banner = screen.getByRole("alert");
    expect(
      banner.previousElementSibling?.querySelector('[role="switch"]'),
    ).not.toBeNull();
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

    // PUT ще летить, але синхронний consent-гейт уже має відображати вибір
    // юзера — це саме те вікно, в яке може встигнути race-нути dismiss
    // `InsightCard`.
    expect(getAnalyticsConsent()).toBe(false);
    expect(meApi.updatePreferences).toHaveBeenCalledTimes(1);

    // Запит зрештою падає (обрив мережі, 5xx) — оптимістичне значення
    // consent має відкотитись разом із самим тумблером. Банер
    // `preferencesError` теж стає видимим у цей момент (див. окремий тест
    // L-9 вище, що перевіряє це напряму); завдання цього тесту вужче —
    // під тестом саме відкочений `checked`-стан тумблера і кеш
    // `analyticsConsent`, так само як і в уже наявному тесті "handles
    // failure without crashing" вище.
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
      name: /Памʼять для Сержанта/i,
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
    // Компонент лишається змонтованим після збою (без падіння)
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
});

// V-12 (аудит 2026-08-08, docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md
// §5): «Згода та дані» і вкладений «Що ШІ про тебе памʼятає» переведено на
// спільний примітив `SettingsSubGroup` замість саморобних `<h3>`/`<h4>`
// з `text-style-label`. Обидва тепер `<h3 class="text-style-overline">` —
// heading-order лишається h2→h3→h3 (без розриву рівня), детальне
// обґрунтування — коментар над `<SettingsSubGroup title="Згода та дані">`
// у `PrivacySection.tsx`.
describe("PrivacySection — V-12 (SettingsSubGroup primitive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("«Згода та дані» рендериться як SettingsSubGroup (h3 + text-style-overline), а не саморобний h3 з text-style-label", async () => {
    renderSection();
    await openSection();

    const heading = await screen.findByText("Згода та дані");
    expect(heading.tagName).toBe("H3");
    expect(heading).toHaveClass("text-style-overline");
    expect(heading).not.toHaveClass("text-style-label");
  });
});
