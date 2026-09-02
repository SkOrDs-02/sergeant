import type { Meta, StoryObj } from "@storybook/react-vite";
import { PhotoItemsList } from "./PhotoItemsList";

/**
 * `PhotoItemsList` — список позицій, які фото-аналіз розпізнав на кадрі
 * (ініціатива 0023). Кожен рядок прибирається окремо, а підсумок картки
 * перераховується з того, що лишилось, тож виправити одну страву з трьох
 * можна без арифметики в голові.
 */
const meta: Meta<typeof PhotoItemsList> = {
  title: "Nutrition / PhotoItemsList",
  component: PhotoItemsList,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-2xl border border-line bg-panel p-3">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    fmtMacro: (v: unknown) => (v == null ? "—" : String(v)),
    items: [
      {
        name: "Котлета по-київськи",
        macros: { kcal: 300, protein_g: 21, fat_g: 18, carbs_g: 6 },
        gramsApprox: 120,
        confidence: 0.9,
      },
      {
        name: "Картопляне пюре",
        macros: { kcal: 180, protein_g: 4, fat_g: 6, carbs_g: 27 },
        gramsApprox: 200,
        confidence: 0.72,
      },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof PhotoItemsList>;

/** Список лише для читання — без `onRemoveItem` хрестиків немає. */
export const ReadOnly: Story = {};

/** Робочий стан картки: кожну позицію можна прибрати. */
export const Removable: Story = {
  args: {
    onRemoveItem: () => {},
  },
};

/**
 * Позиція, у якій модель невпевнена, несе застереження — саме на неї має
 * наводитись виправлення.
 */
export const LowConfidence: Story = {
  args: {
    onRemoveItem: () => {},
    items: [
      {
        name: "Котлета по-київськи",
        macros: { kcal: 300, protein_g: 21, fat_g: 18, carbs_g: 6 },
        gramsApprox: 120,
        confidence: 0.9,
      },
      {
        name: "Щось смажене",
        macros: { kcal: 210, protein_g: null, fat_g: 14, carbs_g: null },
        gramsApprox: null,
        confidence: 0.3,
      },
    ],
  },
};

/** Із кнопкою додавання позиції з каталогу (пікер підмінено заглушкою). */
export const WithAddButton: Story = {
  args: {
    onRemoveItem: () => {},
    renderAddItem: (close) => (
      <div className="rounded-xl border border-line bg-panelHi p-3">
        <div className="text-style-caption text-muted">
          Тут живе пошук по каталогу
        </div>
        <button
          type="button"
          onClick={close}
          className="touch-target text-style-caption text-muted"
        >
          Скасувати
        </button>
      </div>
    ),
  },
};
