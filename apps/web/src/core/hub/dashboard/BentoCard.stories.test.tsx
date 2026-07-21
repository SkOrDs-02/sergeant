/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import * as stories from "./BentoCard.stories";

describe("BentoCard stories", () => {
  afterEach(() => cleanup());

  it("exports the expected Storybook metadata and variants", () => {
    expect(stories.default.title).toBe("Hub / BentoCard");
    expect(stories.Default).toEqual({});
    expect(stories.Inactive.args).toMatchObject({ inactive: true });
    expect(stories.EditMode.args).toMatchObject({ editMode: true });
    expect(stories.AdaptiveLifted.args).toMatchObject({
      adaptiveReason: "ранкова рутина",
    });
  });

  it("renders the grid stories for all dashboard modules", () => {
    const WithDescription = stories.WithDescription
      .render as () => ReactElement;
    const AllModules = stories.AllModules.render as () => ReactElement;

    const { rerender } = render(<WithDescription />);
    expect(screen.getAllByText("Фінік").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Фізрук").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Рутина").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Їжа").length).toBeGreaterThan(0);

    rerender(<AllModules />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
