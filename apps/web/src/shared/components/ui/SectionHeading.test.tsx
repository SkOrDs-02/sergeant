/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { SectionHeading } from "./SectionHeading";

afterEach(cleanup);

describe("SectionHeading (мова H)", () => {
  it("xs за замовчуванням: <h3>, ярлик caps третім сірим, без риски", () => {
    render(<SectionHeading>Огляд</SectionHeading>);
    const el = screen.getByRole("heading", { level: 3 });
    expect(el.className).toContain("text-style-overline");
    expect(el.className).toContain("text-subtle");
    expect(el.className).not.toContain("before:");
  });

  it("lg: заголовок секції 20 / 700 чорнилом", () => {
    render(<SectionHeading size="lg">Зараз</SectionHeading>);
    const cls = screen.getByText("Зараз").className;
    expect(cls).toContain("text-style-title");
    expect(cls).toContain("font-bold");
    expect(cls).toContain("text-text");
  });

  it("lg + muted: 16 / 700 другим сірим (для «Закрито»)", () => {
    render(
      <SectionHeading size="lg" variant="muted">
        Закрито
      </SectionHeading>,
    );
    const cls = screen.getByText("Закрито").className;
    expect(cls).toContain("text-style-label-lg");
    expect(cls).toContain("font-bold");
    expect(cls).toContain("text-muted");
  });

  it("модульний варіант не фарбує заголовок у hue", () => {
    render(<SectionHeading variant="finyk">Бюджети</SectionHeading>);
    expect(screen.getByText("Бюджети").className).not.toMatch(/finyk/);
  });

  it("meta праворуч третім сірим, табличні цифри", () => {
    render(
      <SectionHeading size="lg" meta="3">
        Зараз
      </SectionHeading>,
    );
    const meta = screen.getByText("3");
    expect(meta.className).toContain("text-subtle");
    expect(meta.className).toContain("tnum");
  });

  it("action рендериться поруч із заголовком", () => {
    render(
      <SectionHeading size="lg" action={<button type="button">Усі</button>}>
        Операції
      </SectionHeading>,
    );
    expect(screen.getByRole("button", { name: "Усі" })).toBeTruthy();
  });

  it("as='h2' і className на кореневому вузлі без бокового слота", () => {
    render(
      <SectionHeading as="h2" className="mb-3">
        Огляд
      </SectionHeading>,
    );
    const el = screen.getByRole("heading", { level: 2 });
    expect(el.className).toContain("mb-3");
  });
});
