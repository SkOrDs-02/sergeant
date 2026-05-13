/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AssistantAdviceCard } from "./AssistantAdviceCard";

describe("AssistantAdviceCard — loading vs loaded", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders a skeleton stand-in (no plain-text fallback) while loading without a cached insight", () => {
    render(
      <AssistantAdviceCard
        insight={null}
        loading={true}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    // Skeleton block carries a role=status node — that is the canonical
    // "still loading" affordance now. The previous "Готую пораду…"
    // body copy must no longer leak as a visible <p>; only the sr-only
    // mirror inside the status region stays for AT users.
    const status = screen.getByRole("status", {
      name: /готую пораду асистента/i,
    });
    expect(status).toBeInTheDocument();
    expect(screen.queryByText(/^Готую пораду…$/, { selector: "p" })).toBeNull();
    // The visible loading payload is the skeleton lines, not text.
    expect(
      status.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThanOrEqual(3);

    // While the card is in its initial-load state there is nothing for
    // the user to refresh — hide the refresh button so we keep within
    // Hard Rule #17 (≤1 AMBIENT animation on screen at once).
    expect(
      screen.queryByRole("button", { name: /оновити пораду/i }),
    ).toBeNull();
  });

  it("renders the insight (with fade-in) and a refresh button once a cached value is present", () => {
    render(
      <AssistantAdviceCard
        insight="Сьогодні ти витратив на 18% більше за середній тиждень."
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/сьогодні ти витратив на 18% більше/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /готую пораду/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /оновити пораду/i }),
    ).toBeInTheDocument();
  });

  it("keeps the cached insight visible while a refresh is in flight (no skeleton flash, refresh button spins)", () => {
    render(
      <AssistantAdviceCard
        insight="Кешована порада з попереднього запиту."
        loading={true}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/кешована порада з попереднього запиту/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /готую пораду/i })).toBeNull();
    const refresh = screen.getByRole("button", { name: /оновити пораду/i });
    expect(refresh).toBeInTheDocument();
    expect(refresh).toBeDisabled();
  });

  it("renders nothing when the request errors out and there is no cached insight (no infinite skeleton)", () => {
    const { container } = render(
      <AssistantAdviceCard
        insight={null}
        loading={false}
        error="Помилка генерації інсайту"
        onRefresh={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
