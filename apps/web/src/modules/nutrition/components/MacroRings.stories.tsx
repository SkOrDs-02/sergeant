import type { Meta, StoryObj } from "@storybook/react";
import { MacroRings } from "./MacroRings";

const meta: Meta<typeof MacroRings> = {
  title: "Nutrition/MacroRings",
  component: MacroRings,
};
export default meta;

type Story = StoryObj<typeof MacroRings>;

export const OnTrack: Story = {
  args: {
    "aria-label": "Макроси за сьогодні",
    macros: [
      {
        label: "Білки",
        consumed: 82,
        goal: 150,
        variant: "nutrition",
        outcome: "68 г до цілі",
      },
      {
        label: "Жири",
        consumed: 40,
        goal: 60,
        variant: "warning",
        outcome: "20 г запас",
      },
      {
        label: "Вугл.",
        consumed: 190,
        goal: 220,
        variant: "routine",
        outcome: "30 г запас",
      },
    ],
  },
};

export const GoalHit: Story = {
  args: {
    "aria-label": "Макроси за сьогодні",
    macros: [
      {
        label: "Білки",
        consumed: 152,
        goal: 150,
        variant: "nutrition",
        outcome: "ціль виконано",
      },
      {
        label: "Жири",
        consumed: 75,
        goal: 60,
        variant: "warning",
        outcome: "+15 г понад ціль",
      },
      {
        label: "Вугл.",
        consumed: 220,
        goal: 220,
        variant: "routine",
        outcome: "ціль виконано",
      },
    ],
  },
};
