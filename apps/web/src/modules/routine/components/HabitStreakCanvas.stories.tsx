import type { Meta, StoryObj } from "@storybook/react-vite";
import type { HabitSkip } from "@sergeant/routine-domain";
import { HabitStreakCanvas } from "./HabitStreakCanvas";
import type { Habit } from "../lib/types";

/**
 * `HabitStreakCanvas` — полотно серії, де кожен день має свій тип
 * (канон `routine.md` §4/§5): виконано / не зміг з причиною / мовчазний
 * пропуск прощений заморозкою / планована пауза / не за розкладом. Дані
 * рахує `flexibleStreakBreakdown` (`packages/routine-domain`) — сторі лише
 * підбирають фікстури, що проганяють усі пʼять станів.
 */
const meta: Meta<typeof HabitStreakCanvas> = {
  title: "Routine / HabitStreakCanvas",
  component: HabitStreakCanvas,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof HabitStreakCanvas>;

const TODAY = "2026-08-02"; // неділя

const weekdaysHabit: Habit = {
  id: "h1",
  name: "Ранкова зарядка",
  recurrence: "weekdays",
  startDate: "2026-07-01",
  pauseIntervals: [{ from: "2026-07-22", to: "2026-07-22" }],
};

const mixedCompletions = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-23",
  "2026-07-27",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];
const mixedSkips: Record<string, HabitSkip> = {
  "2026-07-24": { reason: "busy", at: "2026-07-24T09:00:00.000Z" },
};

/** Усі пʼять станів (+ сьогоднішній `pending`) в одному вікні. */
export const AllStates: Story = {
  args: {
    habit: weekdaysHabit,
    completions: mixedCompletions,
    skips: mixedSkips,
    todayKey: TODAY,
  },
};

/** Проста суцільна серія без мʼяких днів — лише «виконано». */
export const CleanStreak: Story = {
  args: {
    habit: { ...weekdaysHabit, pauseIntervals: undefined },
    completions: [
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ],
    skips: undefined,
    todayKey: TODAY,
  },
};

/** Нова звичка без жодної відмітки — дружній empty-state. */
export const NoHistoryYet: Story = {
  args: {
    habit: weekdaysHabit,
    completions: [],
    skips: undefined,
    todayKey: TODAY,
  },
};
