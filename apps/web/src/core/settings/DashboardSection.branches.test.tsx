/** @vitest-environment jsdom */
/**
 * Branch coverage for DashboardSection — density picker and the
 * "at least one active module" guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DASHBOARD_DENSITY_EVENT,
  DASHBOARD_DENSITY_LABELS,
  STORAGE_KEYS,
} from "@sergeant/shared";

const hubPrefState = vi.hoisted(() => ({
  showHints: true,
  adaptiveBento: true,
  showTodayFocus: true,
  showInsights: true,
  showMotivational: true,
}));

const activeModulesState = vi.hoisted(() => ({
  modules: ["finyk", "fizruk", "routine", "nutrition"] as Array<
    "finyk" | "fizruk" | "routine" | "nutrition"
  >,
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("./hubPrefs", () => ({
  useHubPref: (key: keyof typeof hubPrefState, defaultValue: boolean) => {
    const value = hubPrefState[key] ?? defaultValue;
    const setter = vi.fn((next: boolean) => {
      hubPrefState[key] = next;
    });
    return [value, setter] as const;
  },
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}));

vi.mock("@shared/lib/storage/storage", () => ({
  webKVStore: {},
  safeReadStringLS: vi.fn(() => null),
  safeWriteLS: vi.fn(),
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    getActiveModules: () => activeModulesState.modules,
    setActiveModules: vi.fn(
      (_store: unknown, next: typeof activeModulesState.modules) => {
        activeModulesState.modules = next;
      },
    ),
  };
});

import { safeWriteLS } from "@shared/lib/storage/storage";
import { DashboardSection } from "./DashboardSection";

async function openSection() {
  fireEvent.click(await screen.findByRole("button", { name: /Дашборд/i }));
}

describe("DashboardSection", () => {
  beforeEach(() => {
    activeModulesState.modules = ["finyk", "fizruk", "routine", "nutrition"];
    toastErrorMock.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("persists dashboard density and dispatches the density event", async () => {
    const listener = vi.fn();
    window.addEventListener(DASHBOARD_DENSITY_EVENT, listener);

    render(<DashboardSection />);
    await openSection();

    const compactLabel = DASHBOARD_DENSITY_LABELS.compact;
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(compactLabel, "i") }),
    );

    expect(safeWriteLS).toHaveBeenCalledWith(
      STORAGE_KEYS.DASHBOARD_DENSITY,
      "compact",
    );
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(DASHBOARD_DENSITY_EVENT, listener);
  });

  it("blocks unchecking the last active module with a toast error", async () => {
    activeModulesState.modules = ["finyk"];

    render(<DashboardSection />);
    await openSection();

    const finykCheckbox = screen.getByRole("checkbox", { name: /Фінік/i });
    expect(finykCheckbox).toBeChecked();
    fireEvent.click(finykCheckbox);

    expect(finykCheckbox).toBeChecked();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Щонайменше один модуль має бути активним",
    );
  });
});
