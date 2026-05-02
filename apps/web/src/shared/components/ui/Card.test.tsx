/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { Card } from "./Card";

afterEach(cleanup);

/**
 * Contract tests for the DS Card primitive.
 *
 * Two API surfaces:
 *   1. Legacy `variant` prop — string union including module-tinted
 *      strings (`finyk` / `finyk-soft` / …). Kept for back-compat.
 *   2. New orthogonal `module` + `prominence` props — preferred for
 *      all new code.
 *
 * The radius prop is now **always** honoured; the previous "branded
 * variants silently bake `rounded-3xl`" footgun has been removed.
 */
describe("Card", () => {
  describe("defaults", () => {
    it("renders with bg-panel, shadow-card, border, rounded-3xl, p-4", () => {
      const { container } = render(<Card>body</Card>);
      const el = container.firstElementChild!;
      expect(el.className).toContain("bg-panel");
      expect(el.className).toContain("border-line");
      expect(el.className).toContain("shadow-card");
      expect(el.className).toContain("rounded-3xl");
      expect(el.className).toContain("p-4");
    });

    it("padding='none' emits no padding utility class", () => {
      const { container } = render(<Card padding="none">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).not.toMatch(/\bp-\d/);
    });

    it("accepts `as` to render a semantic element (e.g. <section>)", () => {
      const { container } = render(
        <Card as="section" aria-label="hero">
          x
        </Card>,
      );
      expect(container.firstElementChild!.tagName).toBe("SECTION");
    });

    it("forwards ref to the underlying element", () => {
      const ref = createRef<HTMLElement>();
      render(<Card ref={ref}>x</Card>);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("legacy `variant` prop (back-compat)", () => {
    it("variant='default' applies the historical default surface", () => {
      const { container } = render(<Card variant="default">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      expect(cls).toContain("shadow-card");
    });

    it("variant='flat' drops the shadow", () => {
      const { container } = render(<Card variant="flat">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      expect(cls).not.toContain("shadow-card");
      expect(cls).not.toContain("shadow-float");
    });

    it("variant='elevated' uses shadow-float", () => {
      const { container } = render(<Card variant="elevated">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("shadow-float");
    });

    it("variant='ghost' is transparent without border", () => {
      const { container } = render(<Card variant="ghost">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-transparent");
      expect(cls).toContain("border-transparent");
    });

    it("variant='finyk' maps to module='finyk' prominence='hero'", () => {
      const { container } = render(<Card variant="finyk">hero</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-hero-emerald");
      expect(cls).toContain("border-finyk-soft-border/50");
      // Dark-mode parity: deep `-900` token instead of bg-panel + faint overlay.
      expect(cls).toContain("dark:bg-finyk-soft");
      expect(cls).toContain("dark:border-finyk-soft-border/40");
    });

    it("variant='finyk-soft' maps to module='finyk' prominence='soft'", () => {
      const { container } = render(<Card variant="finyk-soft">x</Card>);
      const cls = container.firstElementChild!.className;
      // Wave 2 (this PR) drops the legacy `bg-finyk-soft/50` opacity wash.
      // The full token resolves to `emerald-50` in light and `emerald-900`
      // in dark, both crisp; the previous /50 wash made dark surfaces
      // unreadable.
      expect(cls).toContain("bg-finyk-soft");
      expect(cls).not.toMatch(/bg-finyk-soft\/\d/);
      expect(cls).toContain("border-finyk-soft-border");
    });

    it("legacy `*-soft` variants default to radius='lg' (rounded-2xl)", () => {
      const { container } = render(<Card variant="finyk-soft">x</Card>);
      expect(container.firstElementChild!.className).toContain("rounded-2xl");
    });

    it("honours an explicit `radius` even on branded variants", () => {
      // The previous footgun: branded variants silently dropped the
      // `radius` prop. Now `radius` always wins.
      const { container } = render(
        <Card variant="finyk" radius="md">
          x
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("rounded-xl");
      expect(cls).not.toContain("rounded-3xl");
    });

    it("applies radius='lg' (rounded-2xl) on core variants", () => {
      const { container } = render(
        <Card variant="default" radius="lg">
          x
        </Card>,
      );
      expect(container.firstElementChild!.className).toContain("rounded-2xl");
    });
  });

  describe("orthogonal `module` + `prominence` API", () => {
    it("module='finyk' prominence='hero' renders the module hero surface", () => {
      const { container } = render(
        <Card module="finyk" prominence="hero">
          hero
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-hero-emerald");
      expect(cls).toContain("dark:bg-finyk-soft");
    });

    it("module without prominence defaults to prominence='hero'", () => {
      const { container } = render(<Card module="fizruk">hero</Card>);
      expect(container.firstElementChild!.className).toContain("bg-hero-teal");
    });

    it("module='routine' prominence='soft' uses the full soft token", () => {
      const { container } = render(
        <Card module="routine" prominence="soft">
          x
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-routine-soft");
      expect(cls).not.toMatch(/bg-routine-soft\/\d/);
      expect(cls).toContain("border-routine-soft-border");
    });

    it("module='nutrition' prominence='tinted' = neutral panel + tinted border", () => {
      const { container } = render(
        <Card module="nutrition" prominence="tinted">
          x
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      expect(cls).toContain("border-nutrition-soft-border");
    });

    it("module + prominence='interactive' keeps hover-lift + module hairline", () => {
      const { container } = render(
        <Card module="finyk" prominence="interactive">
          x
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("transition-interactive");
      expect(cls).toContain("hover:shadow-float");
      expect(cls).toContain("border-finyk-soft-border");
    });

    it("module + prominence honours the `radius` prop (no baking)", () => {
      const { container } = render(
        <Card module="finyk" prominence="hero" radius="lg">
          hero
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("rounded-2xl");
      expect(cls).not.toContain("rounded-3xl");
    });

    it("explicit prominence wins over a passed legacy variant", () => {
      const { container } = render(
        <Card variant="finyk-soft" prominence="hero">
          x
        </Card>,
      );
      // When both APIs collide, the explicit new-API prop wins. We
      // mirror Button's `module`-vs-`variant` resolution for
      // consistency. `module` is not specified here, so the hero
      // prominence falls back to the historical default surface.
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      expect(cls).not.toContain("bg-finyk-soft");
    });
  });
});
