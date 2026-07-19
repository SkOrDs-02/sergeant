/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { InsightCard } from "./InsightCard";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

describe("InsightCard", () => {
  it("renders title, subtitle and the default CTA glyph", () => {
    const { getByText } = render(
      <InsightCard
        id="finyk-coffee-limit-2026-05"
        title="Витрати на каву ↑ 34%"
        subtitle="Встановити ліміт?"
        onActivate={() => {}}
      />,
    );
    expect(getByText("Витрати на каву ↑ 34%")).toBeInTheDocument();
    expect(getByText("Встановити ліміт?")).toBeInTheDocument();
    expect(getByText("→")).toBeInTheDocument();
  });

  it("renders a custom ctaLabel", () => {
    const { getByText } = render(
      <InsightCard
        id="x"
        title="t"
        subtitle="s"
        ctaLabel="OK"
        onActivate={() => {}}
      />,
    );
    expect(getByText("OK")).toBeInTheDocument();
  });

  it("calls onActivate when the main button is pressed", () => {
    const onActivate = vi.fn();
    const { getByText } = render(
      <InsightCard id="x" title="t" subtitle="s" onActivate={onActivate} />,
    );
    fireEvent.click(getByText("t"));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("dismisses and hides the card, calling onDismiss", () => {
    const onDismiss = vi.fn();
    const { getByLabelText, queryByText } = render(
      <InsightCard
        id="x"
        title="t"
        subtitle="s"
        onActivate={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(getByLabelText("Закрити пропозицію"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(queryByText("t")).toBeNull();
  });

  it("does not render at all when the id is already dismissed", () => {
    localStorage.setItem(
      "sergeant.v2.insights.dismissed",
      JSON.stringify(["already-dismissed"]),
    );
    const { container } = render(
      <InsightCard
        id="already-dismissed"
        title="t"
        subtitle="s"
        onActivate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("labels the group with the title id for a11y", () => {
    const { container, getByText } = render(
      <InsightCard id="x" title="t" subtitle="s" onActivate={() => {}} />,
    );
    const group = container.querySelector('[role="group"]')!;
    const titleEl = getByText("t");
    expect(group.getAttribute("aria-labelledby")).toBe(titleEl.id);
  });
});
