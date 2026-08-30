/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";

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
    it("renders with bg-panel, shadow-e1, border, rounded-3xl, p-4", () => {
      const { container } = render(<Card>body</Card>);
      const el = container.firstElementChild!;
      expect(el.className).toContain("bg-panel");
      expect(el.className).toContain("border-line");
      // Semantic elevation scale — default Card sits at e1 (raised).
      // The legacy `shadow-card` alias still resolves to the same CSS
      // var, but new code (and this primitive) uses the explicit token.
      expect(el.className).toContain("shadow-e1");
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
      expect(cls).toContain("shadow-e1");
    });

    it("variant='flat' drops the shadow", () => {
      const { container } = render(<Card variant="flat">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      // No elevation utility on a flat card (no `shadow-e*`, no legacy
      // alias). Asserting both surfaces guards against accidental drift.
      expect(cls).not.toMatch(/\bshadow-e\d\b/);
      expect(cls).not.toContain("shadow-card");
      expect(cls).not.toContain("shadow-float");
    });

    it("variant='elevated' lifts to elevation e3 (overlay tier)", () => {
      const { container } = render(<Card variant="elevated">x</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("shadow-e3");
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
      // «Чорнило» v3.1 § 3: the same saturated brand-anchor gradient in
      // both themes, soft down-shadow instead of elevation.
      expect(cls).toContain("bg-hero-grad-finyk");
      expect(cls).toContain("shadow-hero-finyk");
      expect(cls).toContain("border-white/20");
      // «Чорнило» v3.1 § 2: tonal ink gradient instead of the `-900`
      // `-soft` fill — identity carried by border + glow, not saturation.
      expect(cls).toContain("dark:bg-hero-ink-finyk");
      // «Чорнило» hero (dark): luminescent tier-400 accent border /25 +
      // inset-glow, replacing the old faint soft-border/40 + drop shadow.
      // 2026-07: inset-glow token followed the emerald→teal rebrand of the
      // finyk accent (assertion was stale, code was already correct).
      expect(cls).toContain("dark:border-brand-400/25");
      expect(cls).toContain("dark:shadow-glow-inset-teal");
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
      expect(cls).toContain("bg-hero-grad-finyk");
      expect(cls).toContain("dark:bg-hero-ink-finyk");
    });

    it("module without prominence defaults to prominence='hero'", () => {
      const { container } = render(<Card module="fizruk">hero</Card>);
      expect(container.firstElementChild!.className).toContain(
        "bg-hero-grad-fizruk",
      );
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
      // «Чорнило» selected (dark): accent/10 wash + accent/35 border, flat.
      expect(cls).toContain("dark:bg-lime-400/10");
      expect(cls).toContain("dark:border-lime-400/35");
      expect(cls).toContain("dark:shadow-none");
    });

    it("module + prominence='interactive' keeps hover-lift + module hairline", () => {
      const { container } = render(
        <Card module="finyk" prominence="interactive">
          x
        </Card>,
      );
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("transition-interactive");
      // Hover lifts the card from elevation e1 → e2 (still in the
      // page-level z-base tier, no z-index bump on hover).
      expect(cls).toContain("hover:shadow-e2");
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

  it("renders compound card sections with caller classes and semantic title tag", () => {
    const { getByText } = render(
      <Card>
        <CardHeader className="header-extra">
          <CardTitle as="h2" className="title-extra">
            Назва
          </CardTitle>
          <CardDescription className="desc-extra">Опис</CardDescription>
        </CardHeader>
        <CardContent className="content-extra">Контент</CardContent>
        <CardFooter className="footer-extra">Футер</CardFooter>
      </Card>,
    );

    expect(getByText("Назва").tagName).toBe("H2");
    expect(getByText("Назва").className).toContain("title-extra");
    expect(getByText("Опис").className).toContain("desc-extra");
    expect(getByText("Контент").className).toContain("content-extra");
    expect(getByText("Футер").className).toContain("footer-extra");
    expect(getByText("Футер").className).toContain("border-t");
  });

  // AI-CONTEXT: край — власний матеріал (П3, рішення власника
  // 2026-08-06). Тести тримають головний інваріант: край і радіус
  // описують ту саму межу поверхні й НЕ складаються. Якщо колись
  // зʼявиться картка одночасно зі скругленням і перфорацією — це
  // означає, що хтось зробив їх ортогональними, а вони не такі.
  describe("edge — документна обробка краю", () => {
    it("replaces the radius instead of stacking with it", () => {
      const { container } = render(
        <Card edge="stub" radius="xl">
          Талон
        </Card>,
      );
      // Масковий край живе під обгорткою-підйомом — див. `MASKED_EDGES`.
      const cls = container.querySelector(".edge-stub")!.className;
      expect(cls).toContain("edge-stub");
      expect(cls).not.toContain("rounded-3xl");
      expect(cls).not.toContain("rounded-2xl");
      expect(cls).not.toContain("rounded-xl");
    });

    it("keeps the standard radius when no edge is given", () => {
      const { container } = render(<Card radius="xl">Картка</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("rounded-3xl");
      expect(cls).not.toContain("edge-");
    });

    // Розділені утиліти — щоб у стосі лінійка дісталась першій
    // поверхні, а перфорація останній.
    it.each([
      ["rule", "edge-rule"],
      ["perf", "edge-perf"],
      ["stub", "edge-stub"],
    ] as const)("edge=%s maps to .%s", (edge, expected) => {
      const { container } = render(<Card edge={edge}>Документ</Card>);
      expect(container.querySelector(`.${expected}`)).not.toBeNull();
    });

    /**
     * AI-DANGER: маска зрізає тінь на СВОЄМУ вузлі — і `box-shadow`, і
     * `filter: drop-shadow()` однаково (заміряно, див. `MASKED_EDGES` у
     * `Card.tsx`). Тому масковий край мусить отримати обгортку-підйом
     * автоматично, а `rule` — ні: у нього маски немає.
     */
    it.each(["stub", "perf"] as const)(
      "edge=%s несе підйом зовні, а маску всередині",
      (edge) => {
        const { container } = render(<Card edge={edge}>Документ</Card>);
        const lift = container.firstElementChild!;
        expect(lift.className).toContain("edge-lift");
        expect(lift.className).not.toContain(`edge-${edge}`);
        expect(lift.querySelector(`.edge-${edge}`)).not.toBeNull();
      },
    );

    /**
     * Регресія на знахідку ревʼю: спершу обгортка була доданим `div`, і
     * `Card as="li"` усередині `ul` давав `<ul><div><li>` — невалідну
     * розмітку списку. Заразом ламались селектори прямих нащадків і
     * поведінка елемента у flex/grid, бо в розкладці батька опинявся
     * чужий вузол. Семантичний корінь мусить лишатись зовнішнім.
     */
    it("зберігає запитаний елемент коренем навіть під маскою", () => {
      const { container } = render(
        <ul>
          <Card as="li" edge="stub">
            Пункт
          </Card>
        </ul>,
      );
      const list = container.firstElementChild!;
      const item = list.firstElementChild!;
      expect(item.tagName).toBe("LI");
      expect(item.className).toContain("edge-lift");
      expect(item.querySelector(".edge-stub")).not.toBeNull();
      // Жодного чужого вузла між списком і його пунктом.
      expect(list.children).toHaveLength(1);
    });

    it("класи викликача лишаються з поверхнею, а не з обгорткою", () => {
      const { container } = render(
        <Card edge="stub" className="bg-panelHi">
          Талон
        </Card>,
      );
      const lift = container.firstElementChild!;
      // Фон на обгортці був би прямокутником ПОЗА маскою — видимим
      // клаптем під зубцями.
      expect(lift.className).not.toContain("bg-panelHi");
      expect(container.querySelector(".edge-stub")!.className).toContain(
        "bg-panelHi",
      );
    });

    it("друкарська лінійка обгортки не отримує — маски в неї немає", () => {
      const { container } = render(<Card edge="rule">Документ</Card>);
      expect(container.firstElementChild!.className).toContain("edge-rule");
      expect(container.querySelector(".edge-lift")).toBeNull();
    });
  });
});
