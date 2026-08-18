// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ReceiptMoneyInput } from "./receiptMoneyInput";

/**
 * Mirrors how a real caller wires this input: `kopiykas` is state owned by
 * the parent, `onCommitKopiykas` writes it back, and the component re-renders
 * with the new value — exactly the round-trip that used to force-rewrite a
 * just-cleared field back to "0" (CodeRabbit round 5, PR #818 § receiptMoneyInput).
 */
function Harness({ initialKopiykas }: { initialKopiykas: number }) {
  const [kopiykas, setKopiykas] = useState(initialKopiykas);
  return (
    <ReceiptMoneyInput
      kopiykas={kopiykas}
      onCommitKopiykas={setKopiykas}
      ariaLabel="Сума"
    />
  );
}

describe("ReceiptMoneyInput — clear/0 round-trip", () => {
  it("shows the hryvnia value derived from the initial kopiykas prop", () => {
    render(<Harness initialKopiykas={15075} />);
    expect(screen.getByLabelText("Сума")).toHaveValue("150.75");
  });

  it('shows an empty field (not "0") when the initial kopiykas is 0', () => {
    render(<Harness initialKopiykas={0} />);
    expect(screen.getByLabelText("Сума")).toHaveValue("");
  });

  it("clearing the field leaves it empty after the parent round-trips kopiykas=0 back in", () => {
    render(<Harness initialKopiykas={15075} />);
    const input = screen.getByLabelText("Сума");

    fireEvent.change(input, { target: { value: "" } });

    // The parent's `kopiykas` state is now 0 (onCommitKopiykas(0) on clear)
    // and that 0 has round-tripped back down as the `kopiykas` prop — the
    // field must stay visually empty, not snap back to "0".
    expect(input).toHaveValue("");
  });

  it('typing 5 after clearing commits 500 kopiykas and shows "5"', () => {
    render(<Harness initialKopiykas={15075} />);
    const input = screen.getByLabelText("Сума");

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "5" } });

    expect(input).toHaveValue("5");
  });

  it("commits Math.round(hryvnia * 100) kopiykas to the caller on each change", () => {
    let lastCommitted: number | null = null;
    function Spy() {
      const [kopiykas, setKopiykas] = useState(0);
      return (
        <ReceiptMoneyInput
          kopiykas={kopiykas}
          onCommitKopiykas={(next) => {
            lastCommitted = next;
            setKopiykas(next);
          }}
          ariaLabel="Сума"
        />
      );
    }
    render(<Spy />);
    fireEvent.change(screen.getByLabelText("Сума"), {
      target: { value: "5" },
    });
    expect(lastCommitted).toBe(500);

    fireEvent.change(screen.getByLabelText("Сума"), { target: { value: "" } });
    expect(lastCommitted).toBe(0);
  });

  it("renders the given id on the input (for <Label htmlFor> pairing)", () => {
    render(
      <ReceiptMoneyInput
        id="receipt-total-x"
        kopiykas={0}
        onCommitKopiykas={() => undefined}
        ariaLabel="Сума"
      />,
    );
    expect(screen.getByLabelText("Сума")).toHaveAttribute(
      "id",
      "receipt-total-x",
    );
  });
});
