import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sheet } from "./Sheet";
import { Button } from "./Button";

/**
 * `Sheet` — канонічний bottom-sheet shell для модулів Finyk / Fizruk /
 * Routine / Nutrition. Stories рендерять у `open=true` для visual
 * regression. Покривають варіанти з / без description, з footer-actions,
 * з headerRight-slot. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof Sheet> = {
  title: "Shared / Sheet",
  component: Sheet,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    open: true,
    onClose: () => {},
    title: "Нова транзакція",
    description: "Заповни форму, щоб додати витрату",
    children: (
      <div className="space-y-3 px-1">
        <p className="text-sm text-text">
          Заповни поля та натисни «Зберегти». Категорії та теги можна редагувати
          пізніше.
        </p>
      </div>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof Sheet>;

/** Стандартний sheet з description і body. */
export const Default: Story = {};

/** Без description — title + body. */
export const TitleOnly: Story = {
  args: {
    description: undefined,
  },
};

/** З footer-actions (sticky CTA-row внизу). */
export const WithFooter: Story = {
  args: {
    footer: (
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" className="w-full">
          Скасувати
        </Button>
        <Button variant="primary" className="w-full">
          Зберегти
        </Button>
      </div>
    ),
  },
};

/** З headerRight slot — додаткова кнопка (наприклад, «Шаблони»). */
export const WithHeaderRight: Story = {
  args: {
    headerRight: (
      <Button variant="ghost" className="text-xs">
        Шаблони
      </Button>
    ),
  },
};

/** Hidden handle — без drag-pill. */
export const NoHandle: Story = {
  args: {
    hideHandle: true,
  },
};
