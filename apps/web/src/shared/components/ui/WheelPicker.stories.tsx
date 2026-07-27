import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WheelPicker } from "./WheelPicker";

/**
 * `WheelPicker` — вертикальний scroll-snap барабан для вибору значення з
 * дискретного набору. Створений для сенсорного вводу (R2-UI-18), де
 * системна цифрова клавіатура перекриває пів-екрана: колесо тримає ввід
 * inline. На desktop зазвичай лишають точний stepper/numeric-інпут, а
 * колесо вмикають лише на `pointer: coarse`.
 *
 * **Взаємодія:**
 *
 * - Скрол/свайп → snap до найближчого значення (`scroll-snap-mandatory`).
 * - Клавіатура (при фокусі): `↑`/`↓` ±1 крок, `Home`/`End` — межі.
 *
 * **A11y:** `role="spinbutton"` з `aria-valuemin/max/now/valuetext`,
 * `aria-label`. Ролики цифр `aria-hidden`. Поважає
 * `prefers-reduced-motion` (без плавного докручування).
 */
const meta: Meta<typeof WheelPicker> = {
  title: "UI / WheelPicker",
  component: WheelPicker,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: 120 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof WheelPicker>;

function GramsDemo() {
  const values = useMemo(() => {
    const out: number[] = [];
    for (let g = 5; g <= 500; g += 5) out.push(g);
    return out;
  }, []);
  const [value, setValue] = useState(100);
  return (
    <WheelPicker
      values={values}
      value={value}
      onChange={setValue}
      aria-label="Грами"
      formatValue={(g) => `${g} г`}
    />
  );
}

function RepsDemo() {
  const values = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);
  const [value, setValue] = useState(12);
  return (
    <WheelPicker
      values={values}
      value={value}
      onChange={setValue}
      aria-label="Повторення"
      visibleCount={5}
    />
  );
}

export const Grams: Story = { render: () => <GramsDemo /> };
export const Reps: Story = { render: () => <RepsDemo /> };
export const Disabled: Story = {
  render: () => (
    <WheelPicker
      values={[1, 2, 3, 4, 5]}
      value={3}
      onChange={() => {}}
      aria-label="Disabled"
      disabled
    />
  ),
};
