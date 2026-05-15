import type { Meta, StoryObj } from "@storybook/react-vite";
import { InsightCard } from "./InsightCard";

/**
 * `InsightCard` — AI push-card з конкретною пропозицією. Show-once-per-day,
 * dismissible. Введений у Sergeant v2 редизайн (PR-7a / 2026-05).
 *
 * Dismissal tracked у localStorage через `useInsightDismissal()` hook
 * під namespace `sergeant.v2.insights.dismissed`. Cross-tab sync через
 * `storage` events.
 *
 * **Token discipline:** `bg-ink-strong` + `text-bg-base` semantic tokens
 * inverts по темах (light=emerald-900 / dark=white / HC=#000-#fff).
 */
const meta: Meta<typeof InsightCard> = {
  title: "UI / InsightCard (v2 redesign)",
  component: InsightCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    id: { control: "text" },
    title: { control: "text" },
    subtitle: { control: "text" },
    ctaLabel: { control: "text" },
  },
  args: {
    id: "demo-insight",
    title: "Витрати на каву ↑ 34%",
    subtitle: "Встановити ліміт?",
    ctaLabel: "→",
    onActivate: () => console.log("activate"),
    onDismiss: () => console.log("dismiss"),
  },
};
export default meta;

type Story = StoryObj<typeof InsightCard>;

/** Default coffee-overspend insight. */
export const CoffeeLimit: Story = {};

/** Routine streak record insight — coral/red domain but visual stays ink. */
export const RoutineStreak: Story = {
  args: {
    id: "demo-routine-streak",
    title: "До рекорду стріку — 1 день",
    subtitle: "Відмітити сьогоднішні звички?",
  },
};

/** Nutrition protein-low evening reminder. */
export const NutritionProteinLow: Story = {
  args: {
    id: "demo-nutrition-protein",
    title: "Білку за день: 42 г з 80 г",
    subtitle: "Додати білковий перекус на вечір?",
  },
};

/** Fizruk rest-day overdue. */
export const FizrukRestOverdue: Story = {
  args: {
    id: "demo-fizruk-rest",
    title: "3 дні без тренування",
    subtitle: "Запланувати легке відновлення?",
  },
};

/** Custom CTA label — use → / + / arrow.right based on action semantic. */
export const CustomCta: Story = {
  args: {
    id: "demo-custom-cta",
    title: "Розпізнано рекурентний платіж",
    subtitle: "Зробити підписку?",
    ctaLabel: "+",
  },
};
