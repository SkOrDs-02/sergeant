import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NumericAccessoryBar } from "./NumericAccessoryBar";
import { Input } from "./Input";
import { Label } from "./FormField";

/**
 * `NumericAccessoryBar` (UI-15) — тонка панель дій над екранною цифровою
 * клавіатурою під час фокусу на полі суми. Перетворює найчастіші жести
 * введення грошей — інкремент на кругле число, дозапис `.00`, підтвердження —
 * на one-tap таргети, щоб не цілитися в дрібні клавіші й не шукати кнопку
 * submit під згином екрана.
 *
 * Компонент презентаційний і value-driven: сам не читає стан фокуса, тому
 * чисто композиться всередині Sheet-футера, який уже трекає keyboard-inset.
 */
const meta: Meta<typeof NumericAccessoryBar> = {
  title: "UI / NumericAccessoryBar",
  component: NumericAccessoryBar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof NumericAccessoryBar>;

function Demo({ increments = [10, 100, 500] }: { increments?: number[] }) {
  const [value, setValue] = useState("");
  return (
    <div className="max-w-sm">
      <Label htmlFor="acc-amount">Сума ₴</Label>
      <Input
        id="acc-amount"
        type="number"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <NumericAccessoryBar
        className="mt-2 rounded-xl border"
        value={value}
        increments={increments}
        onValueChange={setValue}
        onDone={() => undefined}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const CustomIncrements: Story = {
  name: "Власні інкременти",
  render: () => <Demo increments={[50, 200, 1000]} />,
};
