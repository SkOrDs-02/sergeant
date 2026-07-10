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
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));

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
      expect(screen.getByRole("button", { name: "Додати" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Додати" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));

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
