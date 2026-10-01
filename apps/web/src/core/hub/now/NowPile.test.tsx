// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { NowItem } from "./nowItems";

const mocks = vi.hoisted(() => ({
  items: [] as NowItem[],
  postponed: 0,
  restorePostponed: vi.fn(),
  dismiss: vi.fn(),
  navigate: vi.fn(),
  emitHubBus: vi.fn(),
  openHubModuleWithAction: vi.fn(),
  askAiExhausted: false,
}));

vi.mock("./useNowItems", () => ({
  useNowItems: () => ({
    items: mocks.items,
    dismiss: mocks.dismiss,
    postponed: mocks.postponed,
    restorePostponed: mocks.restorePostponed,
  }),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: (...args: unknown[]) => mocks.emitHubBus(...args),
}));
vi.mock("@shared/lib/modules/hubNav", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/modules/hubNav")>()),
  openHubModuleWithAction: (...args: unknown[]) =>
    mocks.openHubModuleWithAction(...args),
}));
vi.mock("@shared/lib/insights/useAskAiQuota", () => ({
  useAskAiQuotaExhausted: () => mocks.askAiExhausted,
}));

const { NowPile, promoteDanger } = await import("./NowPile");

function item(over: Partial<NowItem> & { id: string }): NowItem {
  return {
    module: "nutrition",
    priority: 50,
    title: `title ${over.id}`,
    action: { kind: "open_module", module: "nutrition" },
    ...over,
  };
}

function renderPile(onOpenTarget = vi.fn()) {
  render(
    <MemoryRouter>
      <NowPile onOpenTarget={onOpenTarget} />
    </MemoryRouter>,
  );
  return onOpenTarget;
}

describe("promoteDanger", () => {
  it("danger пробивається в трійку, порядок усередині груп збережений", () => {
    const list = [
      item({ id: "a", priority: 90 }),
      item({ id: "b", priority: 80 }),
      item({ id: "c", priority: 70 }),
      item({ id: "d", priority: 60, severity: "danger" }),
      item({ id: "e", priority: 50 }),
    ];
    expect(promoteDanger(list, 3).map((i) => i.id)).toEqual(["d", "a", "b"]);
  });
});

