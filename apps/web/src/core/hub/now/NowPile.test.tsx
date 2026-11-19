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

function renderPile(
  items: NowItem[],
  onOpenTarget = vi.fn(),
  onCheckHabit?: (habitId: string) => void,
) {
  const now: UseNowItemsResult = {
    items,
    check: mocks.check,
    checked: [],
    uncheck: vi.fn(),
  };
  render(
    <MemoryRouter>
      <NowPile
        now={now}
        onOpenTarget={onOpenTarget}
        onCheckHabit={onCheckHabit}
      />
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

  it("після чекбокса фокус іде на заголовок купи, а не губиться на <body>", () => {
    renderPile([item({ id: "a" })]);
    const box = screen.getByRole("checkbox", { name: /title a/ });
    box.focus();
    fireEvent.click(box);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Зараз" }),
    );
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
    // Розгорнутий хвіст уже нічого не ховає: «ще N» зникає, доступне імʼя
    // «Згорнути», видимий стан — шеврон (знахідка зйомки 2026-11-18: «ще 1»
    // після розгортання; видимий текст стану забороняє UI-канон).
    const collapse = screen.getByRole("button", { name: "Згорнути" });
    expect(collapse).toBe(toggle);
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(collapse.textContent).not.toMatch(/ще/);
    expect(screen.queryByText("Згорнути")).toBeNull();

    fireEvent.click(collapse);
    expect(screen.getAllByTestId("now-row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "ще 2" })).toBe(toggle);
  });

  it("рядок «ще N звичок» іде разом зі своїми звичками, лічильник рахує справи", () => {
    const habit = (id: string, title: string) =>
      item({
        id: `routine_habit_now_${id}`,
        title,
        module: "routine",
        priority: 65,
        action: { kind: "open_module", module: "routine" },
        checkbox: { kind: "habit", habitId: id },
      });
    const more = item({
      id: "routine_habits_now_more",
      title: "Ще 2 звички на сьогодні",
      module: "routine",
      priority: 65,
      action: { kind: "open_module", module: "routine" },
      checkbox: { kind: "none" },
      represents: 2,
    });
    // Кадр `hub-now-habits-0.png`: їжа + дві звички заповнюють трійку.
    renderPile([
      item({ id: "food", priority: 70 }),
      habit("h1", "Вода"),
      habit("h2", "Прогулянка"),
      more,
    ]);
    const rows = screen.getAllByTestId("now-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("title food"),
      expect.stringContaining("Вода"),
      expect.stringContaining("Прогулянка"),
      expect.stringContaining("Ще 2 звички на сьогодні"),
    ]);
    // Нічого не сховано — перемикача немає.
    expect(screen.queryByRole("button", { name: /^ще / })).toBeNull();
  });

  it("звички поза трійкою ховаються разом із рядком «ще N», і «ще» рахує справи", () => {
    renderPile([
      item({ id: "a", priority: 90 }),
      item({ id: "b", priority: 80 }),
      item({ id: "c", priority: 70 }),
      item({
        id: "routine_habit_now_h1",
        title: "Вода",
        priority: 65,
        checkbox: { kind: "habit", habitId: "h1" },
      }),
      item({
        id: "routine_habits_now_more",
        title: "Ще 2 звички на сьогодні",
        priority: 65,
        checkbox: { kind: "none" },
        represents: 2,
      }),
    ]);
    expect(screen.getAllByTestId("now-row")).toHaveLength(3);
    expect(screen.queryByText("Ще 2 звички на сьогодні")).toBeNull();
    // Сховано звичку «Вода» і ще дві: три справи.
    expect(screen.getByRole("button", { name: "ще 3" })).toBeInTheDocument();
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
    expect(button.className).toContain("min-h-[44px]");
    fireEvent.click(button);
    expect(mocks.emitHubBus).toHaveBeenCalledWith("openWeekReport", undefined);
    expect(onOpenTarget).not.toHaveBeenCalled();
  });
});

describe("ChecklistNowRows", () => {
  it("рядок кроку без декоративного чекбокса (v3.2, позиція 16)", () => {
    render(
      <MemoryRouter>
        <NowPile
          now={{ items: [], check: mocks.check, checked: [], uncheck: vi.fn() }}
          onOpenTarget={vi.fn()}
          checklist={{
            moduleId: "finyk",
            steps: [
              {
                id: "view_analytics",
                label: "Переглянути аналітику",
                done: false,
              } as never,
            ],
          }}
        />
      </MemoryRouter>,
    );
    const row = screen.getByTestId("checklist-now-row");
    expect(within(row).getByText("Переглянути аналітику")).toBeTruthy();
    expect(row.querySelector('[class*="border-2"]')).toBeNull();
    expect(within(row).queryByRole("checkbox")).toBeNull();
  });
});

describe("рядки звичок (Р-2 (а), П-16 (А))", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockClear();
  });

  it("чекбокс звички відмічає її, а не закриває на сьогодні; доступні імена різні", () => {
    const onCheckHabit = vi.fn();
    renderPile(
      [
        item({
          id: "routine_habit_now_h1",
          title: "Вода",
          module: "routine",
          action: { kind: "open_module", module: "routine" },
          checkbox: { kind: "habit", habitId: "h1" },
        }),
        item({ id: "a" }),
      ],
      vi.fn(),
      onCheckHabit,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Відмітити звичку: Вода" }),
    );
    expect(onCheckHabit).toHaveBeenCalledWith("h1");
    expect(mocks.check).not.toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: "Закрити на сьогодні: title a" }),
    ).toBeInTheDocument();
  });

  it("рядок «ще N звичок» без чекбокса, веде в Рутину; лічильник рахує N", () => {
    const onOpenTarget = vi.fn();
    renderPile(
      [
        item({
          id: "routine_habits_now_more",
          title: "Ще 3 звички на сьогодні",
          module: "routine",
          action: { kind: "open_module", module: "routine" },
          checkbox: { kind: "none" },
          represents: 3,
        }),
      ],
      onOpenTarget,
    );
    const row = screen.getByTestId("now-row");
    expect(within(row).queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      within(row).getByRole("button", {
        name: "Відкрити Рутину: Ще 3 звички на сьогодні",
      }),
    );
    expect(onOpenTarget).toHaveBeenCalledWith("routine", undefined);
    // Лічильник «зараз N» рахує справи, а не рядки.
    expect(screen.getByText("3", { selector: "span" })).toBeInTheDocument();
  });
});
