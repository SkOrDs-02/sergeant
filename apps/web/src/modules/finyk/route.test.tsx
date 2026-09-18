// @vitest-environment jsdom
/**
 * Unit test for the `/finyk/*` lazy route entry. `lazyDefault` and
 * `ModuleShell` / `useHubShell` live in `core/` (owned by the sibling
 * web agent) — mocked here rather than exercised for real so this
 * stays a pure wiring test of route.tsx's own logic: which HubShell
 * callbacks get threaded into which FinykApp props.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const useHubShellMock = vi.fn();
// `vi.mock` factories are hoisted above top-level `const` declarations, and
// `route.tsx` calls `lazyDefault(...)` at module-eval time — so the stub
// referenced inside the factory must itself be created via `vi.hoisted`
// to avoid a temporal-dead-zone ReferenceError.
const { FinykAppStub } = vi.hoisted(() => ({
  FinykAppStub: (props: {
    onBackToHub: () => void;
    onGoToHub: () => void;
    onOpenSettings: () => void;
    pwaAction: string | null;
    onPwaActionConsumed: () => void;
  }) => (
    <div data-testid="finyk-app-stub">
      <button onClick={props.onBackToHub}>back</button>
      <button onClick={props.onGoToHub}>hub</button>
      <button onClick={props.onOpenSettings}>settings</button>
      <button onClick={props.onPwaActionConsumed}>consume-pwa</button>
      <span data-testid="pwa-action">{props.pwaAction ?? "none"}</span>
    </div>
  ),
}));

vi.mock("../../core/lib/lazyImport", () => ({
  lazyDefault: () => FinykAppStub,
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
    pwaAction: null,
    clearPwaAction: vi.fn(),
    ...overrides,
  };
}

describe("finyk route Component", () => {
  it("renders ModuleShell(moduleId='finyk') wrapping FinykApp with wired callbacks", () => {
    const hub = baseHub();
    useHubShellMock.mockReturnValue(hub);

    render(<Component />);

    const shell = screen.getByTestId("module-shell");
    expect(shell.getAttribute("data-module-id")).toBe("finyk");
    expect(screen.getByTestId("finyk-app-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByText("back"));
    expect(hub.goBackOrHub).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("hub"));
    expect(hub.goToHub).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("consume-pwa"));
    expect(hub.clearPwaAction).toHaveBeenCalledTimes(1);
  });

  it("calls goToModuleSettings('finyk') when onOpenSettings fires", () => {
    const hub = baseHub();
    useHubShellMock.mockReturnValue(hub);

    render(<Component />);
    fireEvent.click(screen.getByText("settings"));
    expect(hub.goToModuleSettings).toHaveBeenCalledWith("finyk");
  });

  it("passes through the current pwaAction from the hub shell", () => {
    useHubShellMock.mockReturnValue(baseHub({ pwaAction: "add-tx" }));
    render(<Component />);
    expect(screen.getByTestId("pwa-action")).toHaveTextContent("add-tx");
  });
});
