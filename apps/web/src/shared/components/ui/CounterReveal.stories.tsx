import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { CounterReveal } from "./CounterReveal";

/**
 * `CounterReveal` — анімований ревіл числового значення для hero metric
 * (P2 primitive). Tween через `requestAnimationFrame` з easeOutCubic;
 * `prefers-reduced-motion: reduce` → миттєвий рендер фінального значення.
 *
 * Hard Rule #17 — рахується як active ambient motion. Не паруй з іншою
 * autoplaying-анімацією на тій самій поверхні.
 *
 * `format` callback побиває locale-форматування (custom currency, units).
 * `max` → рендерить `value / max` одним рядком.
 */
const meta: Meta<typeof CounterReveal> = {
  title: "UI / CounterReveal",
  component: CounterReveal,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "number" } },
    entranceFrom: { control: { type: "number" } },
    duration: { control: { type: "number", min: 100, max: 3000, step: 100 } },
    max: { control: { type: "number" } },
  },
  args: {
    value: 4,
    entranceFrom: 0,
    duration: 800,
    max: 6,
  },
};
export default meta;

type Story = StoryObj<typeof CounterReveal>;

export const Default: Story = {
  render: (args) => (
    <div className="text-style-display-hero text-text">
      <CounterReveal {...args} />
    </div>
  ),
};

/** Edge case — live updates tween between successive values (every 1.5s). */
export const LiveUpdates: Story = {
  render: () => {
    const [value, setValue] = useState(120);
    useEffect(() => {
      const t = setInterval(
        () => setValue((v) => v + Math.floor(Math.random() * 80) - 30),
        1500,
      );
      return () => clearInterval(t);
    }, []);
    return (
      <div className="text-style-display-hero text-text">
        <CounterReveal
          value={value}
          duration={600}
          format={(n) =>
            `₴ ${new Intl.NumberFormat("uk-UA").format(Math.round(n))}`
          }
        />
      </div>
    );
  },
};
