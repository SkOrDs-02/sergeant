import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkoutStatTile } from "./WorkoutStatTile";

/**
 * `WorkoutStatTile` — stat-tile для fizruk workout-summary sheet. Wash
 * адаптується через `--c-fizruk-tile` CSS variables (light = teal-800
 * wash, dark = white wash). Stories покривають `sm` / `lg` розміри плюс
 * варіант із тривалим текстом — initiative 0007 Phase 3, module-level
 * story для модуля Fizruk.
 */
const meta: Meta<typeof WorkoutStatTile> = {
  title: "Fizruk / WorkoutStatTile",
  component: WorkoutStatTile,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
    backgrounds: { default: "panel" },
  },
  decorators: [
    (Story) => (
      <div className="grid grid-cols-3 gap-2 max-w-md">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    label: "Тривалість",
    value: "42:18",
    size: "sm",
  },
};
export default meta;

type Story = StoryObj<typeof WorkoutStatTile>;

/** Стандартний `sm` tile із тривалістю та лейблом. */
export const Default: Story = {};

/** `lg` tile — для hero-метрики (наприклад, кількість вправ). */
export const Large: Story = {
  args: {
    label: "Вправ",
    value: "8",
    size: "lg",
  },
};

/** Великий тонаж із tabular-nums — перевіряє ширину для довгих чисел. */
export const Tonnage: Story = {
  args: {
    label: "Тонаж",
    value: "12 480 кг",
  },
};
