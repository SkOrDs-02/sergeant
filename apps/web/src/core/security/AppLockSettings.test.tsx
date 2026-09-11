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
import type { UseAppLockReturn } from "./useAppLock";

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
vi.mock("./AppLockContext", () => ({
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
vi.mock("../settings/AiMemoryList", () => ({
  AiMemoryList: () => null,
}));

import { __resetAnalyticsConsentForTests } from "../observability/analyticsConsent";
import { AppLockSettings } from "./AppLockSettings";

async function openSection() {
  // Компонент рендериться без дисклоужера — нічого розкривати.
}

// `QueryClientProvider` лишається на випадок, коли хтось оберне компонент
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
  const utils = render(<AppLockSettings />, { wrapper });
  return { ...utils, queryClient };
}

describe("AppLockSettings — audit F16 (per-user PIN scoping)", () => {
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

describe("AppLockSettings — disable dialog and lock buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFlag.mockReturnValue(false);
    appLock.hasPin = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
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

describe("AppLockSettings — audit L-11 (lock toggle reflects a PIN-store wipe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    rerender(<AppLockSettings />);

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
    rerender(<AppLockSettings />);

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
    rerender(<AppLockSettings />);

    await waitFor(() =>
      expect(mockSetFlag).toHaveBeenCalledWith("app-lock-enabled", false),
    );
  });
});
