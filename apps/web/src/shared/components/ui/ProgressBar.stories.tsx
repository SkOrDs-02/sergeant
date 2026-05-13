import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "./ProgressBar";

/**
 * `ProgressBar` — лінійний індикатор прогресу.
 *
 * Determinate (`value` 0..`max`) і indeterminate (`indeterminate`).
 * Чотири розміри (`xs`/`sm`/`md`/`lg`) і чотири статус-варіанти
 * (`brand`/`success`/`warning`/`danger`). Філли — `*-strong`
 * companions (Hard Rule #9) для AA-контрасту з білим inner-label.
 *
 * **A11y:** `role="progressbar"` + `aria-valuenow/min/max`,
 * `aria-busy` для indeterminate. `prefers-reduced-motion: reduce`
 * перемикає indeterminate на slow `pulse-soft` (WCAG 2.3.3).
 */
const meta: Meta<typeof ProgressBar> = {
  title: "UI / ProgressBar",
  component: ProgressBar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "number", min: 0, max: 100 } },
    max: { control: { type: "number", min: 1 } },
    size: { control: "select", options: ["xs", "sm", "md", "lg"] },
    variant: {
      control: "select",
      options: ["brand", "success", "warning", "danger"],
    },
    indeterminate: { control: "boolean" },
  },
  args: { value: 65, max: 100, size: "md", variant: "brand" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-3 w-80">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <ProgressBar
          key={size}
          size={size}
          value={65}
          aria-label={`Progress ${size}`}
        />
      ))}
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="space-y-3 w-80">
      <ProgressBar value={50} variant="brand" aria-label="Brand" />
      <ProgressBar value={100} variant="success" aria-label="Success" />
      <ProgressBar value={35} variant="warning" aria-label="Warning" />
      <ProgressBar value={15} variant="danger" aria-label="Danger" />
    </div>
  ),
};

export const WithLabel: Story = {
  args: { size: "lg", label: "65%" },
};

export const Indeterminate: Story = {
  args: { indeterminate: true, "aria-label": "Завантаження" },
};
