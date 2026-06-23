/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  navigateMock,
  toastInfoMock,
  setChoiceMock,
  registerMock,
  debugMock,
  themeState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastInfoMock: vi.fn(),
  setChoiceMock: vi.fn(),
  registerMock: vi.fn(),
  debugMock: vi.fn(),
  themeState: { isDark: false },
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@shared/lib", () => ({ logger: { debug: debugMock } }));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ info: toastInfoMock }),
}));
vi.mock("@shared/hooks/useTheme", () => ({
  useTheme: () => ({ isDark: themeState.isDark, setChoice: setChoiceMock }),
}));
vi.mock("@shared/components/ui/CommandPalette", () => ({
  useRegisterCommand: registerMock,
}));

import { useDemoCommands } from "./useDemoCommands";

type Command = {
  id: string;
  title: string;
  run: () => void;
};

function getCommands(): Command[] {
  const lastCall = registerMock.mock.calls.at(-1);
  return (lastCall?.[1] ?? []) as Command[];
}

describe("useDemoCommands", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastInfoMock.mockReset();
    setChoiceMock.mockReset();
    registerMock.mockReset();
    debugMock.mockReset();
    themeState.isDark = false;
  });

  it("registers the baseline command set under core.demo", () => {
    renderHook(() => useDemoCommands());
    expect(registerMock).toHaveBeenCalledWith("core.demo", expect.any(Array));
    const ids = getCommands().map((c) => c.id);
    expect(ids).toEqual([
      "nav.hub",
      "nav.finyk",
      "nav.fizruk",
      "settings.toggle-dark",
      "settings.open",
      "session.sign-out",
    ]);
  });

  it("navigation commands route to their module paths", () => {
    renderHook(() => useDemoCommands());
    const byId = Object.fromEntries(getCommands().map((c) => [c.id, c]));
    byId["nav.hub"]!.run();
    byId["nav.finyk"]!.run();
    byId["nav.fizruk"]!.run();
    expect(navigateMock).toHaveBeenNthCalledWith(1, "/");
    expect(navigateMock).toHaveBeenNthCalledWith(2, "/finyk");
    expect(navigateMock).toHaveBeenNthCalledWith(3, "/fizruk");
  });

  it("toggles to dark when currently light", () => {
    themeState.isDark = false;
    renderHook(() => useDemoCommands());
    const toggle = getCommands().find((c) => c.id === "settings.toggle-dark")!;
    expect(toggle.title).toBe("Темна тема");
    toggle.run();
    expect(setChoiceMock).toHaveBeenCalledWith("dark");
  });

  it("toggles to light when currently dark", () => {
    themeState.isDark = true;
    renderHook(() => useDemoCommands());
    const toggle = getCommands().find((c) => c.id === "settings.toggle-dark")!;
    expect(toggle.title).toBe("Світла тема");
    toggle.run();
    expect(setChoiceMock).toHaveBeenCalledWith("light");
  });

  it("settings.open and session.sign-out surface WIP toasts", () => {
    renderHook(() => useDemoCommands());
    const byId = Object.fromEntries(getCommands().map((c) => [c.id, c]));
    byId["settings.open"]!.run();
    byId["session.sign-out"]!.run();
    expect(toastInfoMock).toHaveBeenCalledTimes(2);
    expect(debugMock).toHaveBeenCalledTimes(2);
  });
});
