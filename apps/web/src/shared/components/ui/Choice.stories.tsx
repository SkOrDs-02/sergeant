import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ChoiceCheckbox,
  ChoiceGroup,
  type ChoiceGroupSingleProps,
} from "./Choice";

/**
 * `ChoiceGroup` - один прийом «обрано» для всіх виборів форм (v3.1):
 * обране заливкою чорнилом, необране на панелі (`tiles`) або на hairline
 * (`rows`). Стан передає `aria-checked`, клавіатура за патерном radiogroup.
 */
const meta: Meta<typeof ChoiceGroup> = {
  title: "UI / ChoiceGroup",
  component: ChoiceGroup,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ChoiceGroup>;

function Stateful(
  props: Omit<ChoiceGroupSingleProps, "value" | "onChange" | "multiple">,
) {
  const [value, setValue] = useState<string | null>(
    props.items[0]?.value ?? null,
  );
  return <ChoiceGroup {...props} value={value} onChange={setValue} />;
}

export const Tiles: Story = {
  render: () => (
    <Stateful
      ariaLabel="Тип операції"
      className="grid grid-cols-2"
      items={[
        { value: "expense", label: "Витрата" },
        { value: "income", label: "Надходження" },
      ]}
    />
  ),
};

export const SmallTiles: Story = {
  render: () => (
    <Stateful
      ariaLabel="Самопочуття"
      size="sm"
      items={["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }))}
    />
  ),
};

function DeselectableScale() {
  const [value, setValue] = useState<string | null>("3");
  return (
    <ChoiceGroup
      ariaLabel="Енергія"
      size="sm"
      className="grid grid-cols-5"
      value={value}
      onChange={setValue}
      onDeselect={() => setValue(null)}
      items={["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }))}
    />
  );
}

/** Повторний тап по обраній оцінці знімає її (`onDeselect`). */
export const Deselectable: Story = {
  render: () => <DeselectableScale />,
};

export const Rows: Story = {
  render: () => (
    <Stateful
      variant="rows"
      ariaLabel="Регулярність"
      items={[
        { value: "daily", label: "Щодня" },
        { value: "weekdays", label: "Будні", description: "Пн-Пт" },
        { value: "weekly", label: "Раз на тиждень" },
        { value: "custom", label: "Свої дні", description: "Обери дні нижче" },
      ]}
    />
  ),
};

const PRODUCTS = [
  { value: "milk", label: "Молоко", description: "2 л" },
  { value: "eggs", label: "Яйця", description: "10 шт" },
  { value: "bread", label: "Хліб", description: "1 шт" },
];

function MultiStateful({ variant }: { variant: "tiles" | "rows" }) {
  const [value, setValue] = useState<string[]>(["milk", "eggs"]);
  return (
    <ChoiceGroup
      multiple
      variant={variant}
      ariaLabel="Що додати в комору"
      items={PRODUCTS}
      value={value}
      onChange={setValue}
    />
  );
}

export const MultipleTiles: Story = {
  render: () => <MultiStateful variant="tiles" />,
};

export const MultipleRows: Story = {
  render: () => <MultiStateful variant="rows" />,
};

function CheckboxStateful() {
  const [checked, setChecked] = useState(true);
  return (
    <ChoiceCheckbox
      checked={checked}
      onChange={setChecked}
      label="Запамʼятати для повтору"
      description="Зʼявиться в «Повторити» на наступний прийом"
    />
  );
}

export const Checkbox: Story = {
  render: () => <CheckboxStateful />,
};
