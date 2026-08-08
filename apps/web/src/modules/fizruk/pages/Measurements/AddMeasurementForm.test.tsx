// @vitest-environment jsdom
/**
 * V-9 (fizruk deep audit, 2026-08-07): the "Додати замір" form used to
 * render all 14 fields at once in a `grid-cols-2` wall. This suite covers
 * the progressive-disclosure fix extracted into its own component:
 *  - only the 3 most-checked fields (вага, % жиру, талія) show by default;
 *  - the rest sit behind an explicit "Більше полів" toggle with
 *    `aria-expanded`;
 *  - a hidden field that already carries a value must never disappear from
 *    view, even if the user re-collapses the group.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddMeasurementForm } from "./AddMeasurementForm";

afterEach(cleanup);

function getMoreFieldsToggle() {
  return screen.getByRole("button", { name: "Більше полів" });
}

describe("AddMeasurementForm", () => {
  it("shows only the 3 primary fields by default (V-9)", () => {
    render(<AddMeasurementForm addEntry={vi.fn()} />);
    expect(screen.getByLabelText(/Вага · кг/)).toBeInTheDocument();
    expect(screen.getByLabelText(/% жиру · %/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Талія · см/)).toBeInTheDocument();
    // 11 secondary fields stay hidden until expanded.
    expect(screen.queryByLabelText(/Шия · см/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Груди · см/)).not.toBeInTheDocument();
    expect(getMoreFieldsToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals the secondary fields when the toggle is expanded", () => {
    render(<AddMeasurementForm addEntry={vi.fn()} />);
    fireEvent.click(getMoreFieldsToggle());
    expect(screen.getByLabelText(/Шия · см/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Менше полів" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("keeps a filled secondary field visible and hides the collapse toggle (V-9)", () => {
    // Захист даних: заповнене приховане поле не має зникати з очей.
    // Разом із цим ховається й сам тогл — поки поле заповнене, згорнути
    // НЕМОЖЛИВО, а кнопка «Менше полів», яка на тап нічого не робить,
    // читається як зламана, а не як захист.
    render(<AddMeasurementForm addEntry={vi.fn()} />);
    fireEvent.click(getMoreFieldsToggle());
    fireEvent.change(screen.getByLabelText(/Шия · см/), {
      target: { value: "38" },
    });

    expect(screen.getByLabelText(/Шия · см/)).toHaveValue("38");
    expect(
      screen.queryByRole("button", { name: "Менше полів" }),
    ).not.toBeInTheDocument();
  });

  it("повертає тогл і згортає групу, щойно заповнене поле очистили", () => {
    render(<AddMeasurementForm addEntry={vi.fn()} />);
    fireEvent.click(getMoreFieldsToggle());
    fireEvent.change(screen.getByLabelText(/Шия · см/), {
      target: { value: "38" },
    });
    fireEvent.change(screen.getByLabelText(/Шия · см/), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Менше полів" }));
    expect(screen.queryByLabelText(/Шия · см/)).not.toBeInTheDocument();
    expect(getMoreFieldsToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("still submits both primary and secondary values together", () => {
    const addEntry = vi.fn();
    render(<AddMeasurementForm addEntry={addEntry} />);
    fireEvent.change(screen.getByLabelText(/Вага · кг/), {
      target: { value: "82.5" },
    });
    fireEvent.click(getMoreFieldsToggle());
    fireEvent.change(screen.getByLabelText(/Шия · см/), {
      target: { value: "38" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти замір" }));
    expect(addEntry).toHaveBeenCalledWith({ weightKg: 82.5, neckCm: 38 });
  });
});
