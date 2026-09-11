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
vi.mock("./memoryBank", () => ({
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

import { meApi } from "@shared/api";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { AiMemorySection } from "./AiMemorySection";

async function openSection() {
  // Компонент рендериться без дисклоужера — нічого розкривати.
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
  const utils = render(<AiMemorySection />, { wrapper });
  return { ...utils, queryClient };
}

describe("AiMemorySection — clear AI memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
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
});
