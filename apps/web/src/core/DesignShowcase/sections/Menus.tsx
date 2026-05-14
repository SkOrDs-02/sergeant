// Showcase section — keyboard-driven menus (DropdownMenu + global
// Command Palette). Track 5 / Design System polish.
//
// Status: Active. Last validated: 2026-05-13 by @Skords-01 / Devin.

import {
  Button,
  DropdownMenu,
  Icon,
  useCommandPaletteControls,
  type DropdownMenuEntry,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared/primitives";

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

const groupedItems: DropdownMenuEntry[] = [
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
];

const submenuItems: DropdownMenuEntry[] = [
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
];

const disabledItems: DropdownMenuEntry[] = [
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
];

export function MenusSection() {
  const { open: openPalette } = useCommandPaletteControls();
  return (
    <Sec id="menus" title="Menus та командна палітра">
      <Group label="DropdownMenu — базовий" row>
        <DropdownMenu
          ariaLabel="Дії з елементом"
          items={basicItems}
          trigger={
            <Button variant="secondary" size="sm">
              Меню
              <Icon name="chevron-down" size={14} />
            </Button>
          }
        />
        <DropdownMenu
          ariaLabel="Налаштування акаунта"
          items={groupedItems}
          trigger={
            <Button variant="secondary" size="sm">
              Налаштування
              <Icon name="chevron-down" size={14} />
            </Button>
          }
        />
      </Group>

      <Group label="DropdownMenu — підменю та disabled" row>
        <DropdownMenu
          ariaLabel="Опції сортування"
          items={submenuItems}
          trigger={
            <Button variant="secondary" size="sm">
              Сортувати
              <Icon name="chevron-down" size={14} />
            </Button>
          }
        />
        <DropdownMenu
          ariaLabel="Дії"
          items={disabledItems}
          placement="bottom-end"
          trigger={
            <Button variant="ghost" size="sm" iconOnly aria-label="Більше дій">
              <Icon name="more-horizontal" size={16} />
            </Button>
          }
        />
      </Group>

      <Group label="Командна палітра">
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Натисни{" "}
            <kbd className="px-1.5 h-5 inline-flex items-center text-2xs font-mono font-semibold text-muted bg-surface-muted border border-line rounded-md">
              ⌘ K
            </kbd>{" "}
            (або{" "}
            <kbd className="px-1.5 h-5 inline-flex items-center text-2xs font-mono font-semibold text-muted bg-surface-muted border border-line rounded-md">
              Ctrl K
            </kbd>{" "}
            на Windows / Linux), щоб відкрити палітру з пошуком і клавіатурною
            навігацією. Або кнопка нижче — обхідний шлях для тач-пристроїв.
          </p>
          <Button onClick={openPalette}>Відкрити палітру</Button>
        </div>
      </Group>
    </Sec>
  );
}
