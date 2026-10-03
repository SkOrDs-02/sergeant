/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SectionHeading } from "./SectionHeading";

afterEach(cleanup);

/**
 * Contract tests for the DS SectionHeading primitive. Focus: size-driven
 * defaults, `weight` override, variant override, and the `action` slot
 * wrapper.
 */
describe("SectionHeading", () => {
  it("default size='xs' renders as <h3> with the kicker bar, no caps", () => {
    const { container } = render(<SectionHeading>Розділ</SectionHeading>);
    const el = container.querySelector("h3")!;
    expect(el).not.toBeNull();
    // Цикл 6: eyebrow-розмір сидить на семантичній ролі `caption` (12px),
    // а не на сирому `text-xs`.
    expect(el.className).toContain("text-style-caption");
    // Правило 4: кікер несуть смужка й колір, а не форма літер. Капс і
    // широкий трекінг прибрані — рішення власника 2026-08-06.
    expect(el.className).not.toContain("uppercase");
    expect(el.className).not.toContain("tracking-wide");
    expect(el.className).not.toContain("tracking-wider");
    expect(el.className).not.toContain("tracking-widest");
    // Смужка — `before:`-псевдоелемент на `bg-current`, тож вона не в DOM
    // і не читається скрінрідером. Пінимо клас, бо саме він її й створює.
    expect(el.className).toContain("before:bg-current");
    expect(el.className).toContain("before:shrink-0");
    // Вага 600, не 700: разом із капсом пішла причина для сімсотої.
    expect(el.className).toContain("font-semibold");
    // `muted`, не `subtle`: 12px subtle у dark = 3.13:1 (axe serious,
    // design-audit F9); muted = 6.03:1.
    expect(el.className).toContain("text-muted");
  });

  it("size='md' is a body heading — no kicker bar", () => {
    const { container } = render(
      <SectionHeading size="md">Розділ</SectionHeading>,
    );
    const el = container.querySelector("h3")!;
    expect(el.className).toContain("text-style-label");
    expect(el.className).toContain("font-semibold");
    expect(el.className).not.toContain("uppercase");
    expect(el.className).not.toContain("before:bg-current");
  });

  it("weight='bold' overrides the default semibold on eyebrow sizes", () => {
    const { container } = render(
      <SectionHeading weight="bold">Розділ</SectionHeading>,
    );
    const el = container.querySelector("h3")!;
    expect(el.className).toContain("font-bold");
    expect(el.className).not.toContain("font-semibold");
  });

  it("weight='extrabold' lets callers promote an xs eyebrow to heavier", () => {
    const { container } = render(
      <SectionHeading size="xs" weight="extrabold">
        Розділ
      </SectionHeading>,
    );
    expect(container.querySelector("h3")!.className).toContain(
      "font-extrabold",
    );
  });

  it("variant='finyk' applies the finyk module tint (light + dark)", () => {
    const { container } = render(
      <SectionHeading variant="finyk">Фінік</SectionHeading>,
    );
    const cls = container.querySelector("h3")!.className;
    expect(cls).toContain("text-finyk-strong");
    // Dark subtitle rides the lighter emerald-300 tier so the de-emphasised
    // /70 slot still clears WCAG AA on `--c-panel` (emerald-300/70 ≈ 6.05:1).
    expect(cls).toContain("dark:text-finyk-300/70");
  });

  it("action prop wraps the heading in a flex-row with a trailing slot", () => {
    const { container, getByText } = render(
      <SectionHeading action={<button type="button">Більше</button>}>
        Заголовок
      </SectionHeading>,
    );
    // The outer wrapper contains the heading + an extra <div> with the button.
    const wrapper = container.firstElementChild!;
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.className).toContain("flex");
    expect(wrapper.className).toContain("justify-between");
    expect(getByText("Більше").tagName).toBe("BUTTON");
  });

  it("as='h2' renders the requested semantic tag", () => {
    const { container } = render(
      <SectionHeading as="h2">Розділ</SectionHeading>,
    );
    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.querySelector("h3")).toBeNull();
  });

  it("size='xs' renders the eyebrow scale (caption + kicker bar)", () => {
    const { container } = render(
      <SectionHeading size="xs">Загальні рекомендації</SectionHeading>,
    );
    const cls = container.querySelector("h3")!.className;
    expect(cls).toContain("text-style-caption");
    expect(cls).not.toContain("uppercase");
    expect(cls).toContain("before:bg-current");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("text-muted");
  });

  it("weight='medium' / weight='normal' override the size-default semibold", () => {
    const { container: med } = render(
      <SectionHeading weight="medium">Розділ</SectionHeading>,
    );
    expect(med.querySelector("h3")!.className).toContain("font-medium");
    expect(med.querySelector("h3")!.className).not.toContain("font-semibold");

    const { container: norm } = render(
      <SectionHeading weight="normal">Розділ</SectionHeading>,
    );
    expect(norm.querySelector("h3")!.className).toContain("font-normal");
    expect(norm.querySelector("h3")!.className).not.toContain("font-semibold");
  });

  it("no `eyebrow` keeps the bare heading (no wrapper div)", () => {
    const { container } = render(<SectionHeading>Розділ</SectionHeading>);
    expect(container.firstElementChild!.tagName).toBe("H3");
  });

  it("`eyebrow` renders a kicker above the heading", () => {
    const { container, getByText } = render(
      <SectionHeading eyebrow="Маркетинг">Заголовок</SectionHeading>,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.tagName).toBe("DIV");
    const kicker = getByText("Маркетинг");
    expect(kicker.tagName).toBe("P");
    expect(kicker.className).toContain("text-style-caption");
    expect(kicker.className).not.toContain("uppercase");
    expect(kicker.className).toContain("before:bg-current");
    expect(kicker.className).toContain("text-subtle");
    // Eyebrow precedes the heading in DOM order.
    expect(wrapper.firstElementChild).toBe(kicker);
    expect(getByText("Заголовок").tagName).toBe("H3");
  });

  it("`eyebrowTone` / `eyebrowAs` / `eyebrowId` tune the kicker", () => {
    const { getByText } = render(
      <SectionHeading
        eyebrow="Фінік"
        eyebrowTone="finyk"
        eyebrowAs="span"
        eyebrowId="cat-label"
      >
        Категорія
      </SectionHeading>,
    );
    const kicker = getByText("Фінік");
    expect(kicker.tagName).toBe("SPAN");
    expect(kicker.id).toBe("cat-label");
    expect(kicker.className).toContain("text-finyk-strong");
  });

  it("`eyebrow` composes with the `action` slot", () => {
    const { container, getByText } = render(
      <SectionHeading
        eyebrow="Звіт"
        action={<button type="button">Більше</button>}
      >
        Заголовок
      </SectionHeading>,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("justify-between");
    expect(getByText("Звіт").tagName).toBe("P");
    expect(getByText("Більше").tagName).toBe("BUTTON");
    expect(getByText("Заголовок").tagName).toBe("H3");
  });
});
