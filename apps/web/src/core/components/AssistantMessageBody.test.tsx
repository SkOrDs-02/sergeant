/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantMessageBody } from "./AssistantMessageBody";

describe("AssistantMessageBody", () => {
  it("renders a single paragraph for plain text", () => {
    const { container } = render(
      <AssistantMessageBody text="Привіт, Сержанте" />,
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Привіт, Сержанте");
  });

  it("splits paragraphs on blank lines and keeps hard line breaks inside", () => {
    const text = "Першa строка\nдруга строка\n\nДругий параграф";
    const { container } = render(<AssistantMessageBody text={text} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe("Першa строкадруга строка");
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(paragraphs[1]?.textContent).toBe("Другий параграф");
  });

  it("renders ### h3 and #### h4 headings", () => {
    const text = "### Розділ\n\n#### Підрозділ";
    const { container } = render(<AssistantMessageBody text={text} />);
    expect(container.querySelector("h3")?.textContent).toBe("Розділ");
    expect(container.querySelector("h4")?.textContent).toBe("Підрозділ");
  });

  it("renders unordered and ordered lists", () => {
    const text = "- перше\n- друге\n\n1. крок один\n2. крок два";
    const { container } = render(<AssistantMessageBody text={text} />);
    const ul = container.querySelector("ul");
    const ol = container.querySelector("ol");
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ol?.querySelectorAll("li").length).toBe(2);
    expect(ul?.querySelectorAll("li")[1]?.textContent).toBe("друге");
    expect(ol?.querySelectorAll("li")[0]?.textContent).toBe("крок один");
  });

  it("renders inline bold, italic and code", () => {
    const { container } = render(
      <AssistantMessageBody text="**жирний** і *похилий* плюс `код`" />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("жирний");
    expect(container.querySelector("em")?.textContent).toBe("похилий");
    expect(container.querySelector("code")?.textContent).toBe("код");
  });

  it("renders safe https links as anchors with rel=noopener", () => {
    render(<AssistantMessageBody text="[відкрий](https://example.com)" />);
    const link = screen.getByRole("link", { name: "відкрий" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("sandboxes unsafe javascript: links as inert spans", () => {
    const { container } = render(
      <AssistantMessageBody text="[бякa](javascript:alert(1))" />,
    );
    expect(container.querySelector("a")).toBeNull();
    const span = container.querySelector("span");
    expect(span?.textContent).toBe("бякa");
  });

  it("renders blockquotes", () => {
    const { container } = render(
      <AssistantMessageBody text="> цитата\n> із двох рядків" />,
    );
    const bq = container.querySelector("blockquote");
    expect(bq).not.toBeNull();
    expect(bq?.textContent).toContain("цитата");
    expect(bq?.textContent).toContain("із двох рядків");
  });

  it("falls back to plain text for empty input", () => {
    const { container } = render(<AssistantMessageBody text="" />);
    expect(container.querySelectorAll("p").length).toBe(0);
  });
});
