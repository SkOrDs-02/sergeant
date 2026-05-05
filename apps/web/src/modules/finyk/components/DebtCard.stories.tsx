import type { Meta, StoryObj } from "@storybook/react-vite";
import { DebtCard } from "./DebtCard";

/**
 * `DebtCard` — chunk-сурфейс для одного боргу або заборгованості. Stories
 * покривають payable / receivable, due-date варіанти (`сьогодні` / `завтра`
 * / прострочено), частково сплачений стан і `showBalance=false` privacy
 * mode. Initiative 0007 Фаза 3 — module-level `*Card` story для модуля
 * Finyk.
 */
const meta: Meta<typeof DebtCard> = {
  title: "Finyk / DebtCard",
  component: DebtCard,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    name: "Кредит у мами",
    emoji: "🏦",
    remaining: 3500,
    paid: 1500,
    total: 5000,
    showBalance: true,
  },
};
export default meta;

type Story = StoryObj<typeof DebtCard>;

/** Звичайний борг з частковою сплатою (30 %). */
export const Default: Story = {};

/** Борг повністю сплачений — прогрес-бар на 100 %. */
export const PaidOff: Story = {
  args: {
    name: "Підписка повернута",
    emoji: "💳",
    remaining: 0,
    paid: 1200,
    total: 1200,
  },
};

/** Receivable — гроші, які мають повернути нам (зелений баланс). */
export const Receivable: Story = {
  args: {
    name: "Брат",
    emoji: "👨",
    remaining: 800,
    paid: 200,
    total: 1000,
    isReceivable: true,
  },
};

/** Прострочений борг — due-date у минулому, попередження червоне. */
export const Overdue: Story = {
  args: {
    name: "Розстрочка iPhone",
    emoji: "📱",
    remaining: 4200,
    paid: 800,
    total: 5000,
    dueDate: "2026-04-20",
  },
};

/** Due-date на сьогодні — м'який ринок, без червоного попередження. */
export const DueToday: Story = {
  args: {
    name: "Оренда",
    emoji: "🏠",
    remaining: 8000,
    paid: 0,
    total: 8000,
    dueDate: new Date().toISOString().slice(0, 10),
  },
};

/** Privacy-mode: `showBalance=false` маскує суми, прогрес-бар лишається. */
export const HiddenBalance: Story = {
  args: {
    showBalance: false,
  },
};

/** З CTA «прив'язати транзакції» — render-only, обробник нічого не робить. */
export const WithLinkAction: Story = {
  args: {
    onLink: () => {},
    linkedCount: 3,
  },
};

/** З CTA «видалити» — render-only, обробник нічого не робить. */
export const WithDeleteAction: Story = {
  args: {
    onDelete: () => {},
  },
};
