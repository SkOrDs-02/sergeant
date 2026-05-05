import type { Meta, StoryObj } from "@storybook/react-vite";
import { MacroChip } from "./MacroChip";

/**
 * `MacroChip` — компактний chip для відображення макронутрієнта в
 * meal-sheet (Білки / Жири / Вуглеводи / kcal). Stories покривають
 * стандартний рендер, кастомний колір (nutrition-accent) і пустий стан
 * (`value=null` → рендерить «—»). Initiative 0007 Phase 3, module-level
 * story для модуля Nutrition.
 */
const meta: Meta<typeof MacroChip> = {
  title: "Nutrition / MacroChip",
  component: MacroChip,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="flex gap-2 rounded-2xl border border-line bg-panel p-2">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    label: "Білки",
    value: 32,
    unit: "г",
  },
};
export default meta;

type Story = StoryObj<typeof MacroChip>;

/** Звичайний chip із значенням 32 г. */
export const Default: Story = {};

/** З accent-кольором nutrition (типове застосування у додатку). */
export const NutritionAccent: Story = {
  args: {
    label: "Вуглеводи",
    value: 87,
    color: "text-nutrition",
  },
};

/** Пустий стан — `value=null` рендерить тире-плейсхолдер. */
export const Empty: Story = {
  args: {
    label: "Жири",
    value: null,
  },
};

/** kcal-варіант із кастомною одиницею. */
export const Calories: Story = {
  args: {
    label: "Калорії",
    value: 612,
    unit: "ккал",
  },
};
