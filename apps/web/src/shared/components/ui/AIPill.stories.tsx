import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { AIPill } from "./AIPill";

/**
 * `AIPill` — persistent AI affordance що сидить над bottom-nav.
 *
 * Введений у Sergeant v2 редизайн (PR-7a / 2026-05). Це pull-surface
 * для chat: primary tap → /chat, mic → voice input. Контекстний
 * placeholder per module (`finyk` → "Запитай про витрати…", тощо).
 *
 * **A11y note:** outer контейнер це `<div role="group">`, а primary
 * + mic — two sibling `<button>` elements. Не nested-buttons.
 */
const meta: Meta<typeof AIPill> = {
  title: "UI / AIPill (v2 redesign)",
  component: AIPill,
  // Wrap у MemoryRouter, бо AIPill уживає useNavigate. Centered layout
  // не підходить для fixed-position pill — використовуємо `fullscreen`.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="h-dvh bg-mesh relative">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  tags: ["autodocs"],
  argTypes: {
    module: {
      control: "select",
      options: [null, "finyk", "fizruk", "routine", "nutrition"],
    },
    placeholder: { control: "text" },
    bottom: { control: "number" },
  },
  args: {
    module: null,
    bottom: 96,
  },
};
export default meta;

type Story = StoryObj<typeof AIPill>;

/** Hub level (no module accent) — default placeholder "Запитай Sergeant…". */
export const Hub: Story = {};

/** Finyk context — placeholder "Запитай про витрати…". */
export const Finyk: Story = { args: { module: "finyk" } };

/** Fizruk context — placeholder "Що сьогодні робити?". */
export const Fizruk: Story = { args: { module: "fizruk" } };

/** Routine context — placeholder "Запитай про звички…". */
export const Routine: Story = { args: { module: "routine" } };

/** Nutrition context — placeholder "Що приготувати?". */
export const Nutrition: Story = { args: { module: "nutrition" } };

/** Custom placeholder override — caller may force a specific copy. */
export const CustomPlaceholder: Story = {
  args: { placeholder: "Як зменшити витрати на каву?" },
};

/** Above ModuleBottomNav offset — pill sits at `bottom: 84` to clear the 60 px nav. */
export const ModulePosition: Story = {
  args: { module: "finyk", bottom: 84 },
};
