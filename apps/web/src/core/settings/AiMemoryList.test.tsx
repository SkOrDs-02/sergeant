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

  it("порожня памʼять → пояснення, а не порожнеча", async () => {
    listAiMemory.mockResolvedValue(page([]));
    renderList();
    expect(await screen.findByText(/Поки що ШІ нічого/)).toBeTruthy();
  });

  it("порожня памʼять малює спільний <EmptyState> (role=status), не голий <p> (V-14, аудит 2026-08-08)", async () => {
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

  it("великий список приходить згорнутим у групи за джерелом", async () => {
    // Скарга власника 2026-08-18: список читався як суцільне полотно на
    // кілька екранів. Понад `AUTO_OPEN_MAX_ITEMS` фактів → видно тільки
    // джерела з лічильниками, самі факти — за кліком.
    listAiMemory.mockResolvedValue(
      page([
        { id: 1, content: "Факт чату 1", source: "chat" },
        { id: 2, content: "Факт чату 2", source: "chat" },
        { id: 3, content: "Факт чату 3", source: "chat" },
        { id: 4, content: "Факт чату 4", source: "chat" },
        { id: 5, content: "Тижневий підсумок", source: "digest" },
        { id: 6, content: "Алергія на горіхи", source: "nutrition" },
      ]),
    );
    renderList();

    const chatGroup = await screen.findByRole("button", {
      name: /Показати факти джерела: Чат/,
    });
    expect(chatGroup.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Факт чату 1")).toBeNull();
    expect(screen.queryByText("Алергія на горіхи")).toBeNull();
    // Джерела лишаються видимими — це і є згорнутий зміст памʼяті.
    expect(
      screen.getByRole("button", {
        name: /Показати факти джерела: Харчування/,
      }),
    ).toBeTruthy();

    fireEvent.click(chatGroup);
    expect(screen.getByText("Факт чату 1")).toBeTruthy();
    // Розгортання однієї групи не розгортає сусідні.
    expect(screen.queryByText("Алергія на горіхи")).toBeNull();
  });

  it("маленька памʼять лишається розгорнутою — ховати нічого", async () => {
    listAiMemory.mockResolvedValue(
      page([
        { id: 1, content: "Перший", source: "chat" },
        { id: 2, content: "Другий", source: "chat" },
      ]),
    );
    renderList();
    expect(await screen.findByText("Перший")).toBeTruthy();
    expect(screen.getByText("Другий")).toBeTruthy();
  });

  it("довгий факт обрізається, поки його не розгорнути", async () => {
    // Довгим буває й справжній факт із чату — не лише службовий звіт
    // (`digest` тепер згорнутий за замовчуванням, тож важіль розгортання
    // перевіряємо на джерелі, яке видно одразу). Кнопка зʼявляється лише
    // для довгого тексту.
    const long = "Розповідав у чаті: ".padEnd(400, "довга передісторія ");
    listAiMemory.mockResolvedValue(
      page([
        { id: 1, content: long, source: "chat" },
        { id: 2, content: "Короткий факт", source: "chat" },
      ]),
    );
    renderList();

    const toggle = await screen.findByRole("button", {
      name: "Показати повністю",
    });
    expect(screen.getByText(long).className).toContain("line-clamp-3");
    fireEvent.click(toggle);
    expect(screen.getByText(long).className).not.toContain("line-clamp-3");
    expect(screen.getByRole("button", { name: "Згорнути" })).toBeTruthy();
    // Короткий факт не отримує зайвого важеля.
    expect(
      screen.queryAllByRole("button", { name: "Показати повністю" }),
    ).toHaveLength(0);
  });

  it("службові події застосунку — окремою групою, завжди згорнутою і в кінці", async () => {
    // Рішення власника 2026-08-18. `source='product'` — це 4 мілстоуни
    // телеметрії напів-англійським текстом (див. `eventSync.ts`), а не
    // факт про людину: не розкриваємо їх навіть у крихітній памʼяті і не
    // пускаємо вперед справжніх фактів.
    listAiMemory.mockResolvedValue(
      page([
        {
          id: 1,
          content: "2026-05-13: first action completed у модулі finyk.",
          source: "product",
        },
        { id: 2, content: "Алергія на горіхи", source: "nutrition" },
      ]),
    );
    renderList();

    // Справжній факт видно одразу (памʼять маленька), службовий — ні.
    expect(await screen.findByText("Алергія на горіхи")).toBeTruthy();
    expect(screen.queryByText(/first action completed/)).toBeNull();

    const groups = screen.getAllByRole("button", {
      name: /Показати факти джерела/,
    });
    // Службова група — остання, попри свіжіший id.
    expect(groups.at(-1)?.textContent).toContain("Події застосунку");
    expect(groups.at(-1)?.getAttribute("aria-expanded")).toBe("false");
    // Сире `product` в UI не світиться.
    expect(screen.queryByText(/\bПродукт\b/)).toBeNull();

    fireEvent.click(groups.at(-1)!);
    expect(screen.getByText(/first action completed/)).toBeTruthy();
    expect(screen.getByText(/Службові позначки застосунку/)).toBeTruthy();
  });

  it("тижневі звіти — теж службові: згорнуті, в кінці, зі своїм поясненням", async () => {
    // Рішення власника 2026-08-18. Дайджест — не факт, який людина
    // розповіла, а згенерований звіт абзацом; саме він роздував список.
    listAiMemory.mockResolvedValue(
      page([
        {
          id: 1,
          content: "Тижневий звіт 3 серп. — 9 серп. Витрати склали 75769 грн…",
          source: "digest",
        },
        { id: 2, content: "Алергія на горіхи", source: "nutrition" },
      ]),
    );
    renderList();

    expect(await screen.findByText("Алергія на горіхи")).toBeTruthy();
    expect(screen.queryByText(/Тижневий звіт/)).toBeNull();

    const groups = screen.getAllByRole("button", {
      name: /Показати факти джерела/,
    });
    expect(groups.at(-1)?.textContent).toContain("Підсумок тижня");
    expect(groups.at(-1)?.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(groups.at(-1)!);
    // Пояснення своє, не спільне з телеметрією.
    expect(screen.getByText(/склав сам із твоїх модулів/)).toBeTruthy();
    expect(screen.queryByText(/Службові позначки застосунку/)).toBeNull();
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
