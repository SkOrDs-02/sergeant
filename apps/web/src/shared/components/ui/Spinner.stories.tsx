import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "./Spinner";

/**
 * `Spinner` — canonical loading-індикатор Sergeant. Використовується
 * у `Button` (через пропс `loading`), inline fetch-станах і skeleton-overlay.
 *
 * Decorative-візуал (`aria-hidden`). Парь зі статус-повідомленням у
 * `aria-live="polite"` контейнері або `sr-only` лейблом для screen-reader.
 *
 * Розміри `xs`–`lg` мапляться на `h-3..6 w-3..6` Tailwind-класи. Анімація
 * `animate-spin` навішена на wrapper-`<div>`, щоб transform лишався на
 * compositor thread (Chromium/WebKit не завжди акселерують CSS-анімації
 * напряму на `<svg>`).
 */
const meta: Meta<typeof Spinner> = {
  title: "UI / Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "lg"] },
  },
  args: {
    size: "sm",
  },
};
export default meta;

type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

/** Усі розміри — від `xs` (chips) до `lg` (hero loaders). */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-text">
      <div className="flex flex-col items-center gap-1">
        <Spinner size="xs" />
        <span className="text-xs text-subtle">xs</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Spinner size="sm" />
        <span className="text-xs text-subtle">sm</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Spinner size="md" />
        <span className="text-xs text-subtle">md</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Spinner size="lg" />
        <span className="text-xs text-subtle">lg</span>
      </div>
    </div>
  ),
};

/** Поряд із текстом — типовий inline fetch state. */
export const Inline: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-text">
      <Spinner size="sm" />
      <span className="text-sm">Завантажуємо транзакції…</span>
    </div>
  ),
};

/** На брендовому фоні — перевірка контрасту у module-кольорах. */
export const OnBrandSurface: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-2xl bg-finyk-soft px-3 py-2 text-finyk-strong">
        <Spinner size="sm" />
        <span className="text-sm">Finyk: rebuilding cache…</span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-fizruk-soft px-3 py-2 text-fizruk-strong">
        <Spinner size="sm" />
        <span className="text-sm">Fizruk: уперте оновлення…</span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-routine-surface px-3 py-2 text-routine-strong">
        <Spinner size="sm" />
        <span className="text-sm">Routine: підраховуємо streak…</span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-nutrition-soft px-3 py-2 text-nutrition-strong">
        <Spinner size="sm" />
        <span className="text-sm">Nutrition: зчитуємо штрих-код…</span>
      </div>
    </div>
  ),
};
