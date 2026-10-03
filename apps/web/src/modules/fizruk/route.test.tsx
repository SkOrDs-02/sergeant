// @vitest-environment jsdom
/**
 * Unit test for the `/fizruk/*` lazy route entry. `lazyDefault` and
 * `ModuleShell` / `useHubShell` live in `core/` (owned by the sibling
 * web agent) — mocked here rather than exercised for real so this
 * stays a pure wiring test of route.tsx's own logic: which HubShell
 * callbacks get threaded into which FizrukApp props.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const useHubShellMock = vi.fn();
// `vi.mock` factories are hoisted above top-level `const` declarations, and
// `route.tsx` calls `lazyDefault(...)` at module-eval time — so the stub
// referenced inside the factory must itself be created via `vi.hoisted`
// to avoid a temporal-dead-zone ReferenceError.
const { FizrukAppStub } = vi.hoisted(() => ({
  FizrukAppStub: (props: {
    onBackToHub: () => void;
    onGoToHub: () => void;
    onOpenSettings: () => void;
    onOpenModule: (id: string) => void;
    pwaAction: string | null;
    onPwaActionConsumed: () => void;
  }) => (
    <div data-testid="fizruk-app-stub">
      <button onClick={props.onBackToHub}>back</button>
      <button onClick={props.onGoToHub}>hub</button>
      <button onClick={props.onOpenSettings}>settings</button>
      <button onClick={() => props.onOpenModule("finyk")}>open-module</button>
      <button onClick={props.onPwaActionConsumed}>consume-pwa</button>
      <span data-testid="pwa-action">{props.pwaAction ?? "none"}</span>
    </div>
  ),
}));

vi.mock("../../core/lib/lazyImport", () => ({
  lazyDefault: () => FizrukAppStub,
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

describe("fizruk route Component", () => {
  it("renders ModuleShell(moduleId='fizruk') wrapping FizrukApp with wired callbacks", () => {
    const hub = baseHub();
    useHubShellMock.mockReturnValue(hub);

    render(<Component />);

    const shell = screen.getByTestId("module-shell");
    expect(shell.getAttribute("data-module-id")).toBe("fizruk");
    expect(screen.getByTestId("fizruk-app-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByText("back"));
    expect(hub.goBackOrHub).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("hub"));
    expect(hub.goToHub).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("open-module"));
    expect(hub.openModule).toHaveBeenCalledWith("finyk");

    fireEvent.click(screen.getByText("consume-pwa"));
    expect(hub.clearPwaAction).toHaveBeenCalledTimes(1);
  });

  it("calls goToModuleSettings('fizruk') when onOpenSettings fires", () => {
    const hub = baseHub();
    useHubShellMock.mockReturnValue(hub);

    render(<Component />);
    fireEvent.click(screen.getByText("settings"));
    expect(hub.goToModuleSettings).toHaveBeenCalledWith("fizruk");
  });

  it("passes through the current pwaAction from the hub shell", () => {
    useHubShellMock.mockReturnValue(baseHub({ pwaAction: "log-workout" }));
    render(<Component />);
    expect(screen.getByTestId("pwa-action")).toHaveTextContent("log-workout");
  });
});
