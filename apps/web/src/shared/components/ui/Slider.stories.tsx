import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "./Slider";

/**
 * `Slider` — token-styled слайдер з власними `role="slider"` тумбами.
 *
 * **Modes:**
 *
 * - Single — `value` як `number`.
 * - Range — `range` + `value` як `[lo, hi]`. Тумби не перехрещуються.
 *
 * **Keyboard (кожна тумба):**
 *
 * - `→`/`↑` +1 step · `←`/`↓` −1 step
 * - `Shift` + arrow ×10 step
 * - `PageUp`/`PageDown` ±10% діапазону
 * - `Home`/`End` min/max
 *
 * **A11y:** `aria-valuemin/max/now`, `aria-valuetext`, `aria-orientation`,
 * звуження range через динамічний `aria-valuemax`/`aria-valuemin` на
 * сусідній тумбі. Tooltip з'являється при focus/drag.
 */
const meta: Meta<typeof Slider> = {
  title: "UI / Slider",
  component: Slider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Slider>;

function SingleDemo({ initial = 40 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Slider
      aria-label="Гучність"
      value={value}
      onChange={setValue}
      ticks={[0, 25, 50, 75, 100]}
      showTooltip
      formatValue={(n) => `${n}%`}
    />
  );
}

function RangeDemo({
  initial = [20, 80],
}: {
  initial?: readonly [number, number];
}) {
  const [value, setValue] = useState<readonly [number, number]>(initial);
  return (
    <Slider
      range
      aria-label="Діапазон цін"
      value={value}
      onChange={setValue}
      min={0}
      max={100}
      showTooltip
      formatValue={(n) => `${n} ₴`}
    />
  );
}

export const Single: Story = { render: () => <SingleDemo /> };
export const Range: Story = { render: () => <RangeDemo /> };
export const SizeSmall: Story = {
  render: () => (
    <Slider aria-label="Small" size="sm" defaultValue={40} showTooltip />
  ),
};
export const Disabled: Story = {
  render: () => <Slider aria-label="Disabled" defaultValue={30} disabled />,
};
