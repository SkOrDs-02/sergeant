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

// --- Моки -------------------------------------------------------------------
//
// Мета цього набору — закріпити audit-F16 фікс: PrivacySection має вести
// PIN-стан через helper-и `useAppLockContext`, ПРИВʼЯЗАНІ ДО КОРИСТУВАЧА
// (`hasPin` / `disablePin`), а не голі функції `lockStorage`, що за
// замовчуванням падають у партицію `anon`. Тому ми стабимо контекст і
// перевіряємо, що викликаються саме правильні closures.

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
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { messages } from "@shared/i18n/uk";
import { DEFAULT_PREFERENCES, PrivacySection } from "./PrivacySection";

async function openSection() {
  const trigger = await screen.findByRole("button", {
    name: /Конфіденційність/i,
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

    // hasPin() (привʼязаний до user?.id) визначає рішення про setup — і
    // якщо PIN-а на диску нема, відкривається flow налаштування.
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
    // Finding #3 (2026-08-08 adversarial review): `beforeEach` на рівні
    // `describe` резолвить `appLock.hasPin()` у `false`, а це також живить
    // L-11 mount-реконсиляційний ефект у `PrivacySection` (audit F16 фікс,
    // що живе поруч із цим) — на монтуванні він так само викликає
    // `setFlag("app-lock-enabled", false)`, тож без цього оверайду
    // перевірка нижче проходила б незалежно від того, чи взагалі
    // відпрацював нижчий disable-confirm flow через `handleDisableConfirm`.
    // Резолв у `true` тут робить той реконсиляційний ефект no-op-ом, тож
    // єдине джерело виклику з `false` — саме клік-flow під тестом.
    appLock.hasPin = vi.fn().mockResolvedValue(true);
    // Прапорець уже увімкнений → тумблер рендериться checked; клік вимикає.
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    // Підтверджуємо деструктивну дію в модалці.
    const confirm = await screen.findByRole("button", { name: "Вимкнути" });
    fireEvent.click(confirm);

    await waitFor(() => expect(appLock.disablePin).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("does not produce an unhandled rejection when hasPin() rejects on mount (finding #6)", async () => {
    // ПРИЧИНА: `lockStorage.hasPinSet` -> `loadCred` РЕДЖЕКТИТЬ при збої
    // IndexedDB (приватний режим Safari, брак сховища), а не резолвиться
    // в `false`. Реконсиляційний ефект на монтуванні в `PrivacySection`
    // ланцюжком чіпляє `.then()` до `appLock.hasPin()` без `.catch()`,
    // тож кожне монтування Налаштувань із увімкненим прапорцем лишало б
    // unhandled promise rejection — Vitest (як і браузер) показує це як
    // провал, навіть якщо жоден assert у цьому тесті на нього напряму не
    // зважає.
    mockUseFlag.mockReturnValue(true);
    appLock.hasPin = vi.fn().mockRejectedValue(new Error("IDB unavailable"));
    renderSection();
    await openSection();

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    // Даємо чергу мікротасків реджекченого проміса прокрутитись — інакше
    // unhandled rejection тут спливла б уже ПІСЛЯ того, як цей тест уже
    // "пройшов", і була б віднесена до того, який тест виконується наступним.
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
    // Цей describe не про app-lock — явно скидаємо стан спільного модуля,
    // а не успадковуємо те, що лишив після себе F16-describe вище.
    // Резолв `hasPin` у `true` тут означає "PIN уже існує" — реалістичне
    // тло для цих чисто preference-тестів: воно тримає L-11
    // wipe-реконсиляційний ефект (PrivacySection.tsx) no-op-ом, доки тест
    // навмисно не влаштує сценарій wipe сам.
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
    // хтось поверне window.confirm, клік по кнопці одразу зітре памʼять
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
    // ПРИЧИНА: раніше `handleClearMemoryConfirm` батчив закриття діалогу
    // (`setClearMemoryConfirmOpen(false)`) з вимкненням цього ж тригера
    // (`setClearingMemory(true)`) в одному рендері. Cleanup фокус-пастки
    // `ConfirmDialog` повертає фокус на те, що було в фокусі на момент
    // відкриття діалогу — `disabled`-кнопка нефокусована, тож `.focus()`
    // на ній мовчки нічого не робить, і keyboard-юзера скидає на `<body>`
    // замість повернення на цю кнопку.
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

  // Дефект #5 (CodeRabbit post-merge review PR #756, продовжено ревʼю
  // PR #757): один спільний try/catch навколо серверного DELETE і
  // локального `writeMemoryEntries` видавав локальну помилку (переповнене
  // localStorage, приватний режим) за серверну — хоча сервер на той
  // момент УЖЕ незворотно стер факти. Перший фікс (PR #756) розділив
  // кроки, але мовчки ковтав локальну помилку і показував той самий
  // текст повного успіху "Памʼять ШІ очищено." — тобто рапортував ПОВНЕ
  // видалення, хоча локальна копія факту лишається на пристрої. Це
  // неприйнятно для дії про приватність. PR #757 додає ТРЕТІЙ, окремий
  // стан: сервер очищено, локальну копію стерти не вдалося — відмінний і
  // від повного успіху, і від повного провалу (сервер сам не чистив).
  it("shows a distinct partial-clear status (not the full-success text) and still invalidates the cache when the server clear succeeds but the local write fails", async () => {
    mockWriteMemoryEntries.mockImplementationOnce(() => {
      throw new Error("Не вдалося зберегти памʼять профілю");
    });
    const { queryClient } = renderSection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await openSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити памʼять ШІ" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити назавжди" }),
    );

    await waitFor(() => expect(meApi.clearAiMemory).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Памʼять ШІ очищено на сервері, але локальну копію стерти не вдалося.",
      ),
    ).toBeInTheDocument();
    // Ні текст повного успіху, ні текст повного провалу не мають зʼявитись
    // — це саме третій, окремий стан, а не переперевикористання іншого.
    expect(screen.queryByText("Памʼять ШІ очищено.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Не вдалося очистити памʼять ШІ."),
    ).not.toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: aiMemoryKeys.all });
  });

  // Дзеркальний випадок: сервер САМ падає — тоді показ успіху був би
  // брехнею (нічого не видалено), тож інвалідація кешу не має відбуватись.
  it("shows the failure banner and does not invalidate the cache when the server clear itself fails", async () => {
    vi.mocked(meApi.clearAiMemory).mockRejectedValueOnce(new Error("500"));
    const { queryClient } = renderSection();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await openSection();

    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити памʼять ШІ" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Очистити назавжди" }),
    );

    expect(
      await screen.findByText("Не вдалося очистити памʼять ШІ."),
    ).toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: aiMemoryKeys.all,
    });
  });

  it("finding #10: does not block the cleared-status message on the cache invalidation settling", async () => {
    // ПРИЧИНА: `await queryClient.invalidateQueries(...)` стояв ПЕРЕД
    // `setMemoryClearStatus(...)`, а `clearingMemory` знімається лише у
    // `finally` — тож на повільній мережі стирання вже відбулось, а
    // кнопка ще секунди тримала "Очищаю…". Мокаємо invalidateQueries
    // проміс, що НІКОЛИ не резолвиться: якби компонент досі чекав на
    // нього, статус-текст і не зʼявився б.
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

  it("dismisses disable-confirm dialog on cancel without calling disablePin", async () => {
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    fireEvent.click(
      screen.getByRole("switch", { name: /Блокування додатку/i }),
    );

    // `getByText`, а не `getByRole("button", { name: … })`: `ConfirmDialog`
    // також рендерить однойменну кнопку-скрим (`aria-label="Скасувати"`,
    // без видимого тексту) для закриття по тапу поза діалогом, тож запит
    // за роллю з іменем матчить два елементи. Дзеркалить наявний патерн
    // клацання скасування `ConfirmDialog` з `PWASection.test.tsx`.
    const cancel = await screen.findByText("Скасувати");
    fireEvent.click(cancel);

    expect(appLock.disablePin).not.toHaveBeenCalled();
    expect(mockSetFlag).not.toHaveBeenCalledWith("app-lock-enabled", false);
  });

  it("shows Change PIN and Lock Now buttons when app-lock flag is enabled", async () => {
    mockUseFlag.mockReturnValue(true);
    renderSection();
    await openSection();

    // Кнопки рендеряться всередині гілки flagEnabled
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
    // ПРИЧИНА: ІДЕНТИЧНІСТЬ `appLock.hasPin` міняється лише коли міняється
    // залогінений користувач (`useCallback([userId])` у `useAppLock`). На
    // спільному пристрої перемикання юзерів не чіпає ні `appLock.state`,
    // ні (глобальний) прапор `app-lock-enabled`, тож без відстеження цієї
    // зміни ідентичності реконсиляційний ефект завжди впирався в ранній
    // `!isMount && !cameFromLocked` return і лишав «Блокування додатку»
    // ввімкненим для юзера без PIN-а в ЙОГО ВЛАСНІЙ партиції.
    appLock.state = "idle";
    appLock.hasPin = vi.fn().mockResolvedValue(true); // у юзера A є PIN
    const { rerender } = renderSection();
    await openSection();

    await waitFor(() => expect(appLock.hasPin).toHaveBeenCalledTimes(1));
    expect(mockSetFlag).not.toHaveBeenCalledWith("app-lock-enabled", false);

    // Перемикаємо юзерів — цілком новий closure `hasPin`, `state` весь час
    // лишається "idle" (без переходу locked -> idle, на який можна було б
    // спертись).
    appLock.hasPin = vi.fn().mockResolvedValue(false); // у юзера B нема PIN-а
    rerender(<PrivacySection />);

    await waitFor(() =>
      expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false),
    );
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
    mockUseFlag.mockReturnValue(false);
    appLock.hasPin = vi.fn().mockResolvedValue(true);
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

  it("вкладений підблок «Що ШІ про тебе памʼятає» теж стає h3 (SettingsSubGroup) — heading-order лишається h2→h3→h3 без розриву рівня", async () => {
    const { container } = renderSection();
    await openSection();

    const nestedHeading = await screen.findByText(
      messages.privacy.aiMemory.sectionTitle,
    );
    expect(nestedHeading.tagName).toBe("H3");
    expect(nestedHeading).toHaveClass("text-style-overline");

    // axe heading-order (блокуючий гейт tests/a11y/axe.spec.ts) забороняє
    // СТРИБОК рівня вниз (напр. h2→h4), але дозволяє повтор того самого
    // рівня (h3→h3) — перевіряємо це напряму на реальній DOM-послідовності
    // заголовків секції.
    const levels = Array.from(
      container.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    ).map((el) => Number(el.tagName.slice(1)));
    expect(levels.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });
});
