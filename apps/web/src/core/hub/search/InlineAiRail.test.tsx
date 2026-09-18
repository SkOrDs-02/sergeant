/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineAiRail } from "./InlineAiRail";
import type { InlineAiState } from "./useInlineAiRail";

const noop = vi.fn();

function renderRail(state: InlineAiState) {
  return render(
    <InlineAiRail
      state={state}
      onRetry={noop}
      onCancel={noop}
      onOpenInChat={noop}
      onDismiss={noop}
    />,
  );
}

describe("InlineAiRail (audit 03 F21 — user-sourced markdown neutralisation)", () => {
  it("renders nothing while idle", () => {
    const { container } = renderRail({ status: "idle" });
    expect(container.firstChild).toBeNull();
  });

  it("neutralises markdown control tokens in the user-sourced question", () => {
    renderRail({
      status: "success",
      question: "`rm -rf` **жирний** [click](javascript:alert(1))",
      answer: "Безпечна відповідь",
      hasToolCalls: false,
      truncated: false,
    });

    // The question label must not contain raw markdown control chars that
    // would let a crafted query fake assistant-style code/emphasis/links.
    const label = screen.getByText(/rm -rf/);
    const text = label.textContent ?? "";
    expect(text).not.toContain("`");
    expect(text).not.toContain("**");
    expect(text).not.toContain("[");
    expect(text).not.toContain("](");
    // The human-readable words survive.
    expect(text).toContain("rm -rf");
    expect(text).toContain("жирний");
    expect(text).toContain("click");
  });

  it("still renders the question text for a plain query", () => {
    renderRail({
      status: "loading",
      question: "скільки я витратив на каву",
    });
    expect(screen.getByText("скільки я витратив на каву")).toBeInTheDocument();
  });
});
