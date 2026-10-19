// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FizrukHeader } from "./FizrukHeader";

describe("FizrukHeader", () => {
  afterEach(cleanup);

  it("shows contextual back for atlas and calls onContextualBack", () => {
    const onContextualBack = vi.fn();
    render(<FizrukHeader page="atlas" onContextualBack={onContextualBack} />);

    // Назва модуля — хром оболонки, свідомо не заголовок (#527).
    expect(screen.getByTestId("module-header-title")).toHaveTextContent(
      "Фізрук",
    );
    const backBtn = screen.getByRole("button", {
      name: "Назад: Моє тіло",
    });
    fireEvent.click(backBtn);
    expect(onContextualBack).toHaveBeenCalledTimes(1);

    // Canonical focus-visible ring (was `ring-accent/50` with no offset)
    // and the 44px floor gated to coarse pointers only, not unconditional.
    expect(backBtn).toHaveClass("focus-visible:ring-focus/45");
    expect(backBtn).toHaveClass("focus-visible:ring-offset-2");
    expect(backBtn).toHaveClass("pointer-coarse:min-h-[44px]");
    expect(backBtn).toHaveClass("pointer-coarse:min-w-[44px]");
  });

  // v3.1 (В1): на вкладці модуля «назад» знято, бо поруч із «додому» він
  // читався як дубль; лишається прямий вихід на хаб і назва-перемикач.
  it("on a module tab shows only the hub exit, no back arrow and no subtitle", () => {
    const onGoToHub = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onContextualBack={vi.fn()}
        onGoToHub={onGoToHub}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Назад/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    expect(onGoToHub).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Відкрити Сержанта" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Рух · сила · відновлення")).toBeNull();
    expect(screen.queryByText("Тренування")).toBeNull();
  });

  it("keeps the module name in the header on programs page", () => {
    render(
      <FizrukHeader
        page="programs"
        activeProgram={{ name: "Сила 5×5" }}
        onContextualBack={vi.fn()}
      />,
    );

    // Назва модуля — хром оболонки, свідомо не заголовок (#527).
    expect(screen.getByTestId("module-header-title")).toHaveTextContent(
      "Фізрук",
    );
    expect(screen.queryByText("Активна: Сила 5×5")).toBeNull();
  });

  // PR-Z7: до цієї правки набір контекстного back був вужчий, тож на цих
  // чотирьох підсторінках шапка малювала пару «Назад» + «На хаб», а
  // сторінка згори докладала власну стрілку — два-три виходи поруч
  // (`programs` при цьому не мала жодного).
  it.each([
    ["catalog", "Назад: Тренування"],
    ["templates", "Назад: Тренування"],
    ["history", "Назад: Огляд"],
    ["programs", "Назад: Огляд"],
  ] as const)(
    "на '%s' зберігає контекстний back «%s» і прямий вихід на хаб",
    (page, label) => {
      const onContextualBack = vi.fn();
      const onGoToHub = vi.fn();
      render(
        <FizrukHeader
          page={page}
          onContextualBack={onContextualBack}
          onGoToHub={onGoToHub}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onContextualBack).toHaveBeenCalledTimes(1);

      // Одна контекстна стрілка й окрема дія, яка завжди виходить із модуля.
      expect(screen.queryByRole("button", { name: "Назад" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
      expect(onGoToHub).toHaveBeenCalledTimes(1);
      expect(onContextualBack).toHaveBeenCalledTimes(1);
    },
  );

  it("на вкладеній сторінці заголовок звичайний, без перемикача", () => {
    render(<FizrukHeader page="atlas" onContextualBack={vi.fn()} />);
    expect(screen.getByTestId("module-header-title").tagName).toBe("P");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps settings out of the header and in the «Модулі» sheet", () => {
    const onOpenSettings = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onContextualBack={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Налаштування модуля/i }),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("module-header-title"));
    fireEvent.click(
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
