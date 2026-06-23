/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { Badge } from "./Badge";

afterEach(cleanup);

/**
 * Contract tests for the DS Badge primitive. Locks tone × variant wiring
 * and verifies the optional leading dot is rendered as aria-hidden.
 */
describe("Badge", () => {
  it("defaults to tone='soft' + variant='neutral'", () => {
    const { container } = render(<Badge>42</Badge>);
    const el = container.querySelector("span")!;
    // neutral-soft uses bg-surface-muted
    expect(el.className).toContain("bg-surface-muted");
    expect(el.className).toContain("text-fg-muted");
  });

  it("solid tone uses WCAG-AA accent + white text for variant='success'", () => {
    const { container } = render(
      <Badge tone="solid" variant="success">
        OK
      </Badge>,
    );
    const el = container.querySelector("span")!;
    // `bg-success-strong` (= emerald-700) clears 5.48:1 against
    // text-white. The previous `bg-brand-700` resolved to the same hex,
    // but the semantic name pairs better with the WCAG-AA contract in
    // docs/design/archive/brand-palette-wcag-aa-proposal.md.
    expect(el.className).toContain("bg-success-strong");
    expect(el.className).toContain("text-white");
  });

  it("outline tone drops bg and keeps accent border for variant='finyk'", () => {
    const { container } = render(
      <Badge tone="outline" variant="finyk">
        ФІНІК
      </Badge>,
    );
    const el = container.querySelector("span")!;
    expect(el.className).toContain("bg-transparent");
    // `text-finyk-strong` (= emerald-700) clears WCAG AA on cream `bg-bg`;
    // the previous `text-finyk` (=emerald-500) only cleared ~2.4:1.
    expect(el.className).toContain("text-finyk-strong");
    expect(el.className).toContain("border-finyk/60");
  });

  it("soft status variants use the theme-aware -soft-fg ink (HC AA fix)", () => {
    // The static `text-{c}-strong` hex went sub-AA once HC bumped the
    // `-soft` surface a step darker. `-soft-fg` resolves per theme so the
    // ink follows the surface. Lock the wiring so a revert is caught.
    const cases = [
      ["success", "bg-success-soft", "text-success-soft-fg"],
      ["warning", "bg-warning-soft", "text-warning-soft-fg"],
      ["danger", "bg-danger-soft", "text-danger-soft-fg"],
      ["info", "bg-info-soft", "text-info-soft-fg"],
    ] as const;
    for (const [variant, bg, fg] of cases) {
      const { container } = render(<Badge variant={variant}>x</Badge>);
      const el = container.querySelector("span")!;
      expect(el.className).toContain(bg);
      expect(el.className).toContain(fg);
      cleanup();
    }
  });

  it("renders an aria-hidden dot when dot=true", () => {
    const { container } = render(<Badge dot>Live</Badge>);
    const dot = container.querySelector("span > span[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain("rounded-full");
  });

  it("does not render a dot when dot is omitted (default)", () => {
    const { container } = render(<Badge>Idle</Badge>);
    const dot = container.querySelector("span > span[aria-hidden]");
    expect(dot).toBeNull();
  });

  it("maps size='xs' to text-style-caption and size='md' to text-xs", () => {
    const { container, rerender } = render(<Badge size="xs">x</Badge>);
    expect(container.querySelector("span")!.className).toContain(
      "text-style-caption",
    );
    rerender(<Badge size="md">x</Badge>);
    expect(container.querySelector("span")!.className).toContain("text-xs");
  });
});
