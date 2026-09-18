import type { Meta, StoryObj } from "@storybook/react-vite";
import { VoiceMicButton } from "./VoiceMicButton";

/**
 * `VoiceMicButton` — Кнопка голосового вводу з auto-fallback між Groq Whisper
 * та Web Speech API.
 *
 * Стани: idle → listening (пульсує червоним) → uploading (spinner) → результат.
 * Повертає `null` якщо жоден провайдер не підтримується браузером.
 *
 * ⚠️ Потребує реального браузера з Web Speech API або налаштованого `/api/transcribe`.
 * Chromatic snapshot вимкнений — компонент повертає null у headless-середовищі.
 */
const meta: Meta<typeof VoiceMicButton> = {
  title: "UI / VoiceMicButton",
  component: VoiceMicButton,
  parameters: {
    layout: "centered",
    chromatic: { disableSnapshot: true },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    disabled: { control: "boolean" },
    confirmBeforeCommit: { control: "boolean" },
  },
  args: {
    size: "md",
    lang: "uk-UA",
    label: "Голосовий ввід",
    disabled: false,
    confirmBeforeCommit: true,
    onResult: (text) => console.log("Розпізнано:", text),
    onError: (msg) => console.error("Помилка:", msg),
  },
};
export default meta;

type Story = StoryObj<typeof VoiceMicButton>;

export const Medium: Story = {
  args: { size: "md" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Large: Story = {
  args: { size: "lg" },
};

export const Disabled: Story = {
  args: { size: "md", disabled: true },
};

export const WithHint: Story = {
  args: {
    size: "md",
    promptHint: "жим штанги, присід, тяга, підйом на біцепс",
    label: "Голосовий ввід вправи",
  },
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      <VoiceMicButton {...args} size="sm" />
      <VoiceMicButton {...args} size="md" />
      <VoiceMicButton {...args} size="lg" />
    </div>
  ),
};
