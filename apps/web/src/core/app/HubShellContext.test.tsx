/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  HubShellProvider,
  useHubShell,
  useOptionalHubShell,
  type HubShellValue,
} from "./HubShellContext";

function makeShellValue(over: Partial<HubShellValue> = {}): HubShellValue {
  return {
    activeModule: null,
    openModule: () => {},
    goToHub: () => {},
    goToModuleSettings: () => {},
    moduleAnimClass: "module-enter",
    ui: {
      searchOpen: false,
      hubView: "dashboard",
      setHubView: () => {},
      setSearchOpen: () => {},
      closeSearch: () => {},
    },
    pwaAction: null,
    clearPwaAction: () => {},
    user: null,
    authLoading: false,
    shortcutsOpen: false,
    onCloseShortcuts: () => {},
    canInstall: false,
    onInstall: async () => {},
    onDismissInstall: () => {},
    iosVisible: false,
    onDismissIos: () => {},
    updateAvailable: false,
    onApplyUpdate: () => {},
    openAssistantChat: () => {},
    onOpenAuth: () => {},
    ...over,
  };
}

function ShellConsumer() {
  const shell = useHubShell();
  return (
    <span
      data-testid="shell-consumer"
      data-module={shell.activeModule ?? "none"}
    >
      ok
    </span>
  );
}

function OptionalConsumer() {
  const shell = useOptionalHubShell();
  return (
    <span data-testid="optional-consumer">
      {shell ? "has-shell" : "no-shell"}
    </span>
  );
}

describe("HubShellContext — provider wiring", () => {
  afterEach(() => cleanup());

  it("useOptionalHubShell returns null outside the provider tree", () => {
    render(<OptionalConsumer />);
    expect(screen.getByTestId("optional-consumer").textContent).toBe(
      "no-shell",
    );
  });

  it("useHubShell throws when called outside the provider tree", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<ShellConsumer />)).toThrow(
      "useHubShell must be used inside <RootLayout />",
    );
    consoleError.mockRestore();
  });

  it("HubShellProvider supplies context to descendants", () => {
    render(
      <HubShellProvider value={makeShellValue({ activeModule: "finyk" })}>
        <ShellConsumer />
      </HubShellProvider>,
    );
    expect(screen.getByTestId("shell-consumer").dataset["module"]).toBe(
      "finyk",
    );
  });

  it("useOptionalHubShell reads the same value inside the provider", () => {
    render(
      <HubShellProvider value={makeShellValue()}>
        <OptionalConsumer />
      </HubShellProvider>,
    );
    expect(screen.getByTestId("optional-consumer").textContent).toBe(
      "has-shell",
    );
  });
});
