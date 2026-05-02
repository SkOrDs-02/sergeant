/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { afterEach } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

/**
 * Smoke-level contract tests for the DS Button primitive. These lock the
 * publicly visible behaviour (disabled ⇄ loading, sr-only loading label,
 * forwardRef, type="button" default) so future refactors don't silently
 * regress consumers that rely on them.
 */
describe("Button", () => {
  it("renders children and defaults to type='button' (not 'submit')", () => {
    const { getByRole } = render(<Button>Зберегти</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.textContent).toBe("Зберегти");
    expect(btn.type).toBe("button");
  });

  it("is disabled and aria-busy when loading=true, even without disabled prop", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button loading onClick={onClick}>
        Зберегти
      </Button>,
    );
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes an sr-only 'Завантаження…' label while loading", () => {
    const { getByText } = render(<Button loading>Зберегти</Button>);
    const sr = getByText("Завантаження…");
    expect(sr.className).toContain("sr-only");
  });

  it("forwards ref to the native <button> element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ok</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Ok");
  });

  it("applies variant classes (primary → bg-brand-strong text-white)", () => {
    const { getByRole } = render(<Button variant="primary">Go</Button>);
    const cls = getByRole("button").className;
    // `bg-brand-strong` (= emerald-700) clears WCAG AA against text-white
    // — see docs/design/brand-palette-wcag-aa-proposal.md.
    expect(cls).toContain("bg-brand-strong");
    expect(cls).toContain("text-white");
  });

  it("primary hover/active are monotonically darker than the -strong base", () => {
    // Regression guard: when the primary base was promoted to `bg-brand-strong`
    // (= emerald-700), the old `hover:bg-brand-600 active:bg-brand-700`
    // classes turned the interaction inverted (hover lighter than base) and
    // dropped the active state (700 = base, no visible change). Pin the
    // corrected progression so the inversion can't silently come back.
    const { getByRole } = render(<Button variant="primary">Go</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("hover:bg-brand-800");
    expect(cls).toContain("active:bg-brand-900");
    expect(cls).not.toContain("hover:bg-brand-600");
    expect(cls).not.toContain("active:bg-brand-700");
  });

  it.each([
    ["finyk", "hover:bg-emerald-800", "active:bg-emerald-900"],
    ["fizruk", "hover:bg-teal-800", "active:bg-teal-900"],
    ["routine", "hover:bg-coral-800", "active:bg-coral-900"],
    // nutrition's `-strong` is lime-800 already, so hover only goes to lime-900.
    ["nutrition", "hover:bg-lime-900", null],
  ] as const)(
    "%s variant darkens monotonically from -strong (no inverted hover)",
    (variant, hoverCls, activeCls) => {
      const { getByRole } = render(<Button variant={variant}>Go</Button>);
      const cls = getByRole("button").className;
      expect(cls).toContain(`bg-${variant}-strong`);
      expect(cls).toContain(hoverCls);
      if (activeCls) expect(cls).toContain(activeCls);
      // The pre-fix tokens (`*-hover` = -600 step) would lighten the button
      // on hover relative to a -strong (700+) base.
      expect(cls).not.toContain(`hover:bg-${variant}-hover`);
    },
  );

  it("applies size classes distinctly for md vs xs", () => {
    const { getByRole, rerender } = render(<Button size="xs">X</Button>);
    expect(getByRole("button").className).toMatch(/\bh-8\b/);
    rerender(<Button size="md">X</Button>);
    expect(getByRole("button").className).toMatch(/\bh-11\b/);
  });

  it("uses iconSizes (square) when iconOnly=true", () => {
    const { getByRole } = render(
      <Button iconOnly size="md" aria-label="close">
        ✕
      </Button>,
    );
    const cls = getByRole("button").className;
    // h-11 w-11 rather than h-11 px-5
    expect(cls).toMatch(/\bh-11\b/);
    expect(cls).toMatch(/\bw-11\b/);
  });

  describe("module prop redirects neutral variants", () => {
    it.each([
      ["finyk", "bg-finyk-strong"],
      ["fizruk", "bg-fizruk-strong"],
      ["routine", "bg-routine-strong"],
      ["nutrition", "bg-nutrition-strong"],
    ] as const)(
      "module=%s + variant=primary → renders %s solid",
      (module, expectedBg) => {
        const { getByRole } = render(
          <Button module={module} variant="primary">
            Go
          </Button>,
        );
        expect(getByRole("button").className).toContain(expectedBg);
      },
    );

    it.each([
      ["finyk", "text-finyk-strong"],
      ["fizruk", "text-fizruk-strong"],
      ["routine", "text-routine-strong"],
      ["nutrition", "text-nutrition-strong"],
    ] as const)(
      "module=%s + variant=secondary → renders %s soft",
      (module, expectedFg) => {
        const { getByRole } = render(
          <Button module={module} variant="secondary">
            Cancel
          </Button>,
        );
        expect(getByRole("button").className).toContain(expectedFg);
      },
    );

    it("destructive variant is NOT redirected even when module is set", () => {
      // Delete buttons stay red inside any module — destructive intent
      // overrides module branding.
      const { getByRole } = render(
        <Button module="fizruk" variant="destructive">
          Delete
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("bg-danger-strong");
      expect(cls).not.toContain("bg-fizruk");
    });

    it("ghost / danger variants are pass-through (not redirected)", () => {
      const { getByRole, rerender } = render(
        <Button module="routine" variant="ghost">
          Skip
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-transparent");

      rerender(
        <Button module="routine" variant="danger">
          Remove
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-danger-soft");
    });

    it("explicit module variant ignores the `module` prop entirely", () => {
      // If a caller already wrote `variant="finyk"`, the `module` prop is
      // a no-op (no double-mapping or surprise inversion).
      const { getByRole } = render(
        <Button module="fizruk" variant="finyk">
          X
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-finyk-strong");
      expect(getByRole("button").className).not.toContain("bg-fizruk-strong");
    });
  });
});
