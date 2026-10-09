/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Notice } from "./Notice";

afterEach(cleanup);

describe("Notice (мова H)", () => {
  it.each([
    ["muted", "text-muted"],
    ["ink", "text-text"],
    ["danger", "text-danger-ink"],
  ] as const)("tone=%s дає %s без боксу й заливки", (tone, cls) => {
    render(
      <Notice tone={tone} role="alert">
        Факт
      </Notice>,
    );
    const el = screen.getByRole("alert");
    expect(el.className).toContain(cls);
    expect(el.className).not.toMatch(/bg-|border|rounded/);
  });

  it("рендерить дію поруч із фактом", () => {
    render(
      <Notice action={<button type="button">Повторити</button>}>Офлайн</Notice>,
    );
    expect(screen.getByRole("button", { name: "Повторити" })).toBeTruthy();
  });
});
