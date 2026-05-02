// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PlanCalendar } from "./PlanCalendar";

afterEach(() => {
  cleanup();
});

describe("PlanCalendar", () => {
  it("опускає підказку у звичайний параграф, якщо onOpenRoutine не передано", () => {
    render(<PlanCalendar />);

    const hint = screen.getByText(
      /Заплановані тренування відображатимуться у календарі модуля «Рутина»/,
    );
    // Без callback-а — це звичайний `<p>`, без role=button
    expect(hint.tagName).toBe("P");
    expect(
      screen.queryByRole("button", { name: /Заплановані тренування/ }),
    ).toBeNull();
  });

  it("робить підказку клікабельним діп-лінком на календар Рутини", () => {
    const onOpenRoutine = vi.fn();
    render(<PlanCalendar onOpenRoutine={onOpenRoutine} />);

    const link = screen.getByRole("button", {
      name: /Заплановані тренування відображатимуться у календарі модуля «Рутина»/,
    });
    expect(link.tagName).toBe("BUTTON");

    fireEvent.click(link);
    expect(onOpenRoutine).toHaveBeenCalledTimes(1);
  });

  it("кнопка «Запланувати тренування» теж викликає onOpenRoutine", () => {
    const onOpenRoutine = vi.fn();
    render(<PlanCalendar onOpenRoutine={onOpenRoutine} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Запланувати тренування" }),
    );
    expect(onOpenRoutine).toHaveBeenCalledTimes(1);
  });
});
