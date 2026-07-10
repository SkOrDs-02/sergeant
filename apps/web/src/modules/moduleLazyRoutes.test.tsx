/** @vitest-environment jsdom */
/**
 * Lazy route entry smoke for per-module `route.tsx` files (initiative 0006
 * Phase 5). Asserts ModuleShell wiring + hub-shell callback plumbing without
 * loading real module apps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const hubShell = {
  goToHub: vi.fn(),
  goToModuleSettings: vi.fn(),
  openModule: vi.fn(),
  pwaAction: null as string | null,
  clearPwaAction: vi.fn(),
};

let lastLazyProps: Record<string, unknown> | null = null;

vi.mock("../core/app/HubShellContext", () => ({
  useHubShell: () => hubShell,
}));

vi.mock("../core/app/ModuleShell", () => ({
  ModuleShell: ({
    moduleId,
    children,
  }: {
    moduleId: string;
    children: React.ReactNode;
  }) => <div data-testid={`module-shell-${moduleId}`}>{children}</div>,
}));

vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@shared/components/ui/ModulePageLoader", () => ({
  ModulePageLoader: ({ module }: { module: string }) => (
    <div data-testid={`loader-${module}`} />
  ),
}));

vi.mock("../core/lib/lazyImport", () => ({
  lazyDefault: (
    _factory: () => Promise<{
      default: React.ComponentType<Record<string, unknown>>;
    }>,
  ) => {
    const Stub = (props: Record<string, unknown>) => {
      lastLazyProps = props;
      return <div data-testid="lazy-app" />;
    };
    Stub.displayName = "LazyModuleApp";
    return Stub;
  },
}));

import { Component as FinykRoute } from "./finyk/route";
import { Component as FizrukRoute } from "./fizruk/route";
import { Component as NutritionRoute } from "./nutrition/route";
import { Component as RoutineRoute } from "./routine/route";

describe("module lazy route entries", () => {
  beforeEach(() => {
    lastLazyProps = null;
    vi.clearAllMocks();
    hubShell.pwaAction = null;
  });

  afterEach(() => cleanup());

  it.each([
    ["finyk", FinykRoute],
    ["fizruk", FizrukRoute],
    ["nutrition", NutritionRoute],
    ["routine", RoutineRoute],
  ] as const)(
    "renders %s route inside ModuleShell with hub callbacks",
    (moduleId, Route) => {
      render(<Route />);

      expect(
        screen.getByTestId(`module-shell-${moduleId}`),
      ).toBeInTheDocument();
      expect(screen.getByTestId("lazy-app")).toBeInTheDocument();
      expect(lastLazyProps).not.toBeNull();

      (lastLazyProps!["onBackToHub"] as () => void)();
      (lastLazyProps!["onOpenSettings"] as () => void)();
      (lastLazyProps!["onPwaActionConsumed"] as () => void)();

      expect(hubShell.goToHub).toHaveBeenCalledTimes(1);
      expect(hubShell.goToModuleSettings).toHaveBeenCalledWith(moduleId);
      expect(hubShell.clearPwaAction).toHaveBeenCalledTimes(1);
      expect(lastLazyProps!["pwaAction"]).toBeNull();
    },
  );

  it("passes openModule only to fizruk and routine apps", () => {
    render(<FizrukRoute />);
    expect(typeof lastLazyProps?.["onOpenModule"]).toBe("function");
    (lastLazyProps!["onOpenModule"] as (id: string) => void)("nutrition");
    expect(hubShell.openModule).toHaveBeenCalledWith("nutrition");

    cleanup();
    vi.clearAllMocks();

    render(<RoutineRoute />);
    expect(typeof lastLazyProps?.["onOpenModule"]).toBe("function");

    render(<FinykRoute />);
    expect(lastLazyProps?.["onOpenModule"]).toBeUndefined();
  });

  it("forwards the active PWA action from hub shell", () => {
    hubShell.pwaAction = "add-meal";
    render(<NutritionRoute />);
    expect(lastLazyProps?.["pwaAction"]).toBe("add-meal");
  });
});
