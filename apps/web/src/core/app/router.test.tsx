/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

interface RouteLike {
  path?: string;
  index?: boolean;
  element?: ReactNode;
  HydrateFallback?: unknown;
  children?: RouteLike[];
  lazy?: () => Promise<{ Component: unknown }>;
}

const { createBrowserRouterMock } = vi.hoisted(() => ({
  createBrowserRouterMock: vi.fn((routes: RouteLike[]) => routes),
}));

vi.mock("react-router-dom", async () => {
  const real =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...real, createBrowserRouter: createBrowserRouterMock };
});

vi.mock("./Providers", () => ({
  Providers: ({ children }: { children: ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

vi.mock("./RootLayout", () => ({
  RootLayout: () => <div data-testid="root-layout" />,
}));

vi.mock("./PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

vi.mock("../../modules/finyk/route", () => ({ Component: () => null }));
vi.mock("../../modules/fizruk/route", () => ({ Component: () => null }));
vi.mock("../../modules/nutrition/route", () => ({ Component: () => null }));
vi.mock("../../modules/routine/route", () => ({ Component: () => null }));
vi.mock("../insights/route", () => ({ Component: () => null }));
vi.mock("../settings/route", () => ({ Component: () => null }));
vi.mock("../onboarding/route", () => ({ Component: () => null }));
vi.mock("./HubPage", () => ({ HubPage: () => null }));

import { RootRoute, router } from "./router";

describe("router config", () => {
  it("wraps RootLayout in app providers", () => {
    render(<RootRoute />);

    expect(screen.getByTestId("providers")).toBeInTheDocument();
    expect(screen.getByTestId("root-layout")).toBeInTheDocument();
  });

  it("registers module, core, index, and catch-all lazy routes", async () => {
    expect(createBrowserRouterMock).toHaveBeenCalledTimes(1);

    const [root] = router as unknown as RouteLike[];
    expect(root?.path).toBe("/");
    expect(root?.HydrateFallback).toBeTypeOf("function");

    const children = root?.children ?? [];
    const routesByPath = new Map(
      children
        .filter((route) => route.path)
        .map((route) => [route.path, route] as const),
    );

    for (const path of [
      "finyk/*",
      "fizruk/*",
      "nutrition/*",
      "routine/*",
      "insights/*",
      "settings/*",
      "onboarding/*",
      "*",
    ]) {
      const lazyResult = await routesByPath.get(path)?.lazy?.();
      expect(lazyResult?.Component).toBeTypeOf("function");
    }

    const indexRoute = children.find((route) => route.index);
    const indexLazyResult = await indexRoute?.lazy?.();
    expect(indexLazyResult?.Component).toBeTypeOf("function");
  });
});
