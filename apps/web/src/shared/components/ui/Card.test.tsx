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
 * Контракт `Card` мови H (redesign v3): панель без бордера й тіні, радіус 12;
 * `hero` = тинт модуля; `receipt` = матеріал чека.
 */
describe("Card", () => {
  describe("panel (дефолт)", () => {
    it("bg-panel, rounded-xl, p-4, без бордера й тіні", () => {
      const { container } = render(<Card>body</Card>);
      const cls = container.firstElementChild!.className;
      expect(cls).toContain("bg-panel");
      expect(cls).toContain("rounded-xl");
      expect(cls).toContain("p-4");
      expect(cls).not.toMatch(/border|shadow/);
    });

    it.each(["default", "flat", "elevated", "glass", "soft"] as const)(
      "легасі prominence=%s рендерить ту саму панель",
      (prominence) => {
        const { container } = render(<Card prominence={prominence}>x</Card>);
        const cls = container.firstElementChild!.className;
        expect(cls).toContain("bg-panel");
        expect(cls).not.toMatch(/border|shadow|blur|rounded-(2xl|3xl)/);
      },
    );

    it("легасі radius ігнорується: радіус панелі завжди 12 px", () => {
      const { container } = render(<Card radius="xl">x</Card>);
      expect(container.firstElementChild!.className).toContain("rounded-xl");
      expect(container.firstElementChild!.className).not.toContain(
        "rounded-3xl",
      );
    });

    it("padding='none' emits no padding utility class", () => {
      const { container } = render(<Card padding="none">x</Card>);
      expect(container.firstElementChild!.className).not.toMatch(/\bp-\d/);
    });

    it("accepts `as` to render a semantic element", () => {
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

  describe("hero = тинт модуля", () => {
    it.each(["finyk", "fizruk", "routine", "nutrition"] as const)(
      "%s: bg-{m}-tint, без градієнта й тіні",
      (tone) => {
        const { container } = render(
          <Card prominence="hero" tone={tone}>
            x
          </Card>,
        );
        const cls = container.firstElementChild!.className;
        expect(cls).toContain(`bg-${tone}-tint`);
        expect(cls).not.toMatch(/grad|shadow|border/);
      },
    );

    it("легасі module / variant=finyk теж дають тинт", () => {
      const { container, rerender } = render(<Card module="finyk">x</Card>);
      expect(container.firstElementChild!.className).toContain("bg-finyk-tint");
      rerender(<Card variant="finyk">x</Card>);
      expect(container.firstElementChild!.className).toContain("bg-finyk-tint");
    });

    it("hero без модуля падає на панель", () => {
      const { container } = render(<Card prominence="hero">x</Card>);
      expect(container.firstElementChild!.className).toContain("bg-panel");
    });
  });

  describe("receipt = матеріал чека", () => {
    it("підйом на корені викликача, маска всередині, без радіуса", () => {
      const { container } = render(
        <Card as="section" prominence="receipt" className="extra">
          Чек
        </Card>,
      );
      const root = container.firstElementChild!;
      expect(root.tagName).toBe("SECTION");
      expect(root.className).toBe("edge-lift");
      const surface = root.firstElementChild!;
      expect(surface.className).toContain("edge-stub");
      expect(surface.className).toContain("extra");
      expect(surface.className).not.toMatch(/rounded/);
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
  });
});
