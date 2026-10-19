// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentGroup, ContentRow } from "./ContentGroup";

describe("ContentGroup", () => {
  it("groups a related status and action without nesting cards", () => {
    render(
      <ContentGroup variant="bounded" data-testid="connection">
        <ContentRow>Підключено</ContentRow>
        <ContentRow>
          <button type="button">Оновити</button>
        </ContentRow>
      </ContentGroup>,
    );

    const group = screen.getByTestId("connection");
    expect(group).toHaveClass("border-line", "bg-bg");
    expect(group.querySelectorAll("[data-content-row]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Оновити" })).toBeVisible();
  });

  it("keeps informational rows unboxed and supports list semantics", () => {
    render(
      <ContentGroup as="ul" data-testid="information">
        <ContentRow as="li">Памʼять</ContentRow>
        <ContentRow as="li">Видалення акаунта</ContentRow>
      </ContentGroup>,
    );

    expect(screen.getByTestId("information")).not.toHaveClass("border-line");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
