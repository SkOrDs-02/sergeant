import type { Meta, StoryObj } from "@storybook/react-vite";
import { DropdownMenu, type DropdownMenuEntry } from "./DropdownMenu";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * `DropdownMenu` — keyboard-first menu primitive (portal-mounted).
 *
 * Items support icon slots, shortcut hints (`<kbd>`), description lines,
 * destructive variants, disabled state, one-level submenus, separators
 * and label group headers. Keyboard nav: Arrow up/down, Home/End,
 * type-ahead, Enter/Space to activate, Escape to close, Tab to escape.
 */
const meta: Meta<typeof DropdownMenu> = {
  title: "UI / DropdownMenu",
  component: DropdownMenu,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DropdownMenu>;

const basicItems: DropdownMenuEntry[] = [
  { type: "item", id: "edit", label: "Редагувати", icon: <Icon name="edit" /> },
  {
    type: "item",
    id: "duplicate",
    label: "Дублювати",
    icon: <Icon name="plus" />,
    shortcut: "⌘ D",
  },
  { type: "separator" },
  {
    type: "item",
    id: "delete",
    label: "Видалити",
    icon: <Icon name="x-circle" />,
    destructive: true,
    shortcut: "⌫",
  },
];

/** Default — basic action menu з трьома пунктами. */
export const Basic: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        Меню
        <Icon name="chevron-down" />
      </Button>
    ),
    items: basicItems,
    ariaLabel: "Дії з елементом",
  },
};

/** Демонструє label-група + description lines. */
export const WithGroupsAndDescriptions: Story = {
  args: {
    trigger: <Button>Налаштування</Button>,
    items: [
      { type: "label", label: "Профіль" },
      {
        type: "item",
        id: "profile",
        label: "Мій профіль",
        description: "Імʼя, аватарка, контакти",
        icon: <Icon name="user" />,
      },
      {
        type: "item",
        id: "appearance",
        label: "Зовнішній вигляд",
        description: "Тема, акцент, типографіка",
        icon: <Icon name="sun" />,
      },
      { type: "separator" },
      { type: "label", label: "Сесія" },
      {
        type: "item",
        id: "logout",
        label: "Вийти",
        destructive: true,
        shortcut: "⇧ ⌘ Q",
      },
    ],
    ariaLabel: "Налаштування акаунта",
  },
};

/** Підменю першого рівня — ArrowRight, щоб увійти; ArrowLeft, щоб закрити. */
export const WithSubmenu: Story = {
  args: {
    trigger: <Button>Сортувати</Button>,
    items: [
      { type: "item", id: "name", label: "За назвою" },
      { type: "item", id: "date", label: "За датою" },
      {
        type: "submenu",
        id: "advanced",
        label: "Розширене сортування",
        icon: <Icon name="settings" />,
        items: [
          { type: "item", id: "size", label: "За розміром" },
          { type: "item", id: "owner", label: "За власником" },
          { type: "separator" },
          { type: "item", id: "custom", label: "Користувацьке…" },
        ],
      },
    ],
    ariaLabel: "Опції сортування",
  },
};

/** Disabled-стан + tooltip-like description. */
export const WithDisabled: Story = {
  args: {
    trigger: <Button variant="secondary">Дії</Button>,
    items: [
      { type: "item", id: "save", label: "Зберегти", shortcut: "⌘ S" },
      {
        type: "item",
        id: "share",
        label: "Поділитись",
        disabled: true,
        description: "Доступно після публікації",
      },
      { type: "separator" },
      { type: "item", id: "archive", label: "Архівувати" },
    ],
  },
};
