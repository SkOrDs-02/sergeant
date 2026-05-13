import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { Button } from "./Button";

/**
 * `QuickActionsMenu` — Радіальне меню що з'являється на long-press.
 *
 * Активується утриманням (500ms) або Enter/Space на trigger-елементі.
 * Рендерить дії у напівколі вище або нижче trigger.
 *
 * У Storybook: утримуй кнопку 0.5с або натисни Enter на неї.
 */
const meta: Meta<typeof QuickActionsMenu> = {
  title: "UI / QuickActionsMenu",
  component: QuickActionsMenu,
  parameters: {
    layout: "centered",
    chromatic: { disableSnapshot: true },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="relative h-64 w-64 flex items-center justify-center bg-bg rounded-2xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof QuickActionsMenu>;

const finykActions = [
  {
    id: "expense",
    icon: "wallet" as const,
    label: "Витрата",
    color: "#10b981",
    onClick: () => {},
  },
  {
    id: "income",
    icon: "trending-up" as const,
    label: "Дохід",
    color: "#14b8a6",
    onClick: () => {},
  },
  {
    id: "note",
    icon: "edit" as const,
    label: "Нотатка",
    color: "#6366f1",
    onClick: () => {},
  },
];

const fizrukActions = [
  {
    id: "workout",
    icon: "activity" as const,
    label: "Тренування",
    color: "#14b8a6",
    onClick: () => {},
  },
  {
    id: "measure",
    icon: "ruler" as const,
    label: "Заміри",
    color: "#0d9488",
    onClick: () => {},
  },
];

export const FinykMenu: Story = {
  args: {
    trigger: (
      <Button variant="finyk" size="md" iconOnly aria-label="Додати">
        +
      </Button>
    ),
    actions: finykActions,
    position: "top",
  },
};

export const FizrukMenu: Story = {
  args: {
    trigger: (
      <Button variant="fizruk" size="md" iconOnly aria-label="Дії">
        ⚡
      </Button>
    ),
    actions: fizrukActions,
    position: "top",
  },
};

export const TwoActions: Story = {
  args: {
    trigger: (
      <Button variant="secondary" size="md" iconOnly aria-label="Меню">
        ⋮
      </Button>
    ),
    actions: [
      {
        id: "edit",
        icon: "edit" as const,
        label: "Редагувати",
        onClick: () => {},
      },
      {
        id: "delete",
        icon: "trash" as const,
        label: "Видалити",
        color: "#ef4444",
        onClick: () => {},
      },
    ],
    position: "top",
  },
};

export const BottomPosition: Story = {
  args: {
    trigger: (
      <Button variant="primary" size="md">
        Дії ↓
      </Button>
    ),
    actions: finykActions,
    position: "bottom",
  },
  decorators: [
    (Story) => (
      <div className="relative h-64 w-64 flex items-start justify-center pt-8 bg-bg rounded-2xl">
        <Story />
      </div>
    ),
  ],
};
