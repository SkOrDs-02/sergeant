import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateScrubber } from "./DateScrubber";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * `DateScrubber` (UI-12) — горизонтальна стрічка великих (≥44px) day-таргетів
 * для швидкого вибору недавньої дати без відкриття системного date-sheet.
 *
 * Замінює патерн «тапни native `type=date`» для найчастішого кейсу — запис
 * події за останні днів 10-14. Уся арифметика дат іде через Kyiv-time
 * хелпери (`getKyivDayKey` / `getKyivDateParts`), тому межі днів збігаються з
 * рештою застосунку незалежно від годинника пристрою.
 *
 * Value in / value out: `value` — Kyiv day-key `YYYY-MM-DD`, `onChange`
 * повертає обраний ключ. Хост володіє станом (RHF / draft-reducer / local).
 */
const meta: Meta<typeof DateScrubber> = {
  title: "UI / DateScrubber",
  component: DateScrubber,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    days: { control: { type: "number", min: 3, max: 30 } },
  },
  args: {
    days: 14,
  },
};
export default meta;

type Story = StoryObj<typeof DateScrubber>;

function Controlled({ days = 14 }: { days?: number }) {
  const [value, setValue] = useState(getKyivDayKey());
  return (
    <div className="max-w-sm">
      <DateScrubber value={value} onChange={setValue} days={days} />
      <p className="mt-3 text-style-caption text-muted">
        Обрано: <span className="tabular-nums text-text">{value}</span>
      </p>
    </div>
  );
}

export const Default: Story = {
  render: (args) => <Controlled days={args.days ?? 14} />,
};

export const ShortWindow: Story = {
  name: "7 днів",
  render: () => <Controlled days={7} />,
};
