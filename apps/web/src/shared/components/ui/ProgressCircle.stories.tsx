import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressCircle } from "./ProgressCircle";

/**
 * `ProgressCircle` — радіальний індикатор прогресу.
 *
 * Determinate (stroke-dasharray) і indeterminate (rotating arc).
 * Чотири розміри (`xs` 28 / `sm` 44 / `md` 64 / `lg` 96 px) і
 * чотири статус-варіанти (`brand`/`success`/`warning`/`danger`).
 * Stroke — `text-{c}-strong` companion (AA на кремовій поверхні).
 *
 * Для KPI-тайлів з модульними акцентами використовуй
 * `ProgressRing` (тонші розміри, module-tint).
 *
 * **A11y:** `role="progressbar"` + `aria-valuenow/min/max`,
 * `aria-busy` для indeterminate. `prefers-reduced-motion: reduce`
 * замінює оберт на `pulse-soft`.
 */
const meta: Meta<typeof ProgressCircle> = {
  title: "UI / ProgressCircle",
  component: ProgressCircle,
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
};
export default meta;

type Story = StoryObj<typeof ProgressCircle>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <ProgressCircle key={size} size={size} value={65} />
      ))}
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <ProgressCircle value={50} variant="brand" />
      <ProgressCircle value={100} variant="success" />
      <ProgressCircle value={35} variant="warning" />
      <ProgressCircle value={15} variant="danger" />
    </div>
  ),
};

export const Indeterminate: Story = {
  args: { indeterminate: true, "aria-label": "Завантаження" },
};
