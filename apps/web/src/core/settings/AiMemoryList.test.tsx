/** @vitest-environment jsdom */
/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * AI-CONTEXT: асерти цілять у дефекти, які легко відтворити й важко
 * помітити оком:
 *   * видалення без підтвердження (дія незворотна — сервер робить
 *     `DELETE`, не soft-delete);
 *   * видалення не того факту, коли в списку кілька схожих рядків;
 *   * відсутність інвалідації кешу — UI показує стертий факт, поки
 *     вкладку не перезавантажать.
 * «Компонент відрендерився» тут нічого не доводить, тому такого асерта
 * немає.
 */
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

const { listAiMemory, deleteAiMemory } = vi.hoisted(() => ({
  listAiMemory: vi.fn(),
  deleteAiMemory: vi.fn(),
}));

vi.mock("@shared/api", () => ({
  meApi: { listAiMemory, deleteAiMemory },
}));

import { AiMemoryList } from "./AiMemoryList";

function page(
  items: Array<{ id: number; content: string; source?: string }>,
  nextCursor: number | null = null,
) {
  return {
    items: items.map((i) => ({
      id: i.id,
      content: i.content,
      source: i.source ?? "chat",
      topic: null,
      createdAt: "2026-07-20T10:00:00.000Z",
    })),
    nextCursor,
  };
}

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AiMemoryList />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteAiMemory.mockResolvedValue({ ok: true, deleted: true });
});

afterEach(() => cleanup());

describe("AiMemoryList", () => {
  it("показує факти з їх джерелом", async () => {
    listAiMemory.mockResolvedValue(
      page([{ id: 1, content: "Алергія на горіхи", source: "nutrition" }]),
    );
    renderList();
    expect(await screen.findByText("Алергія на горіхи")).toBeTruthy();
    expect(screen.getByText(/Харчування/)).toBeTruthy();
  });

  it("порожня пам'ять → пояснення, а не порожнеча", async () => {
    listAiMemory.mockResolvedValue(page([]));
    renderList();
    expect(await screen.findByText(/Поки що ШІ нічого/)).toBeTruthy();
  });

  it("порожня пам'ять малює спільний <EmptyState> (role=status), не голий <p> (V-14, аудит 2026-08-08)", async () => {
    // `findByRole("status")` тут не годиться напряму — стан завантаження
    // теж має `role="status"`, і `findByRole` підхопив би саме його.
    listAiMemory.mockResolvedValue(page([]));
    renderList();
    const text = await screen.findByText(/Поки що ШІ нічого/);
    expect(text.closest('[role="status"]')).toBeTruthy();
  });

  it("НЕ видаляє без підтвердження", async () => {
    // Дія незворотна на сервері. Клік по ✕ мусить лише відкрити діалог;
    // якщо колись «спростять» до прямого виклику, юзер втрачатиме факти
    // одним промахом пальця по 44-піксельній кнопці.
    listAiMemory.mockResolvedValue(page([{ id: 7, content: "Факт" }]));
    renderList();
    fireEvent.click(await screen.findByLabelText("Видалити факт: Факт"));
    expect(deleteAiMemory).not.toHaveBeenCalled();
    expect(screen.getByText("Видалити цей факт?")).toBeTruthy();
  });

  it("видаляє САМЕ той факт, на якому клікнули", async () => {
    // Найправдоподібніший баг списку: кнопка замикається на індекс або на
    // перший елемент. З однаковими на вигляд рядками це помітно лише тоді,
    // коли зникає не той факт — тобто вже після втрати даних.
    listAiMemory.mockResolvedValue(
      page([
        { id: 11, content: "Перший" },
        { id: 22, content: "Другий" },
        { id: 33, content: "Третій" },
      ]),
    );
    renderList();
    fireEvent.click(await screen.findByLabelText("Видалити факт: Другий"));
    fireEvent.click(screen.getByRole("button", { name: "Видалити назавжди" }));
    await waitFor(() => expect(deleteAiMemory).toHaveBeenCalledTimes(1));
    expect(deleteAiMemory).toHaveBeenCalledWith(22);
  });

  it("після видалення перечитує список — інакше стертий факт лишається на екрані", async () => {
    listAiMemory.mockResolvedValue(page([{ id: 7, content: "Факт" }]));
    renderList();
    fireEvent.click(await screen.findByLabelText("Видалити факт: Факт"));
    const before = listAiMemory.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Видалити назавжди" }));
    await waitFor(() =>
      expect(listAiMemory.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("скасування діалогу не видаляє нічого", async () => {
    listAiMemory.mockResolvedValue(page([{ id: 7, content: "Факт" }]));
    renderList();
    fireEvent.click(await screen.findByLabelText("Видалити факт: Факт"));
    fireEvent.click(
      screen.getByRole("button", { name: /Скасувати|Відмінити/ }),
    );
    expect(deleteAiMemory).not.toHaveBeenCalled();
  });

  it("«Показати більше» тягне наступну сторінку по курсору", async () => {
    // Курсор має приїхати з `nextCursor` попередньої сторінки. Якщо
    // передати щось інше (offset, довжину масиву), друга сторінка
    // мовчки продублює або пропустить рядки.
    listAiMemory
      .mockResolvedValueOnce(page([{ id: 30, content: "Перший" }], 30))
      .mockResolvedValueOnce(page([{ id: 20, content: "Другий" }], null));
    renderList();
    fireEvent.click(
      await screen.findByRole("button", { name: /Показати більше/ }),
    );
    expect(await screen.findByText("Другий")).toBeTruthy();
    expect(listAiMemory).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 30 }),
      expect.anything(),
    );
    // Перша сторінка лишається на екрані — сторінки склеюються, не заміщуються.
    expect(screen.getByText("Перший")).toBeTruthy();
  });

  it("остання сторінка ховає кнопку «Показати більше»", async () => {
    listAiMemory.mockResolvedValue(page([{ id: 1, content: "Єдиний" }], null));
    renderList();
    await screen.findByText("Єдиний");
    expect(
      screen.queryByRole("button", { name: /Показати більше/ }),
    ).toBeNull();
  });

  it("помилка видалення → повідомлення, факт лишається у списку", async () => {
    deleteAiMemory.mockRejectedValue(new Error("500"));
    listAiMemory.mockResolvedValue(page([{ id: 7, content: "Факт" }]));
    renderList();
    fireEvent.click(await screen.findByLabelText("Видалити факт: Факт"));
    fireEvent.click(screen.getByRole("button", { name: "Видалити назавжди" }));
    expect(await screen.findByText(/Не вдалося видалити/)).toBeTruthy();
    expect(screen.getByText("Факт")).toBeTruthy();
  });
});
