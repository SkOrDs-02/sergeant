import type { Meta, StoryObj } from "@storybook/react-vite";
import { BackfillProgressPill } from "./BackfillProgressPill";

/**
 * `BackfillProgressPill` — live-стан Monobank backfill-джоба. Stories
 * покривають усі чотири `progress.status`: `idle` (нічого не рендериться),
 * `running` (progress-bar + лічильник), `completed` (зелена галочка),
 * `failed` (червоне !). Initiative 0007 Фаза 3 — module-level live-state
 * story для модуля Finyk.
 */
const meta: Meta<typeof BackfillProgressPill> = {
  title: "Finyk / BackfillProgressPill",
  component: BackfillProgressPill,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof BackfillProgressPill>;

const STARTED_AT = "2026-05-05T08:30:00.000Z";
const COMPLETED_AT = "2026-05-05T08:34:12.000Z";

/** Running mid-progress — 2 з 5 рахунків, ~40 %. */
export const Running: Story = {
  args: {
    progress: {
      status: "running",
      startedAt: STARTED_AT,
      completedAt: null,
      accountsTotal: 5,
      accountsProcessed: 2,
      currentAccountId: "acc-uah-default",
      transactionsProcessed: 1240,
      lastError: null,
    },
  },
};

/** Completed — фінальний счетчик транзакцій, без error. */
export const Completed: Story = {
  args: {
    progress: {
      status: "completed",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      accountsTotal: 5,
      accountsProcessed: 5,
      currentAccountId: null,
      transactionsProcessed: 3120,
      lastError: null,
    },
  },
};

/** Failed — truncated error message з Mono API. */
export const Failed: Story = {
  args: {
    progress: {
      status: "failed",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      accountsTotal: 5,
      accountsProcessed: 1,
      currentAccountId: null,
      transactionsProcessed: 320,
      lastError: "Mono API: 429 Too Many Requests",
    },
  },
};

/**
 * Idle — компонент повертає `null`, тож story рендерить порожній блок.
 * Лишений як референс, що `idle` не повинен показувати pill.
 */
export const Idle: Story = {
  args: {
    progress: {
      status: "idle",
      startedAt: null,
      completedAt: null,
      accountsTotal: 0,
      accountsProcessed: 0,
      currentAccountId: null,
      transactionsProcessed: 0,
      lastError: null,
    },
  },
};

/**
 * Transactions screen prefers a transient pill that disappears after the
 * job finishes. `keepAfterComplete=false` ховає completed-стан.
 */
export const TransientCompleted: Story = {
  args: {
    keepAfterComplete: false,
    progress: {
      status: "completed",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      accountsTotal: 3,
      accountsProcessed: 3,
      currentAccountId: null,
      transactionsProcessed: 980,
      lastError: null,
    },
  },
};
