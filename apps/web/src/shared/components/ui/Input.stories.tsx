import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./Input";

/**
 * `Input` — base text-field примітив дизайн-системи Sergeant.
 *
 * Підтримує три розміри (`sm` / `md` / `lg`) та три варіанти
 * (`default` / `filled` / `ghost`). Опціональні `label`, `helperText`,
 * `icon`, `suffix` та живий `12/50` лічильник символів через `maxLength`.
 *
 * Type-aware дефолти: для `email` / `tel` / `url` / `number` / `search` /
 * `password` Input автоматично виставляє `spellCheck={false}` та
 * відповідний `inputMode`, щоб мобільна клавіатура одразу показувала
 * правильний набір символів. Явний пропс перекриває дефолт.
 *
 * Focus-ring `ring-brand-500/30` синхронізований з `Button` — одна
 * клавіатурна мова на всіх interactive-елементах.
 */
const meta: Meta<typeof Input> = {
  title: "UI / Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
    variant: { control: "select", options: ["default", "filled", "ghost"] },
    type: {
      control: "select",
      options: ["text", "email", "password", "tel", "url", "number", "search"],
    },
    error: { control: "boolean" },
    success: { control: "boolean" },
    disabled: { control: "boolean" },
    showCharCount: { control: "boolean" },
  },
  args: {
    placeholder: "Введіть текст…",
    size: "md",
    variant: "default",
  },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: {
    label: "Email",
    id: "email",
    type: "email",
    placeholder: "you@example.com",
  },
};

export const WithHelperText: Story = {
  args: {
    label: "Пароль",
    id: "password",
    type: "password",
    helperText: "Мінімум 8 символів",
  },
};

export const Error: Story = {
  args: {
    label: "Email",
    id: "email-err",
    type: "email",
    error: true,
    helperText: "Некоректний формат",
    defaultValue: "not-an-email",
  },
};

export const Success: Story = {
  args: {
    label: "Email",
    id: "email-ok",
    type: "email",
    success: true,
    defaultValue: "you@example.com",
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Disabled value" },
};

/** Розміри — `sm` для inline filters, `md` за замовчуванням, `lg` для hero-форм. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-72">
      <Input size="sm" placeholder="sm — inline filter" />
      <Input size="md" placeholder="md — default" />
      <Input size="lg" placeholder="lg — hero form" />
    </div>
  ),
};

/** Варіанти — `default` облямований, `filled` без бордера, `ghost` чисто-фон. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-72">
      <Input variant="default" placeholder="default" />
      <Input variant="filled" placeholder="filled" />
      <Input variant="ghost" placeholder="ghost" />
    </div>
  ),
};

/** Live char-counter — turns warning at ≥80 %, danger at 100 %. */
export const WithCharCounter: Story = {
  args: {
    label: "Коментар",
    id: "comment",
    maxLength: 50,
    defaultValue: "Sergeant — це твій operating system для життя",
  },
};
