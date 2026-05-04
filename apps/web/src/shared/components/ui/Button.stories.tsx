import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

/**
 * `Button` — головний CTA-примітив дизайн-системи Sergeant.
 *
 * Варіанти охоплюють core + чотири module brand-кольори (finyk / fizruk /
 * routine / nutrition) у solid та `-soft` варіантах. Розмір `xs` / `sm` /
 * icon-only автоматично отримує `min 44×44px` під `@media (pointer: coarse)`,
 * щоб primary controls лишались тапабельними на телефоні.
 */
const meta: Meta<typeof Button> = {
  title: "UI / Button",
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "primary",
        "secondary",
        "ghost",
        "danger",
        "destructive",
        "success",
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
        "finyk-soft",
        "fizruk-soft",
        "routine-soft",
        "nutrition-soft",
      ],
    },
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
  },
  args: {
    children: "Зберегти",
    variant: "primary",
    size: "md",
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: "secondary" } };

export const Ghost: Story = { args: { variant: "ghost" } };

export const Destructive: Story = {
  args: { variant: "destructive", children: "Видалити" },
};

export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true } };

/** Module brand variants — фіналізують hero-CTA на сторінках кожного модуля. */
export const ModuleVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="finyk">Finyk</Button>
      <Button variant="fizruk">Fizruk</Button>
      <Button variant="routine">Routine</Button>
      <Button variant="nutrition">Nutrition</Button>
    </div>
  ),
};

/** Розміри — від `xs` (chips) до `xl` (hero CTA). */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">XS</Button>
      <Button size="sm">SM</Button>
      <Button size="md">MD</Button>
      <Button size="lg">LG</Button>
      <Button size="xl">XL</Button>
    </div>
  ),
};
