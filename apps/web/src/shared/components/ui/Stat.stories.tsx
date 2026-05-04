import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stat } from "./Stat";

/**
 * `Stat` — канонічний `eyebrow + big number + sublabel` triple, що повторюється
 * десятки разів у Fizruk-дашбордах та Finyk-summary-картах.
 *
 * `variant` тонує колір значення (text-text за замовчуванням, success / warning /
 * danger, плюс кожен з module-токенів finyk / fizruk / routine / nutrition).
 * Module-варіанти беруть `text-{c}-strong` (= `[700]`, lime-800 для nutrition),
 * щоб відповідати WCAG AA contrast на cream `bg-bg` — див.
 * `docs/design/brand-palette-wcag-aa-proposal.md`.
 *
 * `tabular-nums` гарантує, що числа з різним кратним 0/1/8 не "стрибають" по
 * ширині при анімації або swap-і значень.
 */
const meta: Meta<typeof Stat> = {
  title: "UI / Stat",
  component: Stat,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "success",
        "warning",
        "danger",
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
      ],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    align: { control: "select", options: ["left", "center", "right"] },
  },
  args: {
    label: "Вага",
    value: "82 кг",
    sublabel: "+0.4 кг за тиждень",
    variant: "default",
    size: "md",
  },
};
export default meta;

type Story = StoryObj<typeof Stat>;

/** Default — нейтральний `text-text` колір, sublabel з трендом. */
export const Default: Story = {};

/** Success — за тиждень -300 ккал від цілі. */
export const Success: Story = {
  args: {
    label: "Калорійність",
    value: "1 850",
    sublabel: "−150 від плану",
    variant: "success",
  },
};

/** Warning — наближаємось до budget-cap. */
export const Warning: Story = {
  args: {
    label: "Витрати",
    value: "₴ 18 230",
    sublabel: "92% бюджету",
    variant: "warning",
  },
};

/** Danger — over-budget / red flag. */
export const Danger: Story = {
  args: {
    label: "Овердрафт",
    value: "₴ 1 240",
    sublabel: "перевищено ліміт",
    variant: "danger",
  },
};

/** Із leading-emoji `icon` — швидка візуальна підказка модуля. */
export const WithIcon: Story = {
  args: {
    label: "Кроки",
    value: "11 240",
    sublabel: "+1.2k vs учора",
    icon: "🏃",
    variant: "fizruk",
  },
};

/** Усі 4 module-варіанти в один grid — для перевірки brand-токенів. */
export const ModuleVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6">
      <Stat
        label="Finyk · Бюджет"
        value="₴ 12 400"
        sublabel="на тиждень"
        variant="finyk"
      />
      <Stat
        label="Fizruk · Сила"
        value="92.5"
        sublabel="kg PR"
        variant="fizruk"
      />
      <Stat
        label="Routine · Streak"
        value="14 днів"
        sublabel="ранкова медитація"
        variant="routine"
      />
      <Stat
        label="Nutrition · Білки"
        value="142 г"
        sublabel="з 150 г"
        variant="nutrition"
      />
    </div>
  ),
};

/** Усі три розміри — sm (chips / dense rows) до lg (hero metric). */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <Stat label="Малий" value="42" sublabel="sm" size="sm" />
      <Stat label="Середній" value="142" sublabel="md" size="md" />
      <Stat label="Великий" value="1 042" sublabel="lg" size="lg" />
    </div>
  ),
};

/** Center-align — для full-width hero-stat-блоків. */
export const Centered: Story = {
  args: {
    label: "Сьогодні",
    value: "11 240 кроків",
    sublabel: "85% денної мети",
    align: "center",
    size: "lg",
    variant: "fizruk",
  },
};
