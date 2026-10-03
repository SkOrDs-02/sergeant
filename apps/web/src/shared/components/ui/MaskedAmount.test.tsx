// @vitest-environment jsdom
/**
 * Востаннє перевірено: 2026-07-25
 * Статус: Активний
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/hooks/useHaptic", () => ({
  useHaptic: () => ({ tap: vi.fn(), success: vi.fn(), warn: vi.fn() }),
}));

import { MaskedAmount } from "./MaskedAmount";

afterEach(cleanup);

describe("MaskedAmount", () => {
  it("renders the raw value untouched when not masked", () => {
    render(<MaskedAmount masked={false}>-247,00₴</MaskedAmount>);
    expect(screen.getByText("-247,00₴")).toBeInTheDocument();
    // No reveal button in the unmasked state.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the value behind a reveal button when masked", () => {
    render(<MaskedAmount masked>-247,00₴</MaskedAmount>);
    const btn = screen.getByRole("button", {
      name: /натисни, щоб показати/i,
    });
    expect(btn).toBeInTheDocument();
    // Value is present in the DOM (for layout stability) but aria-hidden.
    expect(screen.getByText("-247,00₴")).toHaveAttribute("aria-hidden", "true");
  });

  it("reveals the value on tap and swaps to a hide affordance", () => {
    render(<MaskedAmount masked>-247,00₴</MaskedAmount>);
    fireEvent.click(
      screen.getByRole("button", { name: /натисни, щоб показати/i }),
    );
    // Button stays (tap again to re-hide), value is now visible.
    expect(
      screen.getByRole("button", { name: /натисни, щоб приховати/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("-247,00₴")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });

  it("drops a local peek when the global mask toggles off then on", () => {
    const { rerender } = render(<MaskedAmount masked>-247,00₴</MaskedAmount>);
    fireEvent.click(
      screen.getByRole("button", { name: /натисни, щоб показати/i }),
    );
    // Eye off → transparent passthrough (no button at all).
    rerender(<MaskedAmount masked={false}>-247,00₴</MaskedAmount>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // Eye on again → re-masked, local peek forgotten.
    rerender(<MaskedAmount masked>-247,00₴</MaskedAmount>);
    expect(
      screen.getByRole("button", { name: /натисни, щоб показати/i }),
    ).toBeInTheDocument();
  });

  it("stays non-interactive in the static variant even when masked", () => {
    render(
      <MaskedAmount masked interactive={false} label="сума за день">
        -336,00₴
      </MaskedAmount>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
