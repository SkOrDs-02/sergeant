import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChoiceGroup, type ChoiceGroupProps } from "./Choice";

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

function Stateful(props: Omit<ChoiceGroupProps, "value" | "onChange">) {
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
