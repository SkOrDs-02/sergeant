import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, type TabItem, type TabsProps } from "./Tabs";

/**
 * `Tabs` — accessible tablist з повною клавіатурною підтримкою
 * (ArrowLeft / ArrowRight, Home / End, Enter / Space). Для перемикання
 * *між сторінками контенту*, які мають URL-адресовані стани.
 *
 * Two-axis API:
 *   - `variant` — accent-колір (`brand` дефолт; чотири module-токени для
 *                 module-scoped activnogo стану).
 *   - `style`   — візуальне трактування активної tab-и.
 *                 `underline` (default) — тонкий бордер; працює у dense layouts.
 *                 `pill`                — soft tinted pill; для ізольованих рядів.
 *
 * Для compact mode-switcher (без контентних панелей) використовуй
 * `Segmented` — там немає `aria-controls` і немає bagagу `tablist`.
 */
const items: TabItem<string>[] = [
  { value: "overview", label: "Огляд" },
  { value: "transactions", label: "Транзакції", badge: "12" },
  { value: "budgets", label: "Бюджети" },
  { value: "settings", label: "Налаштування" },
];

const meta: Meta<typeof Tabs> = {
  title: "UI / Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    style: { control: "select", options: ["underline", "pill"] },
    variant: {
      control: "select",
      options: ["brand", "finyk", "fizruk", "routine", "nutrition"],
    },
    size: { control: "select", options: ["sm", "md"] },
    fill: { control: "boolean" },
  },
  args: {
    items,
    style: "underline",
    variant: "brand",
    size: "md",
    fill: false,
  },
};
export default meta;

type Story = StoryObj<typeof Tabs>;

function ControlledTabsDemo({
  initial = "overview",
  wrapWidth,
  ...rest
}: Omit<TabsProps<string>, "value" | "onChange"> & {
  initial?: string;
  wrapWidth?: string;
}) {
  const [value, setValue] = useState(initial);
  const tabs = <Tabs {...rest} value={value} onChange={setValue} />;
  return wrapWidth ? <div className={wrapWidth}>{tabs}</div> : tabs;
}

/** Default — controlled через `useState`. */
export const Default: Story = {
  render: (args) => <ControlledTabsDemo {...args} />,
};

export const Pill: Story = {
  args: { style: "pill" },
  render: (args) => <ControlledTabsDemo {...args} />,
};

export const Small: Story = {
  args: { size: "sm" },
  render: (args) => <ControlledTabsDemo {...args} />,
};

export const Fill: Story = {
  args: { fill: true },
  render: (args) => <ControlledTabsDemo {...args} wrapWidth="w-[480px]" />,
};

function ModuleVariantsDemo() {
  return (
    <div className="flex flex-col gap-4">
      <ControlledTabsDemo items={items} variant="finyk" />
      <ControlledTabsDemo items={items} variant="fizruk" />
      <ControlledTabsDemo items={items} variant="routine" />
      <ControlledTabsDemo items={items} variant="nutrition" />
    </div>
  );
}

/** Module-кольори — для module-scoped page navigation. */
export const ModuleVariants: Story = {
  render: () => <ModuleVariantsDemo />,
};

function WithDisabledDemo() {
  const withDisabled: TabItem<string>[] = [
    { value: "overview", label: "Огляд" },
    { value: "transactions", label: "Транзакції" },
    { value: "premium", label: "Premium", disabled: true, badge: "PRO" },
  ];
  return <ControlledTabsDemo items={withDisabled} />;
}

/** Disabled tab — все ще присутня у tab-list, але не доступна. */
export const WithDisabled: Story = {
  render: () => <WithDisabledDemo />,
};
