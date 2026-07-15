// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FizrukHeader } from "./FizrukHeader";

describe("FizrukHeader", () => {
  afterEach(cleanup);

  it("shows contextual back for atlas and calls onContextualBack", () => {
    const onContextualBack = vi.fn();
    render(<FizrukHeader page="atlas" onContextualBack={onContextualBack} />);

    expect(screen.getByRole("heading", { name: "Фізрук" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назад до Моє тіло" }));
    expect(onContextualBack).toHaveBeenCalledTimes(1);
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

    expect(screen.getByRole("heading", { name: "Фізрук" })).toBeInTheDocument();
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
