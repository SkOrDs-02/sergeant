import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { AIPill } from "./AIPill";

/**
 * `AIPill` — persistent AI affordance що сидить над bottom-nav.
 *
 * Введений у Sergeant v2 редизайн (PR-7a / 2026-05). Compact sparkle-FAB:
 * tap → відкриває chat sheet (`emitHubBus("openChat")`). Голосовий ввід
 * живе всередині самого чату, не в пілі.
 *
 * **A11y note:** один `<button>` з `aria-label` — без nested-interactive.
 */
const meta: Meta<typeof AIPill> = {
  title: "UI / AIPill (v2 redesign)",
  component: AIPill,
  // Wrap у MemoryRouter, бо контекст роутера очікується вище по дереву.
  // Centered layout не підходить для fixed-position FAB — `fullscreen`.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="h-dvh bg-mesh relative">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  tags: ["autodocs"],
  argTypes: {
    standalone: { control: "boolean" },
    besideFab: { control: "boolean" },
    bottom: { control: "number" },
  },
  args: {
    standalone: true,
    besideFab: false,
    bottom: 96,
  },
};
export default meta;

type Story = StoryObj<typeof AIPill>;

/** Hub level — 56px primary FAB flush in the bottom-right corner. */
export const Hub: Story = {};

/**
 * Module shell without a right-edge FAB (fizruk / nutrition / routine) —
 * compact 44px pip, flush to the edge, at `bottom: 84` to clear the 60px nav.
 */
export const ModuleFlush: Story = {
  args: { standalone: false, bottom: 84 },
};

/**
 * Module shell beside a right-edge FAB (finyk's "Додати витрату" pages) —
 * compact 44px pip offset `right-[4.5rem]` so it clears the sibling FAB.
 */
export const ModuleBesideFab: Story = {
  args: { standalone: false, besideFab: true, bottom: 84 },
};
