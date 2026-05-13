import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  KeyboardShortcutsModal,
  ShortcutRegistryProvider,
} from "./KeyboardShortcutsModal";
import { Button } from "./Button";

/**
 * `KeyboardShortcutsModal` — Модал з довідником клавіатурних скорочень.
 *
 * Відкривається через `?` (глобальний хоткей). Групує shortcuts по категоріям.
 * Підтримує динамічну реєстрацію модульних shortcuts через `ShortcutRegistryProvider`.
 */

function ControlledDemo(
  props: Partial<React.ComponentProps<typeof KeyboardShortcutsModal>>,
) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <Button onClick={() => setOpen(true)} variant="secondary">
        ? Відкрити shortcuts
      </Button>
      <KeyboardShortcutsModal
        open={open}
        onClose={() => setOpen(false)}
        {...props}
      />
    </div>
  );
}

const meta: Meta<typeof KeyboardShortcutsModal> = {
  title: "UI / KeyboardShortcutsModal",
  component: KeyboardShortcutsModal,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
  render: () => (
    <ShortcutRegistryProvider>
      <ControlledDemo />
    </ShortcutRegistryProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof KeyboardShortcutsModal>;

export const Default: Story = {};

export const WithCustomShortcuts: Story = {
  render: () => (
    <ShortcutRegistryProvider>
      <ControlledDemo
        shortcuts={[
          { keys: ["N"], description: "Нова витрата", category: "Finyk" },
          { keys: ["I"], description: "Новий дохід", category: "Finyk" },
          { keys: ["Cmd", "B"], description: "Бюджети", category: "Finyk" },
          { keys: ["T"], description: "Нове тренування", category: "Fizruk" },
          { keys: ["H"], description: "Нова звичка", category: "Routine" },
          {
            keys: ["M"],
            description: "Новий прийом їжі",
            category: "Nutrition",
          },
          { keys: ["?"], description: "Ця підказка", category: "Загальні" },
          { keys: ["Esc"], description: "Закрити", category: "Загальні" },
        ]}
      />
    </ShortcutRegistryProvider>
  ),
};
