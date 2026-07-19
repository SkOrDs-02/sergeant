/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  KeyboardAccessory,
  AMOUNT_CHIPS_UAH,
  PORTION_CHIPS_GRAM,
} from "./KeyboardAccessory";

afterEach(cleanup);

describe("KeyboardAccessory", () => {
  it("renders one button per chip with its label", () => {
    const { getByText } = render(
      <KeyboardAccessory chips={AMOUNT_CHIPS_UAH} onChipPress={() => {}} />,
    );
    for (const chip of AMOUNT_CHIPS_UAH) {
      expect(getByText(chip.label)).toBeInTheDocument();
    }
  });

  it("calls onChipPress with the chip when clicked", () => {
    const onChipPress = vi.fn();
    const { getByText } = render(
      <KeyboardAccessory
        chips={PORTION_CHIPS_GRAM}
        onChipPress={onChipPress}
      />,
    );
    fireEvent.click(getByText("100g"));
    expect(onChipPress).toHaveBeenCalledWith({ label: "100g", value: 100 });
  });

  it("renders a toolbar role with the quick-fill aria-label", () => {
    const { getByRole } = render(
      <KeyboardAccessory chips={[]} onChipPress={() => {}} />,
    );
    expect(getByRole("toolbar")).toBeInTheDocument();
  });

  it("renders optional leading content", () => {
    const { getByTestId } = render(
      <KeyboardAccessory
        chips={[]}
        onChipPress={() => {}}
        leading={<span data-testid="leading">г</span>}
      />,
    );
    expect(getByTestId("leading")).toBeInTheDocument();
  });

  it("applies the default variant chip classes", () => {
    const { getByText } = render(
      <KeyboardAccessory
        chips={[{ label: "1", value: 1 }]}
        onChipPress={() => {}}
      />,
    );
    expect(getByText("1").className).toContain("bg-brand/10");
  });

  it("applies a module variant's chip classes", () => {
    const { getByText } = render(
      <KeyboardAccessory
        chips={[{ label: "1", value: 1 }]}
        onChipPress={() => {}}
        variant="nutrition"
      />,
    );
    expect(getByText("1").className).toContain("bg-nutrition/10");
  });
});
