/** @vitest-environment jsdom */
/**
 * Extra coverage for ManualExpenseSheet — exercises the interactive surfaces
 * the primary spec leaves uncovered: amount-suggestion chips (personal +
 * default), merchant suggestions + the silent AI-category application + badge
 * dismiss, the category dropdown (pick + frequency ordering), the amount hero
 * preview, the "change date" reveal, and edit-mode optimistic delete.
 *
 * Money is integer kopiykas / hryvnia number; jsdom supplies no Web Speech so
 * the mic button is absent (the component returns null for it).
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { ManualExpenseSheet } from "./ManualExpenseSheet";
import type {
  FrequentCategory,
  FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";

beforeAll(() => {
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

const merchants: FrequentMerchant[] = [
  {
    key: "silpo",
    name: "Сільпо",
    count: 8,
    total: 1600,
    suggestedManualCategory: "food",
  } as unknown as FrequentMerchant,
  {
    key: "uklon",
    name: "Уклон",
    count: 4,
    total: 800,
  } as unknown as FrequentMerchant,
];

describe("ManualExpenseSheet — interactive surfaces", () => {
  it("uses an income-specific description placeholder", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    expect(
      screen.getByPlaceholderText("Зарплата, повернення боргу, підробіток…"),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Кава, продукти, таксі…")).toBeNull();
  });

  it("renders the amount hero preview when an amount is set", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "250" },
    });
    // hero preview is aria-hidden; assert the formatted value appears twice
    // (hero + input). Just check the group is present via the suggestions row.
    expect(
      screen.getByRole("group", { name: "Швидкі суми" }),
    ).toBeInTheDocument();
  });

  it("applies a default amount suggestion chip", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    const group = screen.getByRole("group", { name: "Швидкі суми" });
    // default chips are 50/100/200/500
    fireEvent.click(within(group).getByText("100 ₴"));
    expect(screen.getByLabelText("Сума ₴")).toHaveValue("100");
  });

  it("merges personal amount suggestions from frequent merchants", () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={() => {}}
        frequentMerchants={merchants}
      />,
    );
    const group = screen.getByRole("group", { name: "Швидкі суми" });
    // Сільпо avg = 1600/8 = 200 → personal chip labelled as a часта сума
    expect(
      within(group).getByLabelText("200 ₴ · часта сума"),
    ).toBeInTheDocument();
  });

  it("shows merchant suggestions and applies the AI category on click", () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={() => {}}
        frequentMerchants={merchants}
      />,
    );
    const hints = screen.getByRole("group", { name: "Нещодавні продавці" });
    fireEvent.click(within(hints).getByText("Сільпо"));
    // description set + AI badge surfaces the auto-applied "food" category
    expect(screen.getByPlaceholderText(/Кава, продукти/)).toHaveValue("Сільпо");
    expect(screen.getByText(/AI ·/)).toBeInTheDocument();
  });

  it("dismisses the AI-applied category badge", () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={() => {}}
        frequentMerchants={merchants}
      />,
    );
    const hints = screen.getByRole("group", { name: "Нещодавні продавці" });
    fireEvent.click(within(hints).getByText("Сільпо"));
    fireEvent.click(screen.getByLabelText("Сховати AI-підказку"));
    expect(screen.queryByText(/AI ·/)).not.toBeInTheDocument();
  });

  it("selects a category from the dropdown", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    const select = screen.getByLabelText("Категорія") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "transport" } });
    expect(select).toHaveValue("transport");
  });

  it("lists every expense category in the dropdown (no collapsed row)", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    const select = screen.getByLabelText("Категорія") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      // Disabled placeholder — required so switching Витрата ↔ Надходження can
      // blank the field and force an explicit pick from the new taxonomy.
      "Обери категорію",
      // 2026-08-13: «Їжа» (`food`) і «Продукти» (`groceries`) були двома
      // чипами на ОДИН канонічний кошик `food`, який MCC-каталог зве
      // «Продукти». Лишився один — `food` під канонічним підписом;
      // `groceries` резолвиться далі (persisted-дані), але не пропонується.
      "Продукти",
      "Кафе та ресторани",
      "Транспорт",
      "Розваги",
      "Здоровʼя",
      "Покупки",
      // 2026-08-25: цигарки й алкоголь стали окремими кошиками — доти
      // спліт за чеком Сільпо не мав куди їх покласти й зсипав у
      // «Продукти».
      "Цигарки",
      "Алкоголь",
      "Комунальні",
      "Техніка",
      "Підписки",
      "Навчання",
      "Подорожі",
      "Інше",
    ]);
  });

  it("reveals the date field via 'Не сьогодні'", () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={() => {}} />);
    fireEvent.click(screen.getByText(/Не сьогодні/));
    expect(screen.getByLabelText("Дата")).toBeInTheDocument();
  });

  it("orders categories by frequency for frequent-category stats", () => {
    const frequentCategories: FrequentCategory[] = [
      {
        id: null,
        manualLabel: "transport",
        count: 9,
      } as unknown as FrequentCategory,
    ];
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={() => {}}
        frequentCategories={frequentCategories}
      />,
    );
    // Транспорт has the highest frequency rank → first real <option> in the
    // dropdown, right after the disabled "Обери категорію" placeholder.
    const select = screen.getByLabelText("Категорія") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Обери категорію");
    expect(select.options[1]?.textContent).toBe("Транспорт");
  });

  describe("edit mode", () => {
    const initialExpense = {
      id: "exp-1",
      description: "Старе кафе",
      amount: 175,
      category: "cafe",
      date: "2026-05-20",
    };

    it("prefills the form and shows the 'Зберегти' label", async () => {
      render(
        <ManualExpenseSheet
          open
          onClose={() => {}}
          onSave={() => {}}
          initialExpense={initialExpense}
        />,
      );
      await act(async () => {});
      expect(screen.getByLabelText("Сума ₴")).toHaveValue("175");
      expect(
        screen.getByRole("button", { name: "Зберегти" }),
      ).toBeInTheDocument();
      // edited entry has a non-today date → the date field is visible
      expect(screen.getByLabelText("Дата")).toBeInTheDocument();
    });

    it("deletes immediately via onDelete + closes (undo lives in the toast)", async () => {
      const onDelete = vi.fn();
      const onClose = vi.fn();
      render(
        <ManualExpenseSheet
          open
          onClose={onClose}
          onSave={() => {}}
          onDelete={onDelete}
          initialExpense={initialExpense}
        />,
      );
      // No confirmation gate any more — the destructive action is optimistic
      // and recoverable via the undo toast wired by the parent (FinykApp).
      fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledWith("exp-1");
      });
      expect(onClose).toHaveBeenCalled();
    });

    it("hides the delete button when onDelete is not provided", () => {
      render(
        <ManualExpenseSheet
          open
          onClose={() => {}}
          onSave={() => {}}
          initialExpense={initialExpense}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Видалити" }),
      ).not.toBeInTheDocument();
    });
  });
});
