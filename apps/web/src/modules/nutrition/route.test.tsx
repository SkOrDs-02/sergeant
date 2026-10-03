// @vitest-environment jsdom
/**
 * Last validated: 2026-07-21
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const hubShell = vi.hoisted(() => ({
  clearPwaAction: vi.fn(),
  goBackOrHub: vi.fn(),
  goToHub: vi.fn(),
  goToModuleSettings: vi.fn(),
  pwaAction: { kind: "open-nutrition-log" },
}));

vi.mock("../../core/app/HubShellContext", () => ({
  useHubShell: () => hubShell,
}));

vi.mock("../../core/app/ModuleShell", () => ({
  ModuleShell: ({
    children,
    moduleId,
  }: {
    children: ReactNode;
    moduleId: string;
  }) => (
    <main data-module-id={moduleId} data-testid="module-shell">
      {children}
    </main>
  ),
}));

vi.mock("@shared/components/ui/ModulePageLoader", () => ({
  ModulePageLoader: ({ module }: { module: string }) => (
    <div data-testid="module-page-loader">{module}</div>
  ),
}));

vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({
    children,
    className,
    fallback,
  }: {
    children: ReactNode;
    className: string;
    fallback: ReactNode;
  }) => (
    <section className={className} data-testid="suspense-wrapper">
      {fallback}
      {children}
    </section>
  ),
}));

vi.mock("../../core/lib/lazyImport", () => ({
  lazyDefault:
    () =>
    ({
      onBackToHub,
      onGoToHub,
      onOpenSettings,
      onPwaActionConsumed,
      pwaAction,
    }: {
      onBackToHub: () => void;
      onGoToHub: () => void;
      onOpenSettings: () => void;
      onPwaActionConsumed: () => void;
      pwaAction: { kind: string };
    }) => (
      <div data-testid="nutrition-app">
        <span>{pwaAction.kind}</span>
        <button type="button" onClick={onBackToHub}>
          Назад
        </button>
        <button type="button" onClick={onGoToHub}>
          До хабу
        </button>
        <button type="button" onClick={onOpenSettings}>
          Налаштування
        </button>
        <button type="button" onClick={onPwaActionConsumed}>
          PWA виконано
        </button>
      </div>
    ),
}));

import { Component } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("nutrition route Component", () => {
  it("wires the nutrition app into the module shell and hub actions", () => {
    render(<Component />);

    expect(screen.getByTestId("module-shell")).toHaveAttribute(
      "data-module-id",
      "nutrition",
    );
    expect(screen.getByTestId("suspense-wrapper")).toHaveClass(
      "flex-1",
      "min-h-0",
      "flex",
      "flex-col",
    );
    expect(screen.getByTestId("module-page-loader")).toHaveTextContent(
      "nutrition",
    );
    expect(screen.getByTestId("nutrition-app")).toHaveTextContent(
      "open-nutrition-log",
    );

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("button", { name: "До хабу" }));
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    fireEvent.click(screen.getByRole("button", { name: "PWA виконано" }));

    expect(hubShell.goBackOrHub).toHaveBeenCalledTimes(1);
    expect(hubShell.goToHub).toHaveBeenCalledTimes(1);
    expect(hubShell.goToModuleSettings).toHaveBeenCalledWith("nutrition");
    expect(hubShell.clearPwaAction).toHaveBeenCalledTimes(1);
  });
});
