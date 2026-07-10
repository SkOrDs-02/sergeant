/** @vitest-environment jsdom */
/**
 * Lazy route entry smoke for `/settings/*` — thin gate that pulls `user`
 * from hub shell and lazy-loads `HubSettingsPage`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const hubShell = {
  user: { id: "u-settings", email: "u@example.com" },
};

vi.mock("../app/HubShellContext", () => ({
  useHubShell: () => hubShell,
}));

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
  ): React.ComponentType<{ user: unknown }> => {
    const Stub = ({ user }: { user: unknown }) => (
      <div data-testid="lazy-settings" data-user={JSON.stringify(user)} />
    );
    Stub.displayName = name;
    return Stub;
  },
}));

import { Component as SettingsRoute } from "./route";

describe("settings route entry", () => {
  afterEach(() => cleanup());

  it("renders the settings main landmark and forwards hub-shell user", () => {
    render(<SettingsRoute />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(screen.getByTestId("lazy-settings")).toBeInTheDocument();
    expect(screen.getByTestId("lazy-settings")).toHaveAttribute(
      "data-user",
      JSON.stringify(hubShell.user),
    );
  });
});
