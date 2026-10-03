import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "./FormField";
import { Input } from "./Input";

/**
 * `FormField` — uniform-обгортка для form-controls: label + helper / error
 * slot + автоматичне `id`/`htmlFor`/`aria-describedby` wiring. Stories
 * покривають uppercase / normal-case label, helper / error states, optional
 * marker. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof FormField> = {
  title: "Shared / FormField",
  component: FormField,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    label: "Сума",
  },
};
export default meta;

type Story = StoryObj<typeof FormField>;

/** Стандартний uppercase-eyebrow label + Input. */
export const Default: Story = {
  render: (args) => (
    <FormField {...args}>
      <Input placeholder="0,00" />
    </FormField>
  ),
};

/** З helper-text — пояснення під Input-ом. */
export const WithHelper: Story = {
  render: (args) => (
    <FormField {...args} helperText="Введи у гривнях, без копійок.">
      <Input placeholder="0,00" />
    </FormField>
  ),
};

/** Помилка — заміняє helper, додає `aria-invalid` та `role=alert`. */
export const WithError: Story = {
  render: (args) => (
    <FormField {...args} error="Сума не може бути відʼємною">
      <Input defaultValue="-100" />
    </FormField>
  ),
};

/** Optional-маркер — додає `· необовʼязково` після label-у. */
export const Optional: Story = {
  render: (args) => (
    <FormField {...args} label="Коментар" optional>
      <Input placeholder="Додай нотатку" />
    </FormField>
  ),
};

/** Капс-брова — рідкісний випадок: службова позначка, а не питання. */
export const CapsLabel: Story = {
  render: (args) => (
    <FormField {...args} label="Валюта" capsLabel>
      <Input placeholder="UAH" />
    </FormField>
  ),
};
