import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatedCheckbox } from "./AnimatedCheckbox";

/**
 * `AnimatedCheckbox` — checkbox із SVG stroke-draw checkmark, scale-bounce
 * та haptic feedback. Stories покривають checked / unchecked, варіанти
 * модулів, розміри, disabled state. Render-only — `onChange` нічого
 * не робить. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof AnimatedCheckbox> = {
  title: "Shared / AnimatedCheckbox",
  component: AnimatedCheckbox,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    checked: false,
    onChange: () => {},
    "aria-label": "Виконано",
  },
};
export default meta;

type Story = StoryObj<typeof AnimatedCheckbox>;

/** Unchecked — порожня рамка. */
export const Unchecked: Story = {};

/** Checked — заповнений stroke-draw checkmark. */
export const Checked: Story = {
  args: { checked: true },
};

/** Усі варіанти модулів — кожен має власний tint у checked-стані. */
export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <AnimatedCheckbox checked variant="default" aria-label="default" />
      <AnimatedCheckbox checked variant="finyk" aria-label="finyk" />
      <AnimatedCheckbox checked variant="fizruk" aria-label="fizruk" />
      <AnimatedCheckbox checked variant="routine" aria-label="routine" />
      <AnimatedCheckbox checked variant="nutrition" aria-label="nutrition" />
    </div>
  ),
};

/** Усі розміри (`sm` / `md` / `lg`) у одному ряді. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <AnimatedCheckbox checked size="sm" aria-label="sm" />
      <AnimatedCheckbox checked size="md" aria-label="md" />
      <AnimatedCheckbox checked size="lg" aria-label="lg" />
    </div>
  ),
};

/** Disabled — opacity 50%, події не доходять. */
export const Disabled: Story = {
  args: { disabled: true },
};

/** Checked + disabled. */
export const CheckedDisabled: Story = {
  args: { checked: true, disabled: true },
};
