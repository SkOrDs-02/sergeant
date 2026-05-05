/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ManualExpenseSheet } from "./ManualExpenseSheet";

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
    // Default category is "🏷 інше" — matches DEFAULT_CATEGORY у компоненті.
    expect(call.category).toBe("🏷 інше");
    // ISO-8601 date string ('YYYY-MM-DDTHH:mm:ss.sssZ').
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to category-derived description when name is empty", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        initialCategory="🍴 їжа"
      />,
    );

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as { description: string };
    // stripEmoji("🍴 їжа") → "їжа".
    expect(call.description).toBe("їжа");
  });
});
