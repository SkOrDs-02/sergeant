// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TimeField } from "./TimeField";

describe("TimeField", () => {
  beforeEach(cleanup);

  it("рендерить нативний time-контрол, підписаний власним label", () => {
    render(<TimeField label="Початок" value="18:00" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Початок") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "time");
    expect(input.value).toBe("18:00");
  });

  it("тримає inline-size контракт, який не дає нативному контролу розсунути комірку", () => {
    // Регресія 2026-08-16: у ретро-формі тренувань нативні поля часу мали
    // власний intrinsic розмір і робили картку ширшою за екран.
    render(<TimeField label="Завершення" value="19:00" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Завершення");
    expect(input.className).toContain("[min-inline-size:0]");
    expect(input.className).toContain("[inline-size:100%]");
    expect(input.parentElement?.className).toContain("min-w-0");
  });

  it("прокидає зміни назовні", () => {
    const onChange = vi.fn();
    render(<TimeField label="Початок" value="18:00" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Початок"), {
      target: { value: "07:15" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("показує helperText як alert, коли поле у помилці", () => {
    render(
      <TimeField
        label="Завершення"
        value=""
        onChange={vi.fn()}
        error
        helperText="Постав час, який уже минув"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Постав час, який уже минув",
    );
  });
});
