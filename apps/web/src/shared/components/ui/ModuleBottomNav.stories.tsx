import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModuleBottomNav } from "./ModuleBottomNav";
import { Icon } from "./Icon";
import { RoutineBottomNav } from "../../../modules/routine/components/RoutineBottomNav";

/**
 * `ModuleBottomNav` — спільна bottom-navigation shell для Finyk /
 * Fizruk / Routine / Nutrition. Browser: floating pill (`bottom-nav-shell`
 * utility — mx-3, mb-[safe-area+0.5rem], rounded-3xl). PWA standalone:
 * edge-to-edge dock (mx-0, mb-0, rounded-t-3xl, pb-[safe-area]).
 * Активний таб маркується тонким кольоровим контуром (`rounded-2xl border`)
 * з module-tinted кольором — це носій module identity. Активна іконка
 * приймає `tokens.text`, label лишається `text-text`.
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
      <div className="relative h-[200px] w-full bg-bg">
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
        label: "Головна",
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

/** Фінік — active tab: emerald outline (light) / solid emerald-400 fill
 *  + ink icon (dark «Чорнило»), активна вкладка «Головна». */
export const Finyk: Story = {};

/** Фізрук — cyan outline (light) / solid cyan-400 fill (dark), «Бюджети». */
export const Fizruk: Story = {
  args: {
    module: "fizruk",
    activeId: "budgets",
    items: [
      { id: "home", label: "Головна", icon: <Icon name="home" size="lg" /> },
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

/** Routine — coral outline (light) / solid coral-400 fill (dark), без FAB. */
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

/** Nutrition — lime outline (light) / solid lime-400 fill (dark). */
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
        label: "Головна",
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

/**
 * Routine special-case — 2-tab pill з центральним FAB як sibling
 * (НЕ nested усередині nav). FAB sits at `z-40` 22 px above the
 * pill's top edge, зберігаючи власний coral gradient та `shadow-float`.
 * Використовується в RoutineApp як основна навігація.
 */
export const RoutineWithFab: StoryObj<typeof RoutineBottomNav> = {
  render: (args) => (
    <div className="relative h-[200px] w-full bg-bg">
      <div className="absolute inset-x-0 bottom-0">
        <RoutineBottomNav {...args} />
      </div>
    </div>
  ),
  args: {
    mainTab: "calendar",
    onSelectTab: () => {},
    onAddHabit: () => {},
  },
  parameters: { chromatic: { viewports: [375, 768] } },
};
