import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "./Tooltip";
import { Button } from "./Button";

/**
 * `Tooltip` — accessible alternative to native `title="..."` (which is
 * not announced by screen readers and not keyboard accessible). Tailored
 * for Sergeant primitives:
 *
 * - `aria-describedby` is wired automatically on the trigger;
 *   `role="tooltip"` lives on the floating panel.
 * - `openDelay` 150 ms (default) avoids flicker when sweeping across
 *   a toolbar.
 * - `motion-safe:animate-fade-in` respects
 *   `prefers-reduced-motion: reduce`.
 * - Closes on mouseleave / focusout / Escape / outside-click.
 * - Portaled to `document.body` so transformed ancestors don't clip
 *   or re-anchor the panel.
 *
 * `children` — a single React element. The trigger must forward
 * `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` /
 * `aria-describedby`. Sergeant primitives (`Button`, `IconButton`,
 * `Badge`) do this out of the box.
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
        "top-start",
        "top-end",
        "right",
        "right-start",
        "right-end",
        "bottom",
        "bottom-start",
        "bottom-end",
        "left",
        "left-start",
        "left-end",
      ],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
    openDelay: { control: { type: "number", min: 0, max: 1000, step: 50 } },
    disabled: { control: "boolean" },
  },
  args: {
    content: "Зберегти зміни (Ctrl+S)",
    placement: "top",
    size: "sm",
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

/** Four cardinal placements + start/end alignment options. */
export const Placements: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-12 p-12">
      <Tooltip content="top-start" placement="top-start">
        <Button variant="secondary">top-start</Button>
      </Tooltip>
      <Tooltip content="top" placement="top">
        <Button variant="secondary">top</Button>
      </Tooltip>
      <Tooltip content="top-end" placement="top-end">
        <Button variant="secondary">top-end</Button>
      </Tooltip>

      <Tooltip content="left" placement="left">
        <Button variant="secondary">left</Button>
      </Tooltip>
      <span />
      <Tooltip content="right" placement="right">
        <Button variant="secondary">right</Button>
      </Tooltip>

      <Tooltip content="bottom-start" placement="bottom-start">
        <Button variant="secondary">bottom-start</Button>
      </Tooltip>
      <Tooltip content="bottom" placement="bottom">
        <Button variant="secondary">bottom</Button>
      </Tooltip>
      <Tooltip content="bottom-end" placement="bottom-end">
        <Button variant="secondary">bottom-end</Button>
      </Tooltip>
    </div>
  ),
};

/** `sm` vs `md` — `md` is for multi-line copy / wider tooltips. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Tooltip content="Compact tooltip (default)" size="sm">
        <Button variant="secondary">size=sm</Button>
      </Tooltip>
      <Tooltip
        content="Більше повітря для довшого пояснення з кількома рядками."
        size="md"
      >
        <Button variant="secondary">size=md</Button>
      </Tooltip>
    </div>
  ),
};

/** `disabled=true` — renders the trigger but no tooltip ever appears. */
export const Disabled: Story = {
  args: { disabled: true, content: "Цей tooltip не має з'являтись" },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="ghost">Hover me — нічого не станеться</Button>
    </Tooltip>
  ),
};

/** Long content wraps within `max-w`; it should not break the layout. */
export const LongContent: Story = {
  args: {
    size: "md",
    content:
      "Ця дія негайно синхронізує локальні зміни з сервером і чекає підтвердження від cloud-sync queue (типово < 200 мс на 4G).",
  },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="primary">Force sync</Button>
    </Tooltip>
  ),
};
