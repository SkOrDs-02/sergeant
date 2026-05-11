import type { Meta, StoryObj } from "@storybook/react-vite";
import { FeatureSpotlight } from "./FeatureSpotlight";
import { SpotlightQueueProvider } from "./SpotlightQueue";
import { Button } from "./Button";

/**
 * `FeatureSpotlight` — Контекстна підказка для онбордингу та відкриття функцій.
 *
 * Малює spotlight-кільце навколо target-елемента і показує tooltip-картку.
 * Зберігає стан скасування в localStorage (`skipPersist={false}` за замовчуванням).
 *
 * У цих stories `skipPersist={true}` — spotlight рендериться щоразу.
 * Потребує `SpotlightQueueProvider` для координації черги.
 */
const meta: Meta<typeof FeatureSpotlight> = {
  title: "UI / FeatureSpotlight",
  component: FeatureSpotlight,
  parameters: {
    layout: "centered",
    chromatic: { disableSnapshot: true },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <SpotlightQueueProvider>
        <div className="relative p-20 bg-bg rounded-2xl min-h-[300px] flex items-center justify-center">
          <Story />
        </div>
      </SpotlightQueueProvider>
    ),
  ],
  args: {
    id: "story-spotlight",
    title: "Нова функція",
    description: "Натисни тут щоб додати нову транзакцію швидко.",
    skipPersist: true,
    delay: 0,
  },
};
export default meta;

type Story = StoryObj<typeof FeatureSpotlight>;

export const Bottom: Story = {
  args: {
    id: "story-bottom",
    placement: "bottom",
    children: <Button size="sm" variant="secondary">Нова транзакція</Button>,
  },
};

export const Top: Story = {
  args: {
    id: "story-top",
    placement: "top",
    title: "Глобальний пошук",
    description: "Натисни Cmd+K щоб шукати по всіх модулях.",
    children: <Button size="sm" variant="ghost">🔍 Пошук</Button>,
  },
};

export const Right: Story = {
  args: {
    id: "story-right",
    placement: "right",
    title: "Налаштування",
    description: "Тут можна налаштувати профіль та сповіщення.",
    children: <Button size="sm" variant="secondary" iconOnly>⚙️</Button>,
  },
};

export const CustomAction: Story = {
  args: {
    id: "story-custom-action",
    placement: "bottom",
    title: "Голосовий ввід",
    description: "Говори — ми запишемо витрату замість тебе.",
    actionText: "Спробувати",
    children: <Button size="md" variant="finyk">🎙 Голос</Button>,
  },
};
