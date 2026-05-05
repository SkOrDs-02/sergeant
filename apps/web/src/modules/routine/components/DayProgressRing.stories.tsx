import type { Meta, StoryObj } from "@storybook/react-vite";
import { DayProgressRing } from "./DayProgressRing";

/**
 * `DayProgressRing` — кругова прогрес-діаграма для habits-дня (готово /
 * заплановано). Stories покривають порожній / частковий / повний / over-
 * achieved cases, плюс «без розкладу» (scheduled = 0 → ratio = 0).
 * Initiative 0007 Phase 3, module-level story для модуля Routine.
 */
const meta: Meta<typeof DayProgressRing> = {
  title: "Routine / DayProgressRing",
  component: DayProgressRing,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    completed: 3,
    scheduled: 5,
  },
};
export default meta;

type Story = StoryObj<typeof DayProgressRing>;

/** 60% дня виконано (3 із 5 звичок). */
export const Default: Story = {};

/** Старт дня — 0 із 5 виконано, обідок майже невидимий. */
export const Empty: Story = {
  args: { completed: 0, scheduled: 5 },
};

/** Повний день — кільце замикається, 100% виконано. */
export const Complete: Story = {
  args: { completed: 5, scheduled: 5 },
};

/** Без розкладу — scheduled = 0, ratio = 0, ring видимий лише як трек. */
export const NoSchedule: Story = {
  args: { completed: 0, scheduled: 0 },
};

/** З CTA — кнопка з aria-label «Тапни для денного звіту». */
export const WithClick: Story = {
  args: {
    completed: 4,
    scheduled: 5,
    onClick: () => {},
  },
};
