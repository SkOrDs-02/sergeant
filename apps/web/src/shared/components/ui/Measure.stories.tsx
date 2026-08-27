/**
 * Last validated: 2026-08-06
 * Status: Active
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Measure } from "./Measure";
import { Money } from "./Money";

const meta: Meta<typeof Measure> = {
  title: "UI/Measure",
  component: Measure,
  parameters: {
    docs: {
      description: {
        component:
          "Типографіка виміру (анти-слоп П4 поза Фініком). Число домінує, " +
          "одиниця прислуговує. Тирів три, а не чотири: дробова частина " +
          "лишається повним кеглем, бо в вимірі вона важить — на відміну " +
          "від копійок у `Money`.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Measure>;

/** Пропорції тирів не змінюються з кеглем — розміри задані в `em`. */
export const Scale: Story = {
  render: () => (
    <div className="space-y-3 text-text">
      <div className="text-style-display">
        <Measure value={1840} unit="ккал" />
      </div>
      <div className="text-style-title">
        <Measure value={1840} unit="ккал" />
      </div>
      <div className="text-style-headline">
        <Measure value={1840} unit="ккал" />
      </div>
      <div className="text-style-body">
        <Measure value={1840} unit="ккал" />
      </div>
      <div className="text-style-caption">
        <Measure value={1840} unit="ккал" />
      </div>
    </div>
  ),
};

/** Одиниці, які реально живуть у продукті. */
export const Units: Story = {
  render: () => (
    <div className="text-style-headline text-text flex flex-wrap gap-6">
      <Measure value={1840} unit="ккал" />
      <Measure value={82.5} unit="кг" fractionDigits={1} />
      <Measure value={24} unit="г" />
      <Measure value={84} unit="%" />
      <Measure value={7.5} unit="год" fractionDigits={1} />
      <Measure value={12500} unit="кг×повт" />
    </div>
  ),
};

/**
 * Чому це не `<Money symbol="кг">`. Копійка — сота частка гривні, тож у
 * `Money` вона приглушена. 0,5 кг — пʼята частина 2,5 кг: демотувати її
 * означало б збрехати про величину.
 */
export const FractionRuleDiffers: Story = {
  render: () => (
    <div className="text-style-title text-text space-y-2">
      <div>
        <Money amount={2.5} kopecks />
        <span className="text-style-caption text-muted ml-3">
          копійки — окремий приглушений тир
        </span>
      </div>
      <div>
        <Measure value={2.5} unit="кг" fractionDigits={1} />
        <span className="text-style-caption text-muted ml-3">
          дріб виміру — повний кегль
        </span>
      </div>
    </div>
  ),
};

/** Знак: U+2212 однакової ширини з цифрою, тож стовпчик не зʼїжджає. */
export const SignedColumn: Story = {
  render: () => (
    <div className="text-style-headline text-text w-40 text-right space-y-1">
      <div>
        <Measure value={-2.5} unit="кг" fractionDigits={1} signed />
      </div>
      <div>
        <Measure value={0} unit="кг" fractionDigits={1} signed />
      </div>
      <div>
        <Measure value={1.2} unit="кг" fractionDigits={1} signed />
      </div>
    </div>
  ),
};

/**
 * `tone="inherit"` — для ЗАБАРВЛЕНОГО числа: тири беруть той самий колір
 * і гасяться прозорістю, а не вигадують власний приглушений відтінок.
 */
export const Tones: Story = {
  render: () => (
    <div className="text-style-headline flex flex-wrap gap-6">
      <span className="text-text">
        <Measure value={420} unit="ккал" />
      </span>
      <span className="text-nutrition-strong">
        <Measure value={420} unit="ккал" tone="inherit" />
      </span>
      <span className="text-danger-strong">
        <Measure value={-3.4} unit="кг" fractionDigits={1} tone="inherit" />
      </span>
    </div>
  ),
};

/**
 * Порожня одиниця — коли вона стоїть один раз на пару чисел. Тири й
 * `tabular-nums` потрібні обом, привида пробілу не лишається.
 */
export const SharedUnit: Story = {
  render: () => (
    <div className="text-style-headline text-text">
      <Measure value={1240} unit="" /> / <Measure value={1840} unit="ккал" />
    </div>
  ),
};
