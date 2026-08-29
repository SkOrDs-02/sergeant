import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportReminderBanner } from "./ImportReminderBanner";

/**
 * `ImportReminderBanner` — плашка «залий документи» (спека
 * `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * Stories покривають обидва типи документа, які журналить
 * `import_batches` (`IMPORT_SOURCES` = виписка + скрін банкінгу), і
 * граничний випадок щільного ритму, де поріг спрацьовує на 15-й день, а
 * не на 38-й: число в заголовку залежить від ВЛАСНОГО ритму людини, і
 * story це показує, а не приховує за одним «типовим» прикладом.
 */
const meta: Meta<typeof ImportReminderBanner> = {
  title: "Finyk / ImportReminderBanner",
  component: ImportReminderBanner,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ImportReminderBanner>;

/** Місячний ритм, 38 днів тиші — канонічний випадок зі спеки. */
export const Statement: Story = {
  args: {
    source: "bank_statement",
    daysSince: 38,
    expectedIntervalDays: 30,
  },
};

/** Скрін банкінгу: та сама механіка, інша назва документа. */
export const Screenshot: Story = {
  args: {
    source: "bank_screenshot",
    daysSince: 41,
    expectedIntervalDays: 30,
  },
};

/** Тижневий ритм: поріг 14 днів, тож 15 днів уже привід. */
export const WeeklyRhythm: Story = {
  args: {
    source: "bank_statement",
    daysSince: 15,
    expectedIntervalDays: 7,
  },
};

/**
 * Невідомий тип документа не рендериться взагалі. Порожній заголовок
 * гірший за відсутність плашки: він нічого не каже, але вчить її
 * ігнорувати.
 */
export const UnknownSourceRendersNothing: Story = {
  args: {
    source: "receipt_batch",
    daysSince: 90,
    expectedIntervalDays: 30,
  },
};
