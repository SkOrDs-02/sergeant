/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HubInsightsPanel } from "./HubInsightsPanel";
import type { Rec } from "../lib/recommendationEngine";

function rec(over: Partial<Rec> = {}): Rec {
  return {
    id: "r1",
    title: "Перевір баланс",
    ...over,
  } as Rec;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HubInsightsPanel", () => {
  it("renders null when there are no items", () => {
    const { container } = render(
      <HubInsightsPanel items={[]} onOpenModule={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the count badge and toggles open/closed", () => {
    render(
      <HubInsightsPanel
        items={[rec({ id: "a" }), rec({ id: "b", title: "Друга" })]}
        onOpenModule={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Інсайти/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders rec body and fires onOpenModule with the action + hash", () => {
    const onOpenModule = vi.fn();
    render(
      <HubInsightsPanel
        items={[
          rec({
            id: "a",
            title: "Картка",
            body: "Деталі тут",
            action: "finyk",
            actionHash: "#tx",
          }),
        ]}
        onOpenModule={onOpenModule}
      />,
    );
    expect(screen.getByText("Деталі тут")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Відкрити/ }));
    expect(onOpenModule).toHaveBeenCalledWith("finyk", "#tx");
  });

  it("renders a dismiss button only when onDismiss is provided and fires it", () => {
    const onDismiss = vi.fn();
    render(
      <HubInsightsPanel
        items={[rec({ id: "a", title: "Видали" })]}
        onOpenModule={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    const removeBtn = screen.getByRole("button", { name: "Прибрати" });
    fireEvent.click(removeBtn);
    expect(onDismiss).toHaveBeenCalledWith("a");
  });

  it("omits the dismiss button when onDismiss is not provided", () => {
    render(
      <HubInsightsPanel items={[rec({ id: "a" })]} onOpenModule={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: "Прибрати" }),
    ).not.toBeInTheDocument();
  });

  it("renders a registered glyph icon as an SVG (not literal text)", () => {
    render(
      <HubInsightsPanel
        items={[rec({ id: "a", title: "Глиф", icon: "dumbbell" })]}
        onOpenModule={vi.fn()}
      />,
    );
    // The glyph name must not leak as literal text.
    expect(screen.queryByText(/dumbbell/)).not.toBeInTheDocument();
    expect(screen.getByText("Глиф")).toBeInTheDocument();
  });

  it("renders a raw emoji icon as text", () => {
    render(
      <HubInsightsPanel
        items={[rec({ id: "a", title: "Емодзі", icon: "🔥" })]}
        onOpenModule={vi.fn()}
      />,
    );
    expect(screen.getByText("🔥")).toBeInTheDocument();
  });
});
