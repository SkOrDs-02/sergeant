/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an expanded heading and its children by default", () => {
    render(
      <CollapsibleSection storageKey="sergeant.test.expanded" title="Підказки">
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Підказки/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("payload")).toBeInTheDocument();
  });

  it("shows a collapsed pill with icon, title, and subtitle when collapsed", () => {
    render(
      <CollapsibleSection
        storageKey="sergeant.test.collapsed"
        title="Аналітика"
        defaultOpen={false}
        collapsedIcon="bar-chart"
        collapsedSubtitle="3 інсайти"
      >
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Аналітика/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Subtitle is rendered in the collapsed pill.
    expect(screen.getByText("3 інсайти")).toBeInTheDocument();
  });

  it("toggles open/closed on click and persists the state", () => {
    render(
      <CollapsibleSection storageKey="sergeant.test.persist" title="Підказки">
        <p>payload</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: /Підказки/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("sergeant.test.persist")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("sergeant.test.persist")).toBe("true");
  });
});
