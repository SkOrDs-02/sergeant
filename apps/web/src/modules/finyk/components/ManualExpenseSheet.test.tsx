/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ManualExpenseSheet, upgradeCategory } from "./ManualExpenseSheet";

// Web Speech API check inside `VoiceMicButton` short-circuits to null when
// SpeechRecognition isn't on `window`, which is exactly what jsdom gives
// us — so the mic button is absent and we don't have to mock it.

// `useVisualKeyboardInset` listens to the visualViewport. jsdom lacks
// that API; the hook handles the missing global gracefully (returns 0),
// so no mock needed.

beforeAll(() => {
  // hapticSuccess() pings navigator.vibrate which jsdom doesn't provide.
  // We just want to silence the call so it doesn't throw on submit paths.
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ─── upgradeCategory unit tests — all 3 storage eras ─────────────────────────
describe("upgradeCategory — era detection", () => {
  it("Era 3: known slug passes through unchanged", () => {
    expect(upgradeCategory("food")).toBe("food");
    expect(upgradeCategory("transport")).toBe("transport");
    expect(upgradeCategory("other")).toBe("other");
  });

  it("Era 2: emoji-prefixed strings upgrade to slug", () => {
    expect(upgradeCategory("🍴 їжа")).toBe("food");
    expect(upgradeCategory("🚗 транспорт")).toBe("transport");
    expect(upgradeCategory("🏷 інше")).toBe("other");
    expect(upgradeCategory("🍔 кафе та ресторани")).toBe("cafe");
    expect(upgradeCategory("💊 здоров'я")).toBe("health");
  });

  it("Era 1: bare UA labels upgrade to slug", () => {
    expect(upgradeCategory("їжа")).toBe("food");
    expect(upgradeCategory("транспорт")).toBe("transport");
    expect(upgradeCategory("розваги")).toBe("entertainment");
    expect(upgradeCategory("здоров'я")).toBe("health");
    expect(upgradeCategory("одяг")).toBe("shopping");
    expect(upgradeCategory("комунальні")).toBe("utilities");
    expect(upgradeCategory("техніка")).toBe("tech");
    expect(upgradeCategory("інше")).toBe("other");
  });

  it("null / undefined / unknown value falls back to 'other'", () => {
    expect(upgradeCategory(null)).toBe("other");
    expect(upgradeCategory(undefined)).toBe("other");
    expect(upgradeCategory("")).toBe("other");
    expect(upgradeCategory("🤷 невідоме")).toBe("other");
  });
});

describe("ManualExpenseSheet — useApiForm + zod (Item #8 round-13)", () => {
  it("flags non-positive amount via aria-invalid + zod refine, blocks onSave", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    const amountInput = screen.getByLabelText("Сума ₴");
    fireEvent.change(amountInput, { target: { value: "0" } });
    // Footer Submit button — `Sheet` renders it outside `<form>`, тож
    // тиснемо як user-click; useApiForm.submit() прокидує zod-валідацію.
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(amountInput).toHaveAttribute("aria-invalid", "true");
    });
    expect(screen.getByText("Вкажи суму більше 0")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits with normalized number amount + ISO date and closes", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "120.5" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Кава, продукти/), {
      target: { value: "  Кава  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      amount: number;
      category: string;
      date: string;
    };
    expect(call.amount).toBe(120.5);
    expect(call.description).toBe("Кава");
    // Default category is now slug "other" (F5b — was "🏷 інше").
    expect(call.category).toBe("other");
    // ISO-8601 date string ('YYYY-MM-DDTHH:mm:ss.sssZ').
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to category display label when name is empty (Era 2 initialCategory)", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        // Era 2 emoji string — upgraded to slug "food" at read-time.
        initialCategory="🍴 їжа"
      />,
    );
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "200" },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Додати витрату" }),
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      category: string;
    };
    // CATEGORY_DISPLAY["food"].label = "Їжа" (capitalised, no emoji).
    expect(call.description).toBe("Їжа");
    // Write path always emits slug.
    expect(call.category).toBe("food");
  });

  it("falls back to category display label when name is empty (Era 1 initialCategory)", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        // Era 1 bare UA label — upgraded to slug "transport" at read-time.
        initialCategory="транспорт"
      />,
    );
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      category: string;
    };
    expect(call.description).toBe("Транспорт");
    expect(call.category).toBe("transport");
  });
});

// ─── Kind segment switch (fab-and-manual-income spec) ────────────────────────
describe("ManualExpenseSheet — kind segment switch", () => {
  it("defaults to Витрата, switching to Надходження shows income categories + dynamic CTA", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Витрата" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Додати витрату" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const categorySelect = screen.getByLabelText(
      "Категорія",
    ) as HTMLSelectElement;
    const optionLabels = Array.from(categorySelect.options).map(
      (o) => o.textContent,
    );
    expect(optionLabels).toEqual([
      "Оберіть категорію",
      "Зарплата",
      "Фріланс",
      "Подарунок",
      "Повернення",
      "Інше",
    ]);
    // Expense-only categories must not leak into income mode.
    expect(optionLabels).not.toContain("Продукти");
    expect(
      screen.getByRole("button", { name: "Додати надходження" }),
    ).toBeInTheDocument();
  });

  it("submits kind: income with an income-taxonomy category after switching segment", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Категорія"), {
      target: { value: "salary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати надходження" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      amount: number;
      category: string;
      kind: string;
    };
    expect(call.amount).toBe(5000);
    expect(call.category).toBe("salary");
    expect(call.kind).toBe("income");
  });

  it("editing an income entry preselects the Надходження segment + saved category", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        initialExpense={{
          id: "1",
          description: "Зарплата",
          amount: 5000,
          category: "salary",
          kind: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Зберегти" }),
    ).toBeInTheDocument();
  });

  it("requires a new category when an edited income becomes an expense", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        initialExpense={{
          id: "1",
          description: "Зарплата",
          amount: 5000,
          category: "salary",
          kind: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Витрата" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Оберіть категорію");
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Категорія"), {
      target: { value: "transport" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: "transport", kind: "expense" }),
    );
  });

  it("editing a legacy type: income entry (no kind, HubChat-era) also preselects Надходження", async () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        initialExpense={{
          id: "2",
          description: "Фріланс проєкт",
          amount: 3000,
          category: "freelance",
          type: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switching kind clears the old taxonomy category", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    fireEvent.click(screen.getByRole("tab", { name: "Витрата" }));
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Оберіть категорію");
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
