import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "./Tooltip";
import { Button } from "./Button";

/**
 * `Tooltip` — accessible alternative до native `title="..."` (який не
 * читається screen-reader-ами і не keyboard-доступний). Заточений під
 * sergeant primitives:
 *
 * - `aria-describedby` авто-вішається на trigger, `role="tooltip"` —
 *   на floating panel.
 * - `openDelay` 150 ms (default) уникає flicker-у при русі по toolbar-у.
 * - `motion-safe:animate-fade-in` — респектує
 *   `prefers-reduced-motion: reduce`.
 * - Закривається на mouseleave / focusout / Escape.
 *
 * `children` — рівно ОДИН React-елемент. Trigger має forward-ити
 * `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` /
 * `aria-describedby`. Sergeant primitives (`Button`, `IconButton`,
 * `Badge`) роблять це з коробки.
 */
const meta: Meta<typeof Tooltip> = {
  title: "UI / Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    placement: {
      control: "select",
      options: [
        "top",
        "bottom",
        "left",
        "right",
        "top-center",
        "bottom-center",
        "left-center",
        "right-center",
      ],
    },
    openDelay: { control: { type: "number", min: 0, max: 1000, step: 50 } },
    disabled: { control: "boolean" },
  },
  args: {
    content: "Зберегти зміни (Ctrl+S)",
    placement: "top-center",
    openDelay: 150,
    disabled: false,
  },
};
export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="primary">Hover or focus me</Button>
    </Tooltip>
  ),
};

/** Чотири основні позиції — для візуального audit-у. */
export const Placements: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-12 p-12">
      <Tooltip content="Підказка зверху" placement="top">
        <Button variant="secondary">Top</Button>
      </Tooltip>
      <Tooltip content="Підказка справа" placement="right">
        <Button variant="secondary">Right</Button>
      </Tooltip>
      <Tooltip content="Підказка зліва" placement="left">
        <Button variant="secondary">Left</Button>
      </Tooltip>
      <Tooltip content="Підказка знизу" placement="bottom">
        <Button variant="secondary">Bottom</Button>
      </Tooltip>
    </div>
  ),
};

/** `disabled=true` — рендерить trigger, але tooltip ніколи не з'являється. */
export const Disabled: Story = {
  args: { disabled: true, content: "Цей tooltip не має з'являтись" },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="ghost">Hover me — нічого не станеться</Button>
    </Tooltip>
  ),
};

/** Довгий контент wrap-иться у max-w; не має ламати макет. */
export const LongContent: Story = {
  args: {
    content:
      "Ця дія негайно синхронізує локальні зміни з сервером і чекає підтвердження від cloud-sync queue (типово < 200 мс на 4G).",
  },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="primary">Force sync</Button>
    </Tooltip>
  ),
};
