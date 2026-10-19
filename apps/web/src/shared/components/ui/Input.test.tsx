/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Input } from "./Input";

// Guardrails for the opinionated per-type defaults added in the design-system
// review pass. The contract is: non-prose types get spellCheck=false +
// inputMode hints *unless* the caller overrides. Prose-like types stay
// untouched so long-form text still gets browser spellcheck.
//
// NOTE: jsdom does not implement the HTMLInputElement.spellcheck IDL
// property reliably, so we assert against the DOM attribute string —
// which is what React actually writes out.
describe("Input type-aware defaults", () => {
  it("disables spellCheck and sets inputMode='email' on type='email'", () => {
    const { container } = render(<Input type="email" />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("inputmode")).toBe("email");
    expect(input.type).toBe("email");
  });

  it("disables spellCheck on type='password' and omits inputMode", () => {
    const { container } = render(<Input type="password" />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("spellcheck")).toBe("false");
    // inputMode is not set explicitly for password — the browser picks the
    // right keyboard from `type` alone.
    expect(input.getAttribute("inputmode")).toBeNull();
  });

  it("sets inputMode='decimal' on type='number'", () => {
    const { container } = render(<Input type="number" />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("does not disable spellCheck on prose type='text'", () => {
    const { container } = render(<Input type="text" />);
    const input = container.querySelector("input")!;
    // No attribute written → browser default (true for most elements)
    // stays in effect. Do NOT flip it off for prose inputs.
    expect(input.getAttribute("spellcheck")).toBeNull();
    expect(input.getAttribute("inputmode")).toBeNull();
  });

  it("lets caller override spellCheck explicitly", () => {
    const { container } = render(<Input type="email" spellCheck />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("spellcheck")).toBe("true");
  });

  // Tester video 2026-08-10: Chrome's password manager claimed the hub
  // search box — saved-account dropdown, e-mail autofilled, and refilled
  // again after every click on the clear "×". `type="search"` now carries
  // the autofill guard so the manager stops classifying it as a username
  // field. See `@shared/lib/ui/searchFieldProps`.
  it("вимикає автозаповнення на type='search'", () => {
    const { container } = render(<Input type="search" />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("data-1p-ignore")).toBe("");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-bwignore")).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
  });

  it("не чіпає автозаповнення на не-пошукових типах", () => {
    const { container } = render(<Input type="email" />);
    const input = container.querySelector("input")!;
    // Логін-форми навпаки ПОТРЕБУЮТЬ менеджера паролів — гард має бути
    // вузьким і не текти на решту полів.
    expect(input.getAttribute("autocomplete")).toBeNull();
    expect(input.getAttribute("data-lpignore")).toBeNull();
  });

  it("дає caller-у перекрити autoComplete на type='search'", () => {
    const { container } = render(
      <Input type="search" autoComplete="on" name="custom" />,
    );
    const input = container.querySelector("input")!;
    expect(input.getAttribute("autocomplete")).toBe("on");
    // Гард не має затирати `name`, яким форм-бібліотеки привʼязують поле.
    expect(input.getAttribute("name")).toBe("custom");
  });

  it("lets caller override inputMode explicitly", () => {
    const { container } = render(<Input type="number" inputMode="numeric" />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("inputmode")).toBe("numeric");
  });
});

describe("Input: лічильник символів", () => {
  it("зʼявляється автоматично при maxLength", () => {
    const { getByText } = render(
      <Input maxLength={200} value="кава" readOnly />,
    );
    expect(getByText("4/200")).toBeInTheDocument();
  });

  it("showCharCount={false} перекриває авто-опт-ін", () => {
    const { queryByText } = render(
      <Input maxLength={200} value="кава" readOnly showCharCount={false} />,
    );
    expect(queryByText("4/200")).toBeNull();
  });
});

describe("Input мовою H (v3.1)", () => {
  it("поле 48 px, радіус 8, межа контролу, плейсхолдер третім сірим", () => {
    const { container } = render(<Input />);
    const cls = container.querySelector("input")!.className;
    expect(cls).toContain("h-12");
    expect(cls).toContain("rounded-lg");
    expect(cls).toContain("border-control");
    expect(cls).toContain("placeholder:text-subtle");
  });

  it("фокус обводом 2 px чорнилом без зовнішнього кільця", () => {
    const { container } = render(<Input />);
    const cls = container.querySelector("input")!.className;
    expect(cls).toContain("focus-visible:border-text");
    expect(cls).toContain("focus-visible:inset-ring-text");
    expect(cls).not.toContain("focus-visible:ring-2");
    expect(cls).not.toContain("brand-400");
  });

  it("підпис 14 / 500 другим сірим без капсу, помилка 13 px текстом небезпеки", () => {
    const { container, getByText } = render(
      <Input id="f" label="Назва" error helperText="Вкажи назву" />,
    );
    const label = getByText("Назва");
    expect(label.className).toContain("text-style-label");
    expect(label.className).toContain("text-muted");
    expect(label.className).not.toContain("uppercase");
    const helper = getByText("Вкажи назву");
    expect(helper.className).toContain("text-style-label");
    expect(helper.className).toContain("text-danger-strong");
    expect(container.querySelector("input")!.className).toContain(
      "focus-visible:inset-ring-danger",
    );
  });
});
