import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./Card";
import { MacroBarRow } from "./MacroBarRow";

/**
 * `MacroBarRow` — vertical stack горизонтальних progress bars per macro
 * (P2 primitive). Primary consumer — Nutrition Today hero (Phase 2.4):
 * білки / жири / вугл. кожен — `label` ↔ `value / max unit` поверх,
 * track `bg-{accent}/15` + fill `bg-{accent}` під.
 *
 * Accent палітра обмежена 3 значеннями (`nutrition` / `warning` /
 * `routine`) — це усі 3 хюї, що читаються AA на nutrition hero card.
 */
const meta: Meta<typeof MacroBarRow> = {
  title: "UI / MacroBarRow",
  component: MacroBarRow,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof MacroBarRow>;

export const Default: Story = {
  render: () => (
    <Card module="nutrition" prominence="hero" radius="xl">
      <MacroBarRow
        macros={[
          { label: "Білки", value: 92, max: 140, accent: "nutrition", unit: "г" },
          { label: "Жири", value: 48, max: 70, accent: "warning", unit: "г" },
          { label: "Вугл.", value: 210, max: 280, accent: "routine", unit: "г" },
        ]}
      />
    </Card>
  ),
};

/** Edge case — value > max (over-consumption) clamps fill but keeps label honest. */
export const OverGoal: Story = {
  render: () => (
    <Card module="nutrition" prominence="hero" radius="xl">
      <MacroBarRow
        macros={[
          { label: "Білки", value: 165, max: 140, accent: "nutrition", unit: "г" },
          { label: "Жири", value: 85, max: 70, accent: "warning", unit: "г" },
          { label: "Вугл.", value: 310, max: 280, accent: "routine", unit: "г" },
        ]}
      />
    </Card>
  ),
};
