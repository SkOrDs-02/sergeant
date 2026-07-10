/** @vitest-environment jsdom */
/**
 * Lazy route entry smoke for `/onboarding/*` — wires WelcomeScreen with hub
 * auth opener and navigates home on completion.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const hubShell = {
  onOpenAuth: vi.fn(),
};

const navigateMock = vi.fn();

vi.mock("../app/HubShellContext", () => ({
  useHubShell: () => hubShell,
}));
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});
vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("../app/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));
vi.mock("../lib/lazyImport", () => ({
  lazyImport: (
    _factory: unknown,
    name: string,
  ): React.ComponentType<{
    onDone: () => void;
    onOpenAuth: () => void;
  }> => {
    const Stub = ({
      onDone,
      onOpenAuth,
    }: {
      onDone: () => void;
      onOpenAuth: () => void;
    }) => (
      <div data-testid="lazy-welcome">
        <button type="button" onClick={onDone}>
          done
        </button>
        <button type="button" onClick={onOpenAuth}>
          auth
        </button>
      </div>
    );
    Stub.displayName = name;
    return Stub;
  },
}));

import { Component as OnboardingRoute } from "./route";

describe("onboarding route entry", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("forwards onOpenAuth and navigates home when onboarding completes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OnboardingRoute />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("lazy-welcome")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "auth" }));
    expect(hubShell.onOpenAuth).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "done" }));
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });
});
