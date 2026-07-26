import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

/**
 * `Button` — головний CTA-примітив дизайн-системи Sergeant.
 *
 * ## Ортогональний API (канонічний)
 *
 * Кнопка описується двома незалежними осями (як `Badge`: `variant` × `tone`):
 * - **`variant`** — емфаза/форма: `solid` | `soft` | `outline` | `ghost`
 * - **`tone`** — колірна родина: `neutral` | `finyk` | `fizruk` | `routine` |
 *   `nutrition` | `danger` | `success` | `ink`
 *
 * Старі плоскі варіанти (`primary`, `finyk-soft`, …) та проп `module`
 * лишаються як **deprecated-аліаси** з байт-ідентичним виводом.
 *
 * Розмір `xs` / `sm` / icon-only автоматично отримує `min 44×44px` під
 * `@media (pointer: coarse)`, щоб primary controls лишались тапабельними.
 */
const meta: Meta<typeof Button> = {
  title: "UI / Button",
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      description: "Емфаза (канонічна) або legacy-alias",
      options: [
        // canonical emphasis
        "solid",
        "soft",
        "outline",
        "ghost",
        // legacy aliases (deprecated)
        "primary",
        "secondary",
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
        "primary-ink",
      ],
    },
    tone: {
      control: "select",
      description: "Колірна родина (канонічна вісь)",
      options: [
        "neutral",
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
        "danger",
        "success",
        "ink",
      ],
    },
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
  },
  args: {
    children: "Зберегти",
    variant: "solid",
    tone: "neutral",
    size: "md",
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "solid", tone: "neutral" } };

export const Secondary: Story = {
  args: { variant: "outline", tone: "neutral" },
};

export const Ghost: Story = { args: { variant: "ghost" } };

export const Destructive: Story = {
  args: { variant: "solid", tone: "danger", children: "Видалити" },
};

export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true } };

/**
 * Канонічна матриця `variant × tone`. Кожен рядок — емфаза, кожна колонка —
 * колірна родина. Порожні клітинки (немає виділеного стилю) безпечно
 * відкочуються на solid/neutral.
 */
export const VariantToneMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="solid" tone="neutral">
          solid / neutral
        </Button>
        <Button variant="solid" tone="ink">
          solid / ink
        </Button>
        <Button variant="solid" tone="danger">
          solid / danger
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="solid" tone="finyk">
          solid / finyk
        </Button>
        <Button variant="solid" tone="fizruk">
          solid / fizruk
        </Button>
        <Button variant="solid" tone="routine">
          solid / routine
        </Button>
        <Button variant="solid" tone="nutrition">
          solid / nutrition
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" tone="finyk">
          soft / finyk
        </Button>
        <Button variant="soft" tone="danger">
          soft / danger
        </Button>
        <Button variant="soft" tone="success">
          soft / success
        </Button>
        <Button variant="outline" tone="neutral">
          outline / neutral
        </Button>
        <Button variant="ghost" tone="neutral">
          ghost / neutral
        </Button>
      </div>
    </div>
  ),
};

/**
 * Module brand variants через легасі-аліаси (deprecated). Еквівалент
 * `variant="solid" tone="{module}"` — лишено як приклад зворотної сумісності.
 */
export const ModuleVariantsLegacy: Story = {
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
