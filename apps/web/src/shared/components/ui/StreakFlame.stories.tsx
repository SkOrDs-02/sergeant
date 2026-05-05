import type { Meta, StoryObj } from "@storybook/react-vite";
import { StreakFlame } from "./StreakFlame";

/**
 * `StreakFlame` — visual streak-індикатор із pulsing-glow анімацією
 * та intensity-tier-ами (7 / 14 / 30 / 60 / 90 / 100 / 365 днів). Stories
 * показують усі розміри та milestone-tier-и. Initiative 0007 Phase 2 —
 * shared/ui story.
 */
const meta: Meta<typeof StreakFlame> = {
  title: "Shared / StreakFlame",
  component: StreakFlame,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    streak: 14,
    size: "md",
  },
};
export default meta;

type Story = StoryObj<typeof StreakFlame>;

/** 14-денний streak — orange/coral tint. */
export const Default: Story = {};

/** Усі розміри — sm / md / lg / xl. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <StreakFlame streak={7} size="sm" />
      <StreakFlame streak={7} size="md" />
      <StreakFlame streak={7} size="lg" />
      <StreakFlame streak={7} size="xl" />
    </div>
  ),
};

/** Milestone-tier-и — кожен наступний рівень додає glow + tint. */
export const IntensityTiers: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <StreakFlame streak={3} size="lg" />
      <StreakFlame streak={7} size="lg" />
      <StreakFlame streak={30} size="lg" />
      <StreakFlame streak={60} size="lg" />
      <StreakFlame streak={100} size="lg" />
      <StreakFlame streak={365} size="lg" />
    </div>
  ),
};

/** Великий streak (365 днів) — violet tier із max glow. */
export const Champion: Story = {
  args: { streak: 365, size: "xl" },
};
