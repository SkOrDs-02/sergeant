import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Segmented, type SegmentedProps } from "./Segmented";

/**
 * `Segmented` — pill-style segmented control для mode/tab перемикання
 * усередині сторінки. Консолідує drift між Fizruk Workouts (solid
 * module-fill tabs) та Routine calendar time-mode chips (soft tinted chips).
 *
 * Three-axis API:
 *   - `variant` — accent колір (`brand` за замовчуванням; чотири module-токени
 *                 скоупують активний стан до конкретного модуля).
 *   - `style`   — візуальне трактування активного chip-а:
 *                 - `solid` — інвертований ink («Чорнило» v3.1 § 6):
 *                   `bg-ink text-bg` (theme-aware — dark #e7f0ea/#14100e,
 *                   light дзеркально), бордер тримає module-акцент.
 *                 - `soft`  — `bg-{c}-soft` + accent-border + `text-{c}-strong`,
 *                   більш subtle treatment для filtering chips.
 *
 *   - `layout`  — геометрія ряду: `pill` (за замовчуванням, чипи по
 *                 ширині підпису) або `bar` (одна повноширинна доріжка).
 *
 * `layout="bar"` не заміняє `<SubTabs>`: той компонент — навігація між
 * вьюхами сторінки, а це контрол усередині екрана. Hapticи на iOS/Android викликаються через `hapticTap()`
 * adapter тільки при зміні значення (не на повторному кліку).
 */
const meta: Meta<typeof Segmented> = {
  title: "UI / Segmented",
  component: Segmented,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    style: { control: "select", options: ["solid", "soft"] },
    size: { control: "select", options: ["sm", "md"] },
    layout: { control: "select", options: ["pill", "bar"] },
    variant: {
      control: "select",
      options: ["brand", "fizruk", "routine", "nutrition", "finyk"],
    },
  },
  args: {
    style: "soft",
    size: "md",
    layout: "pill",
    variant: "brand",
  },
};
export default meta;

type Story = StoryObj<typeof Segmented>;

const items = [
  { value: "day", label: "День" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
] as const;

function ControlledDemo(
  props: Omit<SegmentedProps<string>, "items" | "value" | "onChange">,
) {
  const [value, setValue] = useState<string>("week");
  return (
    <Segmented
      {...props}
      items={items}
      value={value}
      onChange={setValue}
      ariaLabel="Період"
    />
  );
}

/** Default — `soft` style + `brand` variant. */
export const Default: Story = {
  render: (args) => <ControlledDemo {...args} />,
};

/** `solid` style — filled accent для primary mode-tabs (Fizruk Workouts). */
export const Solid: Story = {
  args: { style: "solid" },
  render: (args) => <ControlledDemo {...args} />,
};

/**
 * `bar` layout — одна повноширинна доріжка з рівних сегментів. Для короткого
 * фіксованого набору взаємовиключних опцій, який перемикають часто: ширина
 * не стрибає від довжини підпису, і ряд читається як ОДИН контрол. Довгий
 * чи відкритий набір лишається `pill`.
 */
export const Bar: Story = {
  args: { layout: "bar" },
  render: (args) => (
    <div className="w-[360px]">
      <ControlledDemo {...args} />
    </div>
  ),
};

/** `sm` size — менший touch-target (36 px) для compact filters. */
export const Small: Story = {
  args: { size: "sm" },
  render: (args) => <ControlledDemo {...args} />,
};

/** Усі 5 module-варіантів у `soft`-style — для перевірки brand-токенів. */
export const ModuleVariantsSoft: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <ControlledDemo variant="brand" />
      <ControlledDemo variant="fizruk" />
      <ControlledDemo variant="routine" />
      <ControlledDemo variant="nutrition" />
      <ControlledDemo variant="finyk" />
    </div>
  ),
};

/** Усі 5 module-варіантів у `solid`-style — для perf-тесту contrast. */
export const ModuleVariantsSolid: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <ControlledDemo variant="brand" style="solid" />
      <ControlledDemo variant="fizruk" style="solid" />
      <ControlledDemo variant="routine" style="solid" />
      <ControlledDemo variant="nutrition" style="solid" />
      <ControlledDemo variant="finyk" style="solid" />
    </div>
  ),
};
