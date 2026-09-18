import type { Meta, StoryObj } from "@storybook/react-vite";
import { SupersetBadge } from "./SupersetBadge";

/**
 * `SupersetBadge` — pill-індикатор для груп вправ (superset / circuit) у
 * fizruk-каталозі workouts. Stories покривають обидва типи — initiative
 * 0007 Phase 3, module-level story для модуля Fizruk.
 */
const meta: Meta<typeof SupersetBadge> = {
  title: "Fizruk / SupersetBadge",
  component: SupersetBadge,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SupersetBadge>;

/** Superset: дві паралельні вправи виконуються по черзі без відпочинку. */
export const Superset: Story = {
  args: { type: "superset" },
};

/** Circuit: послідовна група вправ — pill отримує fizruk-tint. */
export const Circuit: Story = {
  args: { type: "circuit" },
};
