import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccentColorPicker } from "./AccentColorPicker";

/**
 * `AccentColorPicker` — picker для кастомізації accent-кольору застосунку.
 * Stories покривають дефолтну палітру з 8 swatches, з / без labels,
 * розміри. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof AccentColorPicker> = {
  title: "Shared / AccentColorPicker",
  component: AccentColorPicker,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    value: "emerald",
    onChange: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof AccentColorPicker>;

/** Дефолтна палітра (8 swatches), `medium` size, без labels. */
export const Default: Story = {};

/** З labels — назва кольору під swatch-ом. */
export const WithLabels: Story = {
  args: { showLabels: true },
};

/** Великі swatch-и (`lg`). */
export const Large: Story = {
  args: { size: "lg" },
};

/** Малі swatch-и (`sm`) — компактний варіант для settings-сайдбара. */
export const Small: Story = {
  args: { size: "sm" },
};

/** Vio-варіант обрано (демонструє selected-state з border + scale). */
export const VioletSelected: Story = {
  args: { value: "violet" },
};
