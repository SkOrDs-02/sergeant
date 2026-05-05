import type { Meta, StoryObj } from "@storybook/react-vite";
import { StreakCelebration } from "./StreakCelebration";

/**
 * `StreakCelebration` — повноекранна celebration-overlay із confetti
 * та milestone-повідомленням, спрацьовує при перетині cтрик-tier-у.
 * Stories покривають типові milestone-и (7 / 14 / 30 / 100 днів).
 * Render-only — анімація зупинена через `prefersReducedMotion`-стан.
 * Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof StreakCelebration> = {
  title: "Shared / StreakCelebration",
  component: StreakCelebration,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[420px] w-full bg-bg">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    streak: 7,
    previousStreak: 6,
    show: true,
    onComplete: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof StreakCelebration>;

/** 7 днів — emerald/teal палітра. `show=true` примусово відкриває overlay. */
export const SevenDays: Story = {};

/** 14 днів — coral/orange палітра. */
export const FourteenDays: Story = {
  args: { streak: 14, previousStreak: 13 },
};

/** 30 днів — purple/pink палітра. */
export const ThirtyDays: Story = {
  args: { streak: 30, previousStreak: 29 },
};

/** 100 днів — phenomenal milestone. */
export const HundredDays: Story = {
  args: { streak: 100, previousStreak: 99 },
};
