/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateField } from "./DateField";

describe("DateField", () => {
  it("keeps the native date input inside the available inline size", () => {
    render(<DateField id="due" value="" onChange={() => undefined} />);
    const input = screen.getByLabelText("Обери дату", { selector: "input" });
    expect(input).toHaveClass("min-w-0", "max-w-full", "[min-inline-size:0]");
  });

  it("shows an empty label until the native picker receives focus", () => {
    render(
      <DateField
        id="birthday"
        label="Дата народження"
        emptyLabel="ДД.ММ.РРРР"
        value=""
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("ДД.ММ.РРРР")).toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("Дата народження"));
    expect(screen.queryByText("ДД.ММ.РРРР")).not.toBeInTheDocument();
  });

  it("does not cover a selected date", () => {
    render(
      <DateField
        id="birthday"
        emptyLabel="ДД.ММ.РРРР"
        value="2026-07-16"
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByText("ДД.ММ.РРРР")).not.toBeInTheDocument();
  });
});
