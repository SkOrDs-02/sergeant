import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./Select";

/**
 * `Select` — нативний `<select>` зі стилями, узгодженими з `<Input>`:
 * ті самі sizes (sm / md / lg) і той самий border / focus-ring treatment,
 * тож форми перестають мікшувати `h-11 rounded-2xl` поля з ad-hoc
 * `h-10 rounded-xl` селектами.
 *
 * Залишаємо нативний `<select>` навмисно — на iOS/Android відкривається
 * системний picker, що краще для a11y / UX, ніж кастомні дропдауни.
 * Цей wrapper лише дає каретку та узгоджує стилі.
 */
const meta: Meta<typeof Select> = {
  title: "UI / Select",
  component: Select,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
    variant: { control: "select", options: ["default", "filled", "ghost"] },
    error: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    size: "md",
    variant: "default",
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Select>;

const months = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень"];

function ControlledDemo(props: React.ComponentProps<typeof Select>) {
  const [value, setValue] = useState("Лютий");
  return (
    <Select {...props} value={value} onChange={(e) => setValue(e.target.value)}>
      {months.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  );
}

/** Default — `default` variant + `md` size; узгоджено з `<Input>`. */
export const Default: Story = {
  render: (args) => <ControlledDemo {...args} />,
};

/** `filled` variant — пасує темнішим формам всередині секцій-карт. */
export const Filled: Story = {
  args: { variant: "filled" },
  render: (args) => <ControlledDemo {...args} />,
};

/** `ghost` variant — прозорий, lite-density, hover показує `bg-panelHi`. */
export const Ghost: Story = {
  args: { variant: "ghost" },
  render: (args) => <ControlledDemo {...args} />,
};

/** Error-стан з `aria-invalid` — для invalid form-rows. */
export const Error: Story = {
  args: { error: true },
  render: (args) => <ControlledDemo {...args} />,
};

/** Disabled — `opacity-50 cursor-not-allowed`. */
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <ControlledDemo {...args} />,
};

/** Усі три розміри в стек — для side-by-side візуальної перевірки. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-64">
      <ControlledDemo size="sm" />
      <ControlledDemo size="md" />
      <ControlledDemo size="lg" />
    </div>
  ),
};
