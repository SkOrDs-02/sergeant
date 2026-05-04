import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

/**
 * `Badge` — компактна pill-мітка для статусів, лічильників і tag-ів.
 * Тон `soft` (default) — для inline labels на cards; `solid` — для high-emphasis
 * стану (наприклад, "Live" або "Error"); `outline` — для "ghost" tag-ів у
 * списках, де контент важливіший за акцент.
 */
const meta: Meta<typeof Badge> = {
  title: "UI / Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "neutral",
        "accent",
        "success",
        "warning",
        "danger",
        "info",
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
      ],
    },
    tone: { control: "select", options: ["soft", "solid", "outline"] },
    size: { control: "select", options: ["xs", "sm", "md"] },
  },
  args: {
    children: "Live",
    variant: "success",
    tone: "soft",
    size: "sm",
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const Solid: Story = { args: { tone: "solid" } };

export const Outline: Story = { args: { tone: "outline" } };

/** Усі семантичні варіанти у tone "soft". */
export const SemanticPalette: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

/** Module brand-кольори — для module-specific інформер-ів і tag-ів. */
export const ModulePalette: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="finyk">Finyk</Badge>
      <Badge variant="fizruk">Fizruk</Badge>
      <Badge variant="routine">Routine</Badge>
      <Badge variant="nutrition">Nutrition</Badge>
    </div>
  ),
};
