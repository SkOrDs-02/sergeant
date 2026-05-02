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
  it("default size='xs' renders as <h3> with bold + uppercase + text-subtle", () => {
    const { container } = render(<SectionHeading>Розділ</SectionHeading>);
    const el = container.querySelector("h3")!;
    expect(el).not.toBeNull();
    expect(el.className).toContain("text-xs");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("tracking-wider");
    expect(el.className).toContain("font-bold");
    expect(el.className).toContain("text-subtle");
  });

  it("size='md' drops the uppercase/tracking treatment and uses font-semibold", () => {
    const { container } = render(
      <SectionHeading size="md">Розділ</SectionHeading>,
    );
    const el = container.querySelector("h3")!;
    expect(el.className).toContain("text-sm");
    expect(el.className).toContain("font-semibold");
    expect(el.className).not.toContain("uppercase");
  });

  it("weight='semibold' overrides default bold on eyebrow sizes", () => {
    const { container } = render(
      <SectionHeading weight="semibold">Розділ</SectionHeading>,
    );
    const el = container.querySelector("h3")!;
    expect(el.className).toContain("font-semibold");
    expect(el.className).not.toContain("font-bold");
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
    expect(cls).toContain("dark:text-finyk/70");
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

  it("size='2xs' renders the compact eyebrow scale (text-2xs + uppercase + tracking-wide + bold)", () => {
    const { container } = render(
      <SectionHeading size="2xs">Загальні рекомендації</SectionHeading>,
    );
    const cls = container.querySelector("h3")!.className;
    expect(cls).toContain("text-2xs");
    expect(cls).toContain("uppercase");
    expect(cls).toContain("tracking-wide");
    expect(cls).toContain("font-bold");
    expect(cls).toContain("text-subtle");
  });

  it("weight='medium' / weight='normal' override the size-default bold", () => {
    const { container: med } = render(
      <SectionHeading weight="medium">Розділ</SectionHeading>,
    );
    expect(med.querySelector("h3")!.className).toContain("font-medium");
    expect(med.querySelector("h3")!.className).not.toContain("font-bold");

    const { container: norm } = render(
      <SectionHeading weight="normal">Розділ</SectionHeading>,
    );
    expect(norm.querySelector("h3")!.className).toContain("font-normal");
    expect(norm.querySelector("h3")!.className).not.toContain("font-bold");
  });
});
