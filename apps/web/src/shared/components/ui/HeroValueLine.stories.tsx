import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./Card";
import { CounterReveal } from "./CounterReveal";
import { HeroValueLine } from "./HeroValueLine";
import { ProgressRing } from "./ProgressRing";

/**
 * `HeroValueLine` — composition wrapper для hero-секцій модулів (P2
 * primitive, Phase 2 v2 redesign). Шар над `<Card prominence="hero">`:
 * розкладає ring | (narrative + metric) у row, стекає вертикально на
 * mobile.
 *
 * Слоти орієнтовно: `ring` — `<ProgressRing>` чи його обгортка;
 * `metric` — `<CounterReveal>` з `.text-style-display-hero`; `narrative`
 * — short text-style-body-sm контекст під цифрою.
 */
const meta: Meta<typeof HeroValueLine> = {
  title: "UI / HeroValueLine",
  component: HeroValueLine,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof HeroValueLine>;

export const Default: Story = {
  render: () => (
    <Card module="routine" prominence="hero" radius="xl">
      <HeroValueLine
        ring={<ProgressRing variant="routine" value={4} max={6} size="lg" />}
        metric={<CounterReveal value={4} max={6} maxTone="hero-ink" />}
        narrative="Сьогодні · 4 з 6 звичок · Серія 12 днів"
      />
    </Card>
  ),
};

/** Edge case — no ring slot (Nutrition partial-progress hero без kcal ring). */
export const NoRing: Story = {
  render: () => (
    <Card module="nutrition" prominence="hero" radius="xl">
      <HeroValueLine
        metric={<CounterReveal value={1820} max={2200} />}
        narrative="Залишилось 380 kcal · 3 прийоми їжі"
      />
    </Card>
  ),
};
