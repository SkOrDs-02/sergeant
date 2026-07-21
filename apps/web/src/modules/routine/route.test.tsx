// @vitest-environment jsdom
/**
 * Unit test for the `/routine/*` lazy route entry. Mirrors sibling module
 * route tests and keeps the assertions scoped to this file's callback wiring.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const useHubShellMock = vi.fn();
const { RoutineAppStub } = vi.hoisted(() => ({
  RoutineAppStub: (props: {
    onBackToHub: () => void;
    onGoToHub: () => void;
    onOpenSettings: () => void;
    onOpenModule: (moduleId: string, opts?: { hash?: string }) => void;
    pwaAction: string | null;
    onPwaActionConsumed: () => void;
  }) => (
    <div data-testid="routine-app-stub">
      <button onClick={props.onBackToHub}>back</button>
      <button onClick={props.onGoToHub}>hub</button>
      <button onClick={props.onOpenSettings}>settings</button>
      <button onClick={() => props.onOpenModule("finyk", { hash: "assets" })}>
        open-module
      </button>
      <button onClick={props.onPwaActionConsumed}>consume-pwa</button>
      <span data-testid="pwa-action">{props.pwaAction ?? "none"}</span>
    </div>
  ),
}));

vi.mock("../../core/lib/lazyImport", () => ({
  lazyDefault: () => RoutineAppStub,
}));
vi.mock("../../core/app/ModuleShell", () => ({
  ModuleShell: ({
    children,
    moduleId,
  }: {
    children: ReactNode;
    moduleId: string;
  }) => (
    <div data-testid="module-shell" data-module-id={moduleId}>
      {children}
    </div>
  ),
}));
vi.mock("../../core/app/HubShellContext", () => ({
  useHubShell: () => useHubShellMock(),
}));

import { Component } from "./route";

function baseHub(overrides: Record<string, unknown> = {}) {
  return {
    goBackOrHub: vi.fn(),
    goToHub: vi.fn(),
    goToModuleSettings: vi.fn(),
    openModule: vi.fn(),
    pwaAction: null,
    clearPwaAction: vi.fn(),
    ...overrides,
  };
}

describe("routine route Component", () => {
  it("renders the routine ModuleShell and wires hub callbacks", () => {
    const hub = baseHub({ pwaAction: "add_habit" });
    useHubShellMock.mockReturnValue(hub);

    render(<Component />);

    expect(screen.getByTestId("module-shell")).toHaveAttribute(
      "data-module-id",
      "routine",
    );
    expect(screen.getByTestId("routine-app-stub")).toBeInTheDocument();
    expect(screen.getByTestId("pwa-action")).toHaveTextContent("add_habit");

    fireEvent.click(screen.getByText("back"));
    fireEvent.click(screen.getByText("hub"));
    fireEvent.click(screen.getByText("settings"));
    fireEvent.click(screen.getByText("open-module"));
    fireEvent.click(screen.getByText("consume-pwa"));

    expect(hub.goBackOrHub).toHaveBeenCalledTimes(1);
    expect(hub.goToHub).toHaveBeenCalledTimes(1);
    expect(hub.goToModuleSettings).toHaveBeenCalledWith("routine");
    expect(hub.openModule).toHaveBeenCalledWith("finyk", { hash: "assets" });
    expect(hub.clearPwaAction).toHaveBeenCalledTimes(1);
  });
});
