import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModuleBottomNav } from "./ModuleBottomNav";
import { Icon } from "./Icon";

/**
 * `ModuleBottomNav` — спільна bottom-navigation shell для Finyk /
 * Fizruk / Routine / Nutrition. Stories показують одну палітру на
 * story (module-tinted active-pill, glow на іконці). Render-only —
 * `onChange` нічого не робить. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof ModuleBottomNav> = {
  title: "Shared / ModuleBottomNav",
  component: ModuleBottomNav,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[160px] w-full bg-bg">
        <div className="absolute inset-x-0 bottom-0">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    activeId: "home",
    module: "finyk",
    onChange: () => {},
    items: [
      {
        id: "home",
        label: "Дашборд",
        icon: <Icon name="home" size="lg" />,
      },
      {
        id: "transactions",
        label: "Витрати",
        icon: <Icon name="list" size="lg" />,
      },
      {
        id: "budgets",
        label: "Бюджети",
        icon: <Icon name="pie-chart" size="lg" />,
      },
      {
        id: "settings",
        label: "Налаштування",
        icon: <Icon name="settings" size="lg" />,
      },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof ModuleBottomNav>;

/** Фінік — зелений accent, активна вкладка «Дашборд». */
export const Finyk: Story = {};

/** Фізрук — teal accent, активна вкладка «Бюджети» (як приклад). */
export const Fizruk: Story = {
  args: {
    module: "fizruk",
    activeId: "budgets",
    items: [
      { id: "home", label: "Дашборд", icon: <Icon name="home" size="lg" /> },
      {
        id: "workouts",
        label: "Тренування",
        icon: <Icon name="dumbbell" size="lg" />,
      },
      {
        id: "budgets",
        label: "План",
        icon: <Icon name="calendar" size="lg" />,
      },
      {
        id: "stats",
        label: "Статистика",
        icon: <Icon name="bar-chart" size="lg" />,
      },
    ],
  },
};

/** Routine — coral accent. */
export const Routine: Story = {
  args: {
    module: "routine",
    activeId: "home",
    items: [
      { id: "home", label: "Сьогодні", icon: <Icon name="home" size="lg" /> },
      {
        id: "stats",
        label: "Прогрес",
        icon: <Icon name="trending-up" size="lg" />,
      },
      {
        id: "settings",
        label: "Звички",
        icon: <Icon name="settings" size="lg" />,
      },
    ],
  },
};

/** Nutrition — lime accent. */
export const Nutrition: Story = {
  args: {
    module: "nutrition",
    activeId: "home",
    items: [
      { id: "home", label: "Раціон", icon: <Icon name="apple" size="lg" /> },
      {
        id: "menu",
        label: "Меню",
        icon: <Icon name="list" size="lg" />,
      },
      {
        id: "stats",
        label: "Аналіз",
        icon: <Icon name="bar-chart" size="lg" />,
      },
    ],
  },
};

/** З badge-індикатором (увімкнено для першого item). */
export const WithBadge: Story = {
  args: {
    items: [
      {
        id: "home",
        label: "Дашборд",
        icon: <Icon name="home" size="lg" />,
        badge: true,
      },
      {
        id: "transactions",
        label: "Витрати",
        icon: <Icon name="list" size="lg" />,
      },
      {
        id: "budgets",
        label: "Бюджети",
        icon: <Icon name="pie-chart" size="lg" />,
      },
      {
        id: "settings",
        label: "Налаштування",
        icon: <Icon name="settings" size="lg" />,
      },
    ],
  },
};
