import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * `ConfirmDialog` — bottom-sheet модалка для destructive / non-destructive
 * confirm-actions (видалення, скасування підписки тощо). Stories
 * покривають danger / safe варіанти, з description і без, custom labels.
 * `open=true` рендерить overlay + sheet — stories показують sheet у
 * відкритому стані для visual regression. Initiative 0007 Phase 2 —
 * shared/ui story.
 */
const meta: Meta<typeof ConfirmDialog> = {
  title: "Shared / ConfirmDialog",
  component: ConfirmDialog,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    open: true,
    title: "Видалити транзакцію?",
    description:
      "Цю транзакцію неможливо буде відновити. Бюджет і статистика перерахуються одразу.",
    confirmLabel: "Видалити",
    cancelLabel: "Скасувати",
    danger: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

/** Destructive дія — кнопка `confirm` червона (`variant="destructive"`). */
export const Destructive: Story = {};

/** Не-destructive дія — `danger=false`, кнопка primary. */
export const Safe: Story = {
  args: {
    title: "Зберегти зміни?",
    description: "Дані синхронізуються після збереження.",
    confirmLabel: "Зберегти",
    danger: false,
  },
};

/** Без опису — sheet тільки з заголовком і кнопками. */
export const TitleOnly: Story = {
  args: {
    description: undefined,
    title: "Точно скинути всі налаштування?",
  },
};

/** Закритий стан — render-функція повертає `null`. */
export const Closed: Story = {
  args: { open: false },
};
