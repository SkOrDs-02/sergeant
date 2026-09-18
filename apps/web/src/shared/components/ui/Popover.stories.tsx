import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover, PopoverItem, PopoverDivider } from "./Popover";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * `Popover` — click-triggered floating surface for menus, filters,
 * info-cards and contextual forms on desktop. Stories open the
 * popover in controlled mode (`open=true`) so visual states are
 * deterministic for chromatic snapshots.
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
      <div className="relative h-[320px] w-[420px] flex items-start justify-center pt-4">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Popover>;

/** Closed state — only the trigger is rendered. */
export const Closed: Story = {
  render: () => (
    <Popover trigger={<Button variant="ghost">Опції</Button>}>
      <PopoverItem>Редагувати</PopoverItem>
      <PopoverItem>Дублювати</PopoverItem>
    </Popover>
  ),
};

/** Open menu with several items. */
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

/** Menu with a divider + destructive item. */
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

/** Placement `bottom-end` — panel aligns with the trigger's right edge. */
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

/** Header + body + footer slots — turns the popover into a mini-dialog
 * (role="dialog" auto-applied) for form-in-popover patterns. */
export const WithHeaderAndFooter: Story = {
  render: () => (
    <Popover
      open
      trigger={<Button variant="ghost">Фільтри</Button>}
      header="Фільтри транзакцій"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Скинути
          </Button>
          <Button size="sm">Застосувати</Button>
        </div>
      }
    >
      <div className="px-2 py-2 space-y-2 text-sm text-fg">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" />
          Доходи
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" defaultChecked />
          Витрати
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" />
          Перекази
        </label>
      </div>
    </Popover>
  ),
};
