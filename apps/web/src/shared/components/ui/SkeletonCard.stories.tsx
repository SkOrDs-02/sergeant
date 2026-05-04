import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonCard, SkeletonList } from "./SkeletonCard";

/**
 * `SkeletonCard` / `SkeletonList` — preset placeholders для типових
 * patternів Sergeant: картка-блок (KPI, summary) та feed-список (HubChat
 * messages, transactions). Радіуси й відступи синхронізовані з `Card`,
 * тож перехід skeleton → real-content відчувається безшовним.
 *
 * **Коли застосовувати:**
 *
 * - Перший запит до `useQuery` (cache-miss): рендерь skeleton того ж
 *   shape, що й реальний контент. Layout shift = 0.
 * - Pull-to-refresh / Suspense fallback на старті екрану.
 *
 * **Коли НЕ застосовувати:** якщо ти знаєш точну висоту/форму
 * наперед і це лише inline-control — використовуй низькорівневий
 * {@link Skeleton} напряму.
 */
const meta: Meta<typeof SkeletonCard> = {
  title: "UI / SkeletonCard",
  component: SkeletonCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    lines: { control: { type: "number", min: 1, max: 8 } },
    header: { control: "boolean" },
    className: { control: "text" },
  },
  args: {
    lines: 3,
    header: true,
  },
};
export default meta;

type Story = StoryObj<typeof SkeletonCard>;

/** Default — 3 рядки + header-bar; типове KPI-замовлення. */
export const Default: Story = {};

/** Без header — лише body-text (наприклад, для preview-цитати). */
export const NoHeader: Story = {
  args: { header: false },
};

/** Довгий блок (5 рядків) — для контент-абзаців у роз’яснювальних картках. */
export const LongBlock: Story = {
  args: { lines: 5 },
};

/** SkeletonList — feed-роу з аватаром + 2 рядками тексту. */
export const ListPlaceholder: Story = {
  render: () => (
    <div className="w-96">
      <SkeletonList count={4} avatar />
    </div>
  ),
};

/** SkeletonList без аватарів — для plain-row списків (наприклад, transactions). */
export const ListWithoutAvatars: Story = {
  render: () => (
    <div className="w-96">
      <SkeletonList count={5} avatar={false} />
    </div>
  ),
};

/**
 * Кілька карт у grid — типовий патерн dashboard-у, коли всі модулі
 * завантажуються одночасно.
 */
export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} header={false} />
      <SkeletonCard lines={2} />
    </div>
  ),
};
