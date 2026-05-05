import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover, PopoverItem, PopoverDivider } from "./Popover";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * `Popover` — desktop dropdown / context-menu з focus-trap-lite,
 * outside-click та Escape dismiss. Stories відкривають popover у
 * controlled-mode (`open=true`), щоб фіксувати visual state. Покривають
 * стандартний items-список, з divider, з destructive-варіантом, і
 * placement варіанти. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof Popover> = {
  title: "Shared / Popover",
  component: Popover,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="relative h-[260px] w-[320px] flex items-start justify-center pt-4">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Popover>;

/** Закритий стан — лише trigger-кнопка. */
export const Closed: Story = {
  render: () => (
    <Popover trigger={<Button variant="ghost">Опції</Button>}>
      <PopoverItem>Редагувати</PopoverItem>
      <PopoverItem>Дублювати</PopoverItem>
    </Popover>
  ),
};

/** Відкритий popover із кількома items. */
export const Open: Story = {
  render: () => (
    <Popover open trigger={<Button variant="ghost">Опції</Button>}>
      <PopoverItem icon={<Icon name="edit" size="sm" />}>
        Редагувати
      </PopoverItem>
      <PopoverItem icon={<Icon name="copy" size="sm" />}>Дублювати</PopoverItem>
      <PopoverItem icon={<Icon name="external-link" size="sm" />}>
        Відкрити у новій вкладці
      </PopoverItem>
    </Popover>
  ),
};

/** З divider-ом і destructive-варіантом внизу. */
export const WithDivider: Story = {
  render: () => (
    <Popover open trigger={<Button variant="ghost">Опції</Button>}>
      <PopoverItem icon={<Icon name="edit" size="sm" />}>
        Редагувати
      </PopoverItem>
      <PopoverItem icon={<Icon name="copy" size="sm" />}>Дублювати</PopoverItem>
      <PopoverDivider />
      <PopoverItem icon={<Icon name="trash-2" size="sm" />} destructive>
        Видалити
      </PopoverItem>
    </Popover>
  ),
};

/** Placement `bottom-end` — popover вирівнюється по правому краю trigger-а. */
export const PlacementBottomEnd: Story = {
  render: () => (
    <Popover
      open
      placement="bottom-end"
      trigger={<Button variant="ghost">Опції</Button>}
    >
      <PopoverItem>Налаштування</PopoverItem>
      <PopoverItem>Допомога</PopoverItem>
    </Popover>
  ),
};
