import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * `AnimatedNumber` — count-up animation для числових значень. Stories
 * рендерять у `immediate=true` (без анімації) щоб visual regression
 * snapshots не залежали від `requestAnimationFrame` timing-у.
 * Покривають базовий рендер, decimals, prefix/suffix, currency
 * formatting. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof AnimatedNumber> = {
  title: "Shared / AnimatedNumber",
  component: AnimatedNumber,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    value: 12480,
    immediate: true,
    className: "text-style-hero tabular-nums text-text",
  },
};
export default meta;

type Story = StoryObj<typeof AnimatedNumber>;

/** Дефолтний рендер цілого числа з default локаллю. */
export const Default: Story = {};

/** З decimals — два знаки після коми. */
export const Decimals: Story = {
  args: {
    value: 99.5,
    decimals: 1,
    suffix: " %",
  },
};

/** Currency-варіант із grouping та prefix-ом. */
export const Currency: Story = {
  args: {
    value: 250000,
    prefix: "₴",
    formatOptions: { useGrouping: true },
  },
};

/** Малі значення — нульове ведення нуля та decimals. */
export const SmallNumber: Story = {
  args: {
    value: 7.4,
    decimals: 1,
    suffix: " кг",
  },
};

/** Custom formatter — перевизначає locale/formatOptions. */
export const CustomFormatter: Story = {
  args: {
    value: 3661,
    formatter: (v) => {
      const h = Math.floor(v / 3600);
      const m = Math.floor((v % 3600) / 60);
      const s = Math.floor(v % 60);
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },
  },
};
