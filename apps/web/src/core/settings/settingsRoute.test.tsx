/** @vitest-environment jsdom */
/**
 * Lazy route entry smoke for `/settings/*` — thin gate that owns the scroll
 * host and lazy-loads `HubSettingsPage`.
 *
 * До 2026-08-03 гейт ще протягував `user` із hub-shell у сторінку. Єдиним
 * споживачем був `GeneralSection`, який пішов разом зі злиттям «Загальні» +
 * «Що вміє Сержант» у блок «Можливості», тож проп прибрано, а разом із ним
 * і залежність цього маршруту від `useHubShell`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
  ): React.ComponentType<Record<string, unknown>> => {
    const Stub = (props: Record<string, unknown>) => (
      <div
        data-testid="lazy-settings"
        data-props={JSON.stringify(Object.keys(props).sort())}
      />
    );
    Stub.displayName = name;
    return Stub;
  },
}));

import { Component as SettingsRoute } from "./route";

describe("settings route entry", () => {
  afterEach(() => cleanup());

  it("renders the settings main landmark and forwards only the scroll host", () => {
    render(<SettingsRoute />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(screen.getByTestId("lazy-settings")).toBeInTheDocument();
    expect(screen.getByTestId("lazy-settings")).toHaveAttribute(
      "data-props",
      JSON.stringify(["scrollContainer"]),
    );
  });
});
