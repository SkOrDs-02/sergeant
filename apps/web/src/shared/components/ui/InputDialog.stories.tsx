import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { InputDialog } from "./InputDialog";

/**
 * `InputDialog` — модальний primitive для введення одного string-значення з
 * confirm-dialog UX. Item #8 round-13: проганяється через `useApiForm` +
 * `zod`, тому `onConfirm` отримує валідоване значення (вільний string —
 * caller сам вирішує, що з ним робити).
 *
 * Усі stories використовують локальний state для toggling `open`, щоб
 * Storybook playground не закривав dialog між submit-ами.
 */
const meta: Meta<typeof InputDialog> = {
  title: "UI / InputDialog",
  component: InputDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    type: { control: "select", options: ["text", "password", "email", "url"] },
  },
  args: {
    open: true,
    title: "Введи значення",
    placeholder: "напр. Бюджет на квітень",
    confirmLabel: "ОК",
    cancelLabel: "Скасувати",
  },
};
export default meta;

type Story = StoryObj<typeof InputDialog>;

const InteractiveTemplate: Story["render"] = (args) => {
  const [open, setOpen] = useState(args.open);
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white"
      >
        Re-open dialog
      </button>
      {value !== null && (
        <p className="text-sm text-slate-600">
          Confirmed: {JSON.stringify(value)}
        </p>
      )}
      <InputDialog
        {...args}
        open={open}
        onConfirm={(v) => {
          setValue(v);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
};

export const Default: Story = { render: InteractiveTemplate };

export const WithDescription: Story = {
  render: InteractiveTemplate,
  args: {
    title: "Перейменувати бюджет",
    description: "Це не змінить історію — лише назву на дашборді.",
    defaultValue: "Бюджет на квітень",
  },
};

export const PasswordType: Story = {
  render: InteractiveTemplate,
  args: {
    title: "Підтверди пароль",
    type: "password",
    placeholder: "••••••••",
    confirmLabel: "Підтвердити",
  },
};
