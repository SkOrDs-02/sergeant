// @vitest-environment jsdom
/**
 * Tests for `AssistantMessageBody` — the lightweight markdown renderer for
 * assistant chat replies (paragraphs, headings, lists, blockquotes, inline
 * bold/italic/code/links with href sandboxing).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssistantMessageBody } from "./AssistantMessageBody";

function renderBody(text: string) {
  return render(<AssistantMessageBody text={text} />);
}

describe("AssistantMessageBody", () => {
  it("renders a plain paragraph", () => {
    const { container } = renderBody("Привіт, як справи?");
    const p = container.querySelector("p");
    expect(p).toBeInTheDocument();
    expect(p).toHaveTextContent("Привіт, як справи?");
  });

  it("renders ### and #### headings", () => {
    const { container } = renderBody("### Заголовок\n#### Підзаголовок");
    expect(container.querySelector("h3")).toHaveTextContent("Заголовок");
    expect(container.querySelector("h4")).toHaveTextContent("Підзаголовок");
  });

  it("renders an unordered list", () => {
    const { container } = renderBody("- one\n- two\n- three");
    const items = container.querySelectorAll("ul li");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("one");
  });

  it("renders an ordered list", () => {
    const { container } = renderBody("1. first\n2. second");
    const items = container.querySelectorAll("ol li");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("second");
  });

  it("renders a blockquote with soft line breaks", () => {
    const { container } = renderBody("> quoted line 1\n> quoted line 2");
    const bq = container.querySelector("blockquote");
    expect(bq).toBeInTheDocument();
    expect(bq).toHaveTextContent("quoted line 1");
    expect(bq?.querySelector("br")).toBeInTheDocument();
  });

  it("renders inline bold, italic, and code", () => {
    const { container } = renderBody("a **bold** and *italic* and `code` end");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("code")).toHaveTextContent("code");
  });

  it("renders underscore italics", () => {
    const { container } = renderBody("this is _emphasised_ text");
    expect(container.querySelector("em")).toHaveTextContent("emphasised");
  });

  it("renders a safe https link as an anchor with target/rel", () => {
    renderBody("see [docs](https://example.com)");
    const a = screen.getByRole("link", { name: "docs" });
    expect(a).toHaveAttribute("href", "https://example.com");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a relative link as a safe anchor", () => {
    renderBody("go to [finyk](/finyk)");
    expect(screen.getByRole("link", { name: "finyk" })).toHaveAttribute(
      "href",
      "/finyk",
    );
  });

  it("sandboxes an unsafe javascript: link into a non-anchor span", () => {
    const { container } = renderBody(
      "danger [click](javascript:alert(1)) here",
    );
    expect(container.querySelector("a")).toBeNull();
    // label still shown as styled span text
    expect(container.textContent).toContain("click");
  });

  it("preserves hard line-breaks within a paragraph", () => {
    const { container } = renderBody("line one\nline two");
    const p = container.querySelector("p");
    expect(p?.querySelector("br")).toBeInTheDocument();
  });

  it("separates paragraphs split by a blank line", () => {
    const { container } = renderBody("para one\n\npara two");
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders empty input without crashing", () => {
    const { container } = renderBody("");
    expect(container.firstChild).toBeInTheDocument();
  });

  it("handles a mixed document with all block types", () => {
    const md = [
      "### Title",
      "",
      "intro **paragraph**",
      "",
      "- bullet a",
      "- bullet b",
      "",
      "1. step one",
      "",
      "> a quote",
    ].join("\n");
    const { container } = renderBody(md);
    expect(container.querySelector("h3")).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelector("ol")).toBeInTheDocument();
    expect(container.querySelector("blockquote")).toBeInTheDocument();
  });
});
