// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { NowItem } from "./nowItems";
import type { UseNowItemsResult } from "./useNowItems";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  navigate: vi.fn(),
  emitHubBus: vi.fn(),
  openHubModuleWithAction: vi.fn(),
  trackEvent: vi.fn(),
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
vi.mock("../../observability/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../observability/analytics")>()),
  trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
}));

const { NowPile, promoteDanger, actionLabel } = await import("./NowPile");

function item(over: Partial<NowItem> & { id: string }): NowItem {
  return {
    module: "nutrition",
    priority: 50,
    title: `title ${over.id}`,
    action: { kind: "open_module", module: "nutrition" },
    ...over,
  };
}

function renderPile(items: NowItem[], onOpenTarget = vi.fn()) {
  const now: UseNowItemsResult = {
    items,
    check: mocks.check,
    checked: [],
    uncheck: vi.fn(),
  };
  render(
    <MemoryRouter>
      <NowPile now={now} onOpenTarget={onOpenTarget} />
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

describe("actionLabel", () => {
  it("називає результат: імперативна дія модуля, відкриття модуля, звіт тижня", () => {
    expect(
      actionLabel(
        item({
          id: "a",
          action: {
            kind: "module_action",
            module: "finyk",
            action: "add_expense",
          },
        }),
      ),
    ).toBe("Додати витрату");
    expect(
      actionLabel(
        item({ id: "b", action: { kind: "open_module", module: "routine" } }),
      ),
    ).toBe("Відкрити Рутину");
    expect(
      actionLabel(item({ id: "c", action: { kind: "open_week_report" } })),
    ).toBe("Відкрити звіт тижня");
  });
});

describe("NowPile", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockClear();
  });

  it("порожня купа: один рядок факту без кнопок", () => {
    renderPile([]);
    expect(screen.getByTestId("now-empty")).toHaveTextContent(
      "Сьогодні все закрито",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("рядки мови H: чекбокс, назва, підзаголовок, дія; без «×» і чипа «Сержант»", () => {
    renderPile([item({ id: "a", body: "Сільпо, Uklon" })]);
    const row = screen.getByTestId("now-row");
    expect(
      within(row).getByRole("checkbox", { name: /title a/ }),
    ).toHaveAttribute("aria-checked", "false");
    expect(row).toHaveTextContent("Сільпо, Uklon");
    expect(
      within(row).getByRole("button", { name: "Відкрити Їжу: title a" }),
    ).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Сержант/ })).toBeNull();
    expect(
      within(row).queryByRole("button", { name: /Закрити підказку/ }),
    ).toBeNull();
  });

  it("чекбокс закриває пункт (переносить у «Закрито»)", () => {
    const items = [item({ id: "a" })];
    renderPile(items);
    fireEvent.click(screen.getByRole("checkbox", { name: /title a/ }));
    expect(mocks.check).toHaveBeenCalledWith(items[0]);
  });

  it("три рядки + «ще N»; хвіст розгортається й згортається тим самим вузлом", () => {
    renderPile(
      [1, 2, 3, 4, 5].map((n) => item({ id: `i${n}`, priority: 100 - n })),
    );
    expect(screen.getAllByTestId("now-row")).toHaveLength(3);
    const toggle = screen.getByRole("button", { name: "ще 2" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getAllByTestId("now-row")).toHaveLength(5);
    const collapse = screen.getByRole("button", { name: "Згорнути" });
    expect(collapse).toBe(toggle);
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);
    expect(screen.getAllByTestId("now-row")).toHaveLength(3);
  });

  it("без хвоста перемикача немає", () => {
    renderPile([1, 2, 3].map((n) => item({ id: `i${n}`, priority: 100 - n })));
    expect(screen.queryByRole("button", { name: /^ще / })).toBeNull();
  });

  it("верхній рядок з імперативною дією: джерело today_focus_cta і подія CTA", () => {
    renderPile([
      item({
        id: "nutrition_protein_low",
        action: {
          kind: "module_action",
          module: "nutrition",
          action: "add_meal",
        },
      }),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: /: title nutrition_protein_low/ }),
    );
    expect(mocks.openHubModuleWithAction).toHaveBeenCalledWith(
      "nutrition",
      "add_meal",
      "today_focus_cta",
    );
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "today_focus_cta_clicked",
      expect.objectContaining({
        rec_id: "nutrition_protein_low",
        has_pwa_action: true,
      }),
    );
  });

  it("нижчий рядок: «Відкрити» іде через onOpenTarget з hash, без події CTA", () => {
    const onOpenTarget = renderPile([
      item({ id: "top", priority: 99 }),
      item({
        id: "x",
        module: "finyk",
        action: {
          kind: "open_module",
          module: "finyk",
          hash: "budgets?cat=smoking",
        },
      }),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити Фінік: title x" }),
    );
    expect(onOpenTarget).toHaveBeenCalledWith("finyk", "budgets?cat=smoking");
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("рядок-інсайт із навігацією іде маршрутом, а не через модуль", () => {
    renderPile([
      item({
        id: "fizruk-pr-pending",
        module: "fizruk",
        action: { kind: "navigate", path: "/fizruk/workouts" },
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Відкрити: / }));
    expect(mocks.navigate).toHaveBeenCalledWith("/fizruk/workouts");
  });

  // f3 (рішення власника 2026-10-01): «Відкрити» з тижневої картки веде в
  // «Звіт тижня» на хабі, а не в огляд Фініка за місяць.
  it("тижнева картка: кнопка називає призначення й шле подію хабу", () => {
    const onOpenTarget = renderPile([
      item({
        id: "spending_velocity_high",
        module: "finyk",
        action: { kind: "open_week_report" },
      }),
    ]);
    const button = screen.getByRole("button", { name: /Відкрити звіт тижня/ });
    expect(button.className).toContain("touch-target");
    fireEvent.click(button);
    expect(mocks.emitHubBus).toHaveBeenCalledWith("openWeekReport", undefined);
    expect(onOpenTarget).not.toHaveBeenCalled();
  });
});
