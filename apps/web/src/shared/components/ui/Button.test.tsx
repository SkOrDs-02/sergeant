/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
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
    // — see docs/design/archive/brand-palette-wcag-aa-proposal.md.
    expect(cls).toContain("bg-brand-strong");
    expect(cls).toContain("text-white");
  });

  it("primary hover/active are monotonically darker than the -strong base", () => {
    // Regression guard: the primary base is `bg-brand-strong` (= stone-800).
    // Both hover and active must go *darker* (stone-900) so the interaction
    // never inverts. Pin the progression so a lighter hover can't creep back.
    const { getByRole } = render(<Button variant="primary">Go</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("hover:bg-brand-900");
    expect(cls).toContain("active:bg-brand-900");
    expect(cls).not.toContain("hover:bg-brand-600");
    expect(cls).not.toContain("active:bg-brand-700");
  });

  it("hub-level primary is neutral stone ink-on-paper with no coloured accent glow (design-audit M1)", () => {
    // No `module` — this is the hub-chrome primary. The hub is a neutral
    // parent, so its primary is hueless: stone fill + white in light, an
    // inverted light-stone chip + dark ink in dark. Crucially it must NOT
    // carry a coloured accent glow, which would read as a fifth accent and
    // break module-accent containment (Hard Rule #12).
    const { getByRole } = render(<Button variant="primary">Go</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("dark:bg-brand-100");
    expect(cls).toContain("dark:text-brand-900");
    expect(cls).not.toContain("dark:shadow-glow-accent-emerald");
    expect(cls).not.toContain("shadow-glow");
  });

  it.each([
    // finyk's registered `teal` scale tops out at 900 (no 950 tier), so
    // hover and active share the same darkest step (2026-07 emerald→teal).
    ["finyk", "hover:bg-teal-900", "active:bg-teal-900"],
    // fizruk's registered `cyan` scale tops out at 900 (no 950 tier), so
    // hover and active share the same darkest step.
    ["fizruk", "hover:bg-cyan-900", "active:bg-cyan-900"],
    ["routine", "hover:bg-rose-800", "active:bg-rose-900"],
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

    it("module primary carries the «Чорнило» dark treatment (accent fill + ink + glow)", () => {
      // Light keeps `-strong` + white; dark swaps to the luminescent
      // tier-400 accent (`dark:bg-{module}`) + ink text (`dark:text-bg`)
      // + a resting accent glow. Locked so the dark ink look can't
      // silently regress to the flat `-strong` fill.
      const { getByRole } = render(
        <Button module="routine" variant="primary">
          Go
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("dark:bg-routine");
      expect(cls).toContain("dark:text-bg");
      expect(cls).toContain("dark:shadow-glow-accent-rose");
    });

    it.each([
      ["finyk", "text-finyk-soft-fg"],
      ["fizruk", "text-fizruk-soft-fg"],
      ["routine", "text-routine-soft-fg"],
      ["nutrition", "text-nutrition-soft-fg"],
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

  describe("orthogonal variant × tone API", () => {
    it("solid/neutral renders the neutral stone primary", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="neutral">
          Go
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("bg-brand-strong");
      expect(cls).toContain("text-white");
    });

    it("solid/danger renders the destructive treatment", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="danger">
          Delete
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-danger-strong");
    });

    it("soft/danger renders the inline danger chip (not solid)", () => {
      const { getByRole } = render(
        <Button variant="soft" tone="danger">
          Remove
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("bg-danger-soft");
      expect(cls).not.toContain("bg-danger-strong");
    });

    it("outline/neutral renders the secondary outline button", () => {
      const { getByRole } = render(
        <Button variant="outline" tone="neutral">
          Back
        </Button>,
      );
      const cls = getByRole("button").className;
      expect(cls).toContain("border-border-strong");
      expect(cls).toContain("shadow-e1");
    });

    it("solid/ink renders the inverted ink primary", () => {
      const { getByRole } = render(
        <Button variant="solid" tone="ink">
          Ink
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-ink-strong");
    });

    it("unsupported (variant, tone) cell falls back to solid/neutral primary", () => {
      // e.g. outline + a module tone has no dedicated cell → safe neutral.
      const { getByRole } = render(
        <Button variant="outline" tone="nutrition">
          X
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-brand-strong");
    });

    it("ghost is tone-agnostic (same treatment regardless of tone)", () => {
      const { getByRole, rerender } = render(
        <Button variant="ghost" tone="neutral">
          A
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-transparent");
      rerender(
        <Button variant="ghost" tone="finyk">
          A
        </Button>,
      );
      expect(getByRole("button").className).toContain("bg-transparent");
    });
  });

  describe("legacy ⇄ canonical output equivalence", () => {
    // The whole point of the refactor: every legacy alias must emit exactly
    // the same class string as its orthogonal (variant, tone) equivalent, so
    // 433 existing call-sites are provably unaffected.
    const clsOf = (ui: ReactElement) => {
      const { getByRole, unmount } = render(ui);
      const cls = getByRole("button").className;
      unmount();
      return cls;
    };

    it.each([
      ["primary", "solid", "neutral"],
      ["secondary", "outline", "neutral"],
      ["ghost", "ghost", "neutral"],
      ["danger", "soft", "danger"],
      ["destructive", "solid", "danger"],
      ["success", "soft", "success"],
      ["primary-ink", "solid", "ink"],
      ["finyk", "solid", "finyk"],
      ["fizruk", "solid", "fizruk"],
      ["routine", "solid", "routine"],
      ["nutrition", "solid", "nutrition"],
      ["finyk-soft", "soft", "finyk"],
      ["fizruk-soft", "soft", "fizruk"],
      ["routine-soft", "soft", "routine"],
      ["nutrition-soft", "soft", "nutrition"],
    ] as const)(
      "legacy variant='%s' === variant='%s' tone='%s'",
      (legacy, variant, tone) => {
        expect(clsOf(<Button variant={legacy}>X</Button>)).toBe(
          clsOf(
            <Button variant={variant} tone={tone}>
              X
            </Button>,
          ),
        );
      },
    );

    it.each(["finyk", "fizruk", "routine", "nutrition"] as const)(
      "module='%s' + primary === tone='%s' + solid",
      (module) => {
        expect(
          clsOf(
            <Button module={module} variant="primary">
              X
            </Button>,
          ),
        ).toBe(
          clsOf(
            <Button variant="solid" tone={module}>
              X
            </Button>,
          ),
        );
      },
    );
  });
});
