// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";

vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: ({
    onResult,
    label,
  }: {
    onResult: (transcript: string) => void;
    label?: string;
  }) => (
    <div data-testid="voice-mic">
      <button
        type="button"
        aria-label={label}
        onClick={() => onResult("кава 60 гривень")}
      >
        voice-valid
      </button>
      <button type="button" onClick={() => onResult("   ")}>
        voice-empty
      </button>
    </div>
  ),
}));

import { ManualExpenseAmountSection } from "./ManualExpenseAmountSection";
import type { ExpenseFormValues } from "./manualExpenseForm";

const registerMock = vi.fn((name: keyof ExpenseFormValues) => ({
  name,
  onBlur: vi.fn(),
  onChange: vi.fn(),
  ref: vi.fn(),
}));

function renderSection(
  overrides: Partial<ComponentProps<typeof ManualExpenseAmountSection>> = {},
) {
  const setValue = vi.fn() as unknown as UseFormSetValue<ExpenseFormValues>;
  const props: ComponentProps<typeof ManualExpenseAmountSection> = {
    amountId: "manual-amount",
    amountSuggestions: [],
    amountError: undefined,
    amountHeroVisible: false,
    amountNumeric: 0,
    isSubmitting: false,
    register: registerMock as unknown as UseFormRegister<ExpenseFormValues>,
    setValue,
    ...overrides,
  };

  return {
    setValue,
    ...render(<ManualExpenseAmountSection {...props} />),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ManualExpenseAmountSection", () => {
  it("renders quick amount chips, hero preview, error helper, and disabled input", () => {
    const { setValue } = renderSection({
      amountSuggestions: [
        { value: 200, personal: true },
        { value: 50, personal: false },
      ],
      amountError: "Вкажи суму більше 0",
      amountHeroVisible: true,
      amountNumeric: 200,
      isSubmitting: true,
    });

    const quickAmounts = screen.getByRole("group", { name: "Швидкі суми" });
    expect(within(quickAmounts).getByText("200 ₴")).toBeInTheDocument();
    fireEvent.click(within(quickAmounts).getByLabelText("200 ₴ — часта сума"));

    expect(setValue).toHaveBeenCalledWith("amount", "200", {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(screen.getByLabelText("Сума ₴")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Вкажи суму більше 0");
    expect(registerMock).toHaveBeenCalledWith("amount");
  });

  it("keeps optional rows absent when there are no suggestions or hero value", () => {
    renderSection();

    expect(
      screen.queryByRole("group", { name: "Швидкі суми" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0 ₴")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Сума ₴")).not.toBeDisabled();
  });

  it("applies parsed voice amount and description but ignores empty transcripts", () => {
    const { setValue } = renderSection({
      amountError: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: "Сказати голосом" }));
    expect(setValue).toHaveBeenCalledWith("description", "Кава гривень", {
      shouldDirty: true,
    });
    expect(setValue).toHaveBeenCalledWith("amount", "60", {
      shouldDirty: true,
      shouldValidate: false,
    });

    vi.mocked(setValue).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "voice-empty" }));
    expect(setValue).not.toHaveBeenCalled();
  });
});