describe("NowPile", () => {
  beforeEach(() => {
    mocks.items = [];
    mocks.postponed = 0;
    mocks.restorePostponed.mockClear();
    mocks.dismiss.mockClear();
    mocks.navigate.mockClear();
    mocks.emitHubBus.mockClear();
    mocks.openHubModuleWithAction.mockClear();
    mocks.askAiExhausted = false;
  });

  it("порожня купа — один рядок без CTA, лічильник 0", () => {
    renderPile();
    expect(screen.getByTestId("now-empty")).toHaveTextContent(
      "Сьогодні все закрито",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("порожньо лише через «✕» сьогодні: «Відкладено N · показати» замість «все закрито»", () => {
    mocks.postponed = 3;
    renderPile();

    expect(screen.queryByTestId("now-empty")).toBeNull();
    expect(
      screen.queryByText(/Сьогодні все закрито/, { exact: false }),
    ).toBeNull();
    const restore = screen.getByRole("button", {
      name: "Відкладено 3 · показати",
    });
    // ≥44 px на coarse pointer.
    expect(restore.className).toContain("touch-target");

    fireEvent.click(restore);
    expect(mocks.restorePostponed).toHaveBeenCalledTimes(1);
  });

  it("«все закрито» лишається, коли відкладеного справді немає", () => {
    mocks.postponed = 0;
    renderPile();
    expect(screen.getByTestId("now-empty")).toHaveTextContent(
      "Сьогодні все закрито",
    );
    expect(screen.queryByTestId("now-postponed")).toBeNull();
  });

  it("є рядки в «Зараз» — «Відкладено» не показується навіть із відкладеним", () => {
    mocks.postponed = 2;
    mocks.items = [item({ id: "a", priority: 90 })];
    renderPile();
    expect(screen.queryByTestId("now-postponed")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "title a" }),
    ).toBeInTheDocument();
  });

  it("hero + два рядки + «ще N»; хвіст розгортається лише тапом", () => {
    mocks.items = [1, 2, 3, 4, 5].map((n) =>
      item({ id: `i${n}`, priority: 100 - n }),
    );
    renderPile();
    // Hero — заголовок першого рядка в картці, ще два — рядками.
    expect(
      screen.getByRole("heading", { name: "title i1" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("now-row")).toHaveLength(2);
    const more = screen.getByRole("button", { name: "ще 2" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    expect(screen.getAllByTestId("now-row")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /^ще / })).toBeNull();
  });

  it("розгорнутий хвіст згортається назад: «Згорнути» ↔ «ще N», aria-expanded відстежує стан", () => {
    mocks.items = [1, 2, 3, 4, 5].map((n) =>
      item({ id: `i${n}`, priority: 100 - n }),
    );
    renderPile();

    const toggle = screen.getByRole("button", { name: "ще 2" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getAllByTestId("now-row")).toHaveLength(4);
    // Той самий вузол: фокус клавіатури не втрачається при перемиканні.
    const collapse = screen.getByRole("button", { name: "Згорнути" });
    expect(collapse).toBe(toggle);
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(collapse.className).toContain("touch-target");

    fireEvent.click(collapse);
    expect(screen.getAllByTestId("now-row")).toHaveLength(2);
    const more = screen.getByRole("button", { name: "ще 2" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    // І знову розгортається: це перемикач, а не одноразова кнопка.
    fireEvent.click(more);
    expect(screen.getAllByTestId("now-row")).toHaveLength(4);
  });

  it("без хвоста перемикача немає", () => {
    mocks.items = [1, 2, 3].map((n) =>
      item({ id: `i${n}`, priority: 100 - n }),
    );
    renderPile();
    expect(screen.queryByRole("button", { name: /^ще / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Згорнути" })).toBeNull();
  });

  it("hero з імперативною дією виконує її через шину з джерелом today_focus_cta", () => {
    mocks.items = [
      item({
        id: "nutrition_protein_low",
        module: "nutrition",
        action: {
          kind: "module_action",
          module: "nutrition",
          action: "add_meal",
        },
        recId: "nutrition_protein_low",
      }),
    ];
    renderPile();
    // Primary CTA `TodayFocusCard` для `pwaAction` — «Додати прийом їжі» з
    // `getModulePrimaryAction`.
    fireEvent.click(screen.getByRole("button", { name: /Додати прийом їжі/ }));
    expect(mocks.openHubModuleWithAction).toHaveBeenCalledWith(
      "nutrition",
      "add_meal",
      "today_focus_cta",
    );
  });

  it("рядок нижче за hero: «Відкрити» іде через onOpenTarget з hash, чип AI — у чат, ✕ — dismiss", () => {
    mocks.items = [
      item({ id: "hero", priority: 99 }),
      item({
        id: "x",
        module: "finyk",
        action: {
          kind: "open_module",
          module: "finyk",
          hash: "budgets?cat=smoking",
        },
        askAiPrompt: "Що з цигарками?",
      }),
    ];
    const onOpenTarget = renderPile();
    const row = screen.getByTestId("now-row");
    fireEvent.click(within(row).getByRole("button", { name: /Відкрити/ }));
    expect(onOpenTarget).toHaveBeenCalledWith("finyk", "budgets?cat=smoking");

    fireEvent.click(
      within(row).getByRole("button", { name: "Спитати Сержанта про це" }),
    );
    expect(mocks.emitHubBus).toHaveBeenCalledWith("openChat", {
      message: "Що з цигарками?",
      autoSend: false,
    });

    fireEvent.click(
      row.querySelector('button[aria-label="Закрити підказку"]') as HTMLElement,
    );
    expect(mocks.dismiss).toHaveBeenCalledWith(mocks.items[1]);
  });

  it("рядок-інсайт із навігацією іде маршрутом, а не через модуль", () => {
    mocks.items = [
      item({ id: "hero", priority: 99 }),
      item({
        id: "fizruk-pr-pending",
        module: "fizruk",
        action: { kind: "navigate", path: "/fizruk/workouts" },
      }),
    ];
    renderPile();
    fireEvent.click(
      within(screen.getByTestId("now-row")).getByRole("button", {
        name: /Відкрити/,
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith("/fizruk/workouts");
  });

  it("чип AI на рядку не рендериться без askAiPrompt", () => {
    mocks.items = [item({ id: "hero", priority: 99 }), item({ id: "x" })];
    renderPile();
    expect(
      screen.queryByRole("button", { name: "Спитати Сержанта про це" }),
    ).toBeNull();
  });
});
