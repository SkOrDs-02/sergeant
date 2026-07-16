import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateField } from "./DateField";

const meta: Meta<typeof DateField> = {
  title: "UI / DateField",
  component: DateField,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    label: "Дата завершення",
    emptyLabel: "Обери дату",
  },
};

export default meta;
type Story = StoryObj<typeof DateField>;

export const Empty: Story = {};

export const Filled: Story = {
  args: { defaultValue: "2026-07-17" },
};

export const NarrowContainer: Story = {
  render: (args) => (
    <div className="w-[280px] min-w-0 rounded-2xl border border-line p-3">
      <DateField {...args} />
    </div>
  ),
};
