// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DemoModeBadge } from "./DemoModeBadge";

const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";

describe("DemoModeBadge", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nothing when demo flag is not set", () => {
    const { container } = render(<DemoModeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the badge when demo flag is set", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    render(<DemoModeBadge />);
    const badge = screen.getByRole("status", {
      name: /Демонстраційні дані/i,
    });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Демо");
  });

  it("is a non-interactive marker (no button, ignores pointer events)", () => {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
    const { container } = render(<DemoModeBadge />);
    // Must not be a button — it reports state, it doesn't perform an action.
    expect(
      screen.queryByRole("button", { name: /Демонстраційні дані/i }),
    ).not.toBeInTheDocument();
    // `pointer-events-none` keeps the fixed badge from swallowing clicks
    // on the content beneath it (the bug that broke module navigation).
    const badge = container.querySelector('[role="status"]');
    expect(badge?.className).toContain("pointer-events-none");
  });
});
