import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CelebrationModal } from "./CelebrationModal";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * `CelebrationModal` — Модальне вікно для відзначення досягнень та успіхів.
 *
 * 6 типів: `achievement` / `goal` / `levelUp` / `streak` / `success` / `confetti`.
 * Автоматично генерує конфеті, анімації та відповідний стиль залежно від типу.
 * Підтримує 4 модульні теми (finyk / fizruk / routine / nutrition) + default.
 */

function ControlledDemo(props: React.ComponentProps<typeof CelebrationModal>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <Button onClick={() => setOpen(true)}>Відкрити модал</Button>
      <CelebrationModal {...props} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const meta: Meta<typeof CelebrationModal> = {
  title: "UI / CelebrationModal",
  component: CelebrationModal,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
  render: (args) => <ControlledDemo {...args} />,
  args: {
    title: "Вітаємо!",
    description: "Ти зробив щось чудове сьогодні.",
    actionLabel: "Чудово!",
    open: false,
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof CelebrationModal>;

export const Success: Story = {
  args: {
    type: "success",
    title: "Транзакцію збережено",
    description: "Витрату успішно додано до бюджету.",
  },
};

export const Achievement: Story = {
  args: {
    type: "achievement",
    title: "Нове досягнення!",
    description: "Ти витрачаєш менше, ніж заробляєш 3 місяці поспіль.",
    theme: "finyk",
    rewards: [
      { icon: <Icon name="zap" size={20} />, label: "+50 XP" },
      { icon: <span>🏆</span>, label: "Бейдж «Ощадливець»" },
    ],
  },
};

export const Streak: Story = {
  args: {
    type: "streak",
    title: "14 днів поспіль!",
    value: 14,
    unit: "днів",
    description: "Так тримати! Продовжуй свою серію.",
    theme: "routine",
  },
};

export const LevelUp: Story = {
  args: {
    type: "levelUp",
    title: "Рівень 5!",
    value: 5,
    unit: "рівень",
    description: "Ти стаєш сильнішим!",
    progress: { current: 120, max: 200 },
    theme: "fizruk",
    rewards: [{ icon: <span>⚡</span>, label: "+100 XP" }],
  },
};

export const Goal: Story = {
  args: {
    type: "goal",
    title: "Ціль досягнуто!",
    value: "10 000",
    unit: "грн",
    description: "Ти накопичив на відпустку!",
    theme: "finyk",
  },
};

export const Confetti: Story = {
  args: {
    type: "confetti",
    title: "Грандіозна перемога! 🎉",
    description: "Закінчив 30-денний челендж без пропусків.",
    confettiIntensity: "high",
    theme: "nutrition",
  },
};

export const NutritionTheme: Story = {
  args: {
    type: "goal",
    title: "Денна норма виконана",
    description: "2000 ккал та всі макроси в нормі.",
    theme: "nutrition",
    value: 2000,
    unit: "ккал",
  },
};
