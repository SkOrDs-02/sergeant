// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoutineHeader } from "./RoutineHeader";

describe("RoutineHeader", () => {
  afterEach(cleanup);

  it("renders the module title as switcher, without the duplicate subtitle", () => {
    render(<RoutineHeader />);
    // Не `getByRole("heading")`: назва модуля — хром оболонки, свідомо не
    // заголовок (#527), інакше вона стає перед сторінковим `<h1>`.
    expect(screen.getByTestId("module-header-title")).toHaveTextContent(
      "Рутина",
    );
    expect(screen.getByTestId("module-header-title")).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(screen.queryByText("Звички й події")).toBeNull();
  });

  it("shows only the hub button on the left when onGoToHub is provided", () => {
    const onGoToHub = vi.fn();
    render(<RoutineHeader onGoToHub={onGoToHub} />);
    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    expect(onGoToHub).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
  });

  it("opens module settings from the «Модулі» sheet, not from a header gear", () => {
    const onOpenSettings = vi.fn();
    render(<RoutineHeader onOpenSettings={onOpenSettings} />);
    expect(
      screen.queryByRole("button", { name: /Налаштування модуля/ }),
    ).not.toBeInTheDocument();
    // Назва-перемикач і Сержант.
    expect(screen.getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("module-header-title"));
    fireEvent.click(
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
