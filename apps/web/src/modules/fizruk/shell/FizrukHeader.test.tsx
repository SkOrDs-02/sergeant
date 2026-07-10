// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FizrukHeader } from "./FizrukHeader";

afterEach(cleanup);

describe("FizrukHeader", () => {
  it("renders the dashboard title and default subtitle", () => {
    render(<FizrukHeader page="dashboard" onContextualBack={vi.fn()} />);
    expect(screen.getByText("ФІЗРУК")).toBeInTheDocument();
    expect(screen.getByText("Тренування · прогрес")).toBeInTheDocument();
  });

  it("shows contextual back on atlas with the body label", () => {
    const onContextualBack = vi.fn();
    render(<FizrukHeader page="atlas" onContextualBack={onContextualBack} />);
    expect(screen.getByText("Атлас тіла")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назад до Моє тіло" }));
    expect(onContextualBack).toHaveBeenCalledOnce();
  });

  it("shows active program name on the programs page", () => {
    render(
      <FizrukHeader
        page="programs"
        activeProgram={{ name: "Сила 12 тижнів" }}
        onContextualBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Програми")).toBeInTheDocument();
    expect(screen.getByText("Активна: Сила 12 тижнів")).toBeInTheDocument();
  });

  it("uses hub back button when onBackToHub is provided on dashboard", () => {
    const onBackToHub = vi.fn();
    render(
      <FizrukHeader
        page="dashboard"
        onBackToHub={onBackToHub}
        onContextualBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "До хабу" }));
    expect(onBackToHub).toHaveBeenCalledOnce();
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
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
