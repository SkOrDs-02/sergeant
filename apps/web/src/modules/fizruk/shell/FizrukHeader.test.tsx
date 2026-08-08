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
      name: "Назад до Моє тіло",
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

  it("shows hub back button when onBackToHub is provided", () => {
    const onBackToHub = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onContextualBack={vi.fn()}
        onBackToHub={onBackToHub}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("shows a dedicated hub button when onGoToHub is provided", () => {
    const onGoToHub = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onContextualBack={vi.fn()}
        onBackToHub={vi.fn()}
        onGoToHub={onGoToHub}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    expect(onGoToHub).toHaveBeenCalledTimes(1);
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

  it("renders settings button when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onContextualBack={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Налаштування модуля/i }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
