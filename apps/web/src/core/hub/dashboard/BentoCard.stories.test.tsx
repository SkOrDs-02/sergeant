/** @vitest-environment jsdom
 *
 * Drift-guard for `BentoCard.stories.tsx`, not a duplicate of
 * `BentoCard.test.tsx`'s behavioral coverage.
 *
 * `BentoCard.test.tsx` already exercises `BentoCard`'s own state machine
 * (data/empty/inactive/edit-mode/adaptive-reason) against synthetic
 * `ModuleConfig` fixtures — that ownership stays there. This file's only
 * job is to catch drift *inside the Storybook module itself*: a renamed
 * prop, a typo'd arg value, or a story that stops matching the component
 * it documents would previously slip through, because the old version of
 * this test asserted the story module's exported `args` object against
 * itself (`stories.Inactive.args` toMatchObject `{ inactive: true }` —
 * literally comparing the source file to itself, which can never fail
 * from a real regression).
 *
 * Instead we compose each named story exactly the way Storybook would
 * (`meta.args` merged with the story's own `args`, or the story's custom
 * `render`) and assert on the *rendered DOM* — so a prop rename in
 * `BentoCard` that `stories.tsx` doesn't track, or an arg that silently
 * stops doing anything, fails here instead of only in Storybook/Chromatic.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps, ReactElement } from "react";
import * as stories from "./BentoCard.stories";
import { BentoCard } from "./BentoCard";

type BentoCardArgs = ComponentProps<typeof BentoCard>;

/** Merge `meta.args` with a story's own `args`, mirroring how Storybook
 * resolves the final props for a story that has no custom `render`. */
function composeArgs(story: { args?: Partial<BentoCardArgs> }): BentoCardArgs {
  return { ...stories.default.args, ...story.args } as BentoCardArgs;
}

describe("BentoCard stories — drift guard against BentoCard.tsx", () => {
  afterEach(() => cleanup());

  it("Default story renders the real finyk config via the real BentoCard", () => {
    render(<BentoCard {...composeArgs(stories.Default)} />);
    // `getPreview()` reads live localStorage quick-stats, empty in a
    // fresh test env, so the empty-state promise/example copy from the
    // real `MODULE_CONFIGS.finyk` fixture is what should render.
    expect(
      screen.getByRole("button", { name: "Фінік: Почни тут →" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Сьогодні витрачено")).toBeInTheDocument();
  });

  it("Inactive story renders the real muted/disabled a11y label, not just the args object", () => {
    render(<BentoCard {...composeArgs(stories.Inactive)} />);
    expect(
      screen.getByRole("button", {
        name: "Фінік: неактивний модуль. Увімкнути в налаштуваннях Hub.",
      }),
    ).toHaveAttribute("data-inactive", "true");
    expect(
      screen.getByText("Неактивний: увімкнути в налаштуваннях"),
    ).toBeInTheDocument();
    // Inactive suppresses the description line entirely.
    expect(screen.queryByText("Сьогодні витрачено")).not.toBeInTheDocument();
  });

  it("EditMode story renders the real drag-handle button", () => {
    render(<BentoCard {...composeArgs(stories.EditMode)} />);
    expect(
      screen.getByRole("button", { name: "Перетягнути Фінік" }),
    ).toBeInTheDocument();
  });

  it("AdaptiveLifted story renders the real explainable reason chip", () => {
    render(<BentoCard {...composeArgs(stories.AdaptiveLifted)} />);
    expect(screen.getByText("ранкова рутина")).toBeInTheDocument();
  });

  it("renders the grid stories for all dashboard modules with real per-module a11y labels", () => {
    const WithDescription = stories.WithDescription
      .render as () => ReactElement;
    const AllModules = stories.AllModules.render as () => ReactElement;

    const { rerender } = render(<WithDescription />);
    expect(screen.getAllByText("Фінік").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Фізрук").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Рутина").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Їжа").length).toBeGreaterThan(0);

    rerender(<AllModules />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    // Every card is a real button carrying a module-specific accessible
    // name (empty-state promise copy for a fresh env) — not four
    // interchangeable stand-ins.
    const names = buttons.map((b) => b.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(4);
    for (const name of names) {
      expect(name).toMatch(/^(Фінік|Фізрук|Рутина|Їжа):/);
    }
  });
});
