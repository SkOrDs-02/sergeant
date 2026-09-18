import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./Card";
import { KpiRowCompact } from "./KpiRowCompact";

/**
 * `KpiRowCompact` — caption-meta row для KPI tuples (P2 primitive).
 * Замінює 3-4 «голі» KPI tiles у Routine `CalendarHero` legacy. Працює
 * усередині module hero card; `module` prop тонує тільки separator-крапку,
 * щоб індекс читався як module-aligned.
 *
 * Typography: `text-style-caption` (12px floor, Hard Rule #16) для
 * label + `text-style-label` font-medium для value (`tabular-nums`).
 */
const meta: Meta<typeof KpiRowCompact> = {
  title: "UI / KpiRowCompact",
  component: KpiRowCompact,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof KpiRowCompact>;

export const Default: Story = {
  render: () => (
    <Card module="routine" prominence="hero" radius="xl">
      <KpiRowCompact
        module="routine"
        tone="hero-ink"
        items={[
          { label: "Подій", value: 12 },
          { label: "Виконано", value: 8 },
          { label: "Серія", value: "12 дн" },
          { label: "Найкраща", value: "21 дн" },
        ]}
      />
    </Card>
  ),
};

/** Edge case — 1 item only, neutral separator (no module). */
export const SingleItemNeutral: Story = {
  render: () => (
    <Card>
      <KpiRowCompact items={[{ label: "Сьогодні", value: "1 / 1" }]} />
    </Card>
  ),
};
