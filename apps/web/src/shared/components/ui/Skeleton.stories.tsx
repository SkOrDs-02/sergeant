import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton, SkeletonText } from "./Skeleton";

/**
 * `Skeleton` / `SkeletonText` — низькорівневі загрузчики, що зберігають
 * розмітку місце контенту що приходить.
 *
 * - `motion-safe:animate-pulse` — респектує `prefers-reduced-motion: reduce`.
 * - `shimmer` — преміум-альтернатива для довгих списків (1.6s sweep). Рендерить
 *   gradient overlay і потребує `motion-safe:animate-shimmer`.
 * - Висота-/ширина-классы передаються через `className` — Skeleton не
 *   диктує форму; це робить host-компонент (е.g. SkeletonCard, SkeletonText).
 */
const meta: Meta<typeof Skeleton> = {
  title: "UI / Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    shimmer: { control: "boolean" },
    className: { control: "text" },
  },
  args: {
    className: "h-12 w-64",
    shimmer: false,
  },
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Pulse: Story = {};

export const Shimmer: Story = {
  args: { shimmer: true },
};

/**
 * Текстовий skeleton кращий для контенту-абзаців: низько-висока
 * висота (`h-3`) і trailing-row на 60% ширини імітує
 * "останній рядок параграфа" — користувач відчуває обсяг.
 */
export const TextLines: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-80">
      <SkeletonText className="w-full" />
      <SkeletonText className="w-11/12" />
      <SkeletonText className="w-3/5" />
    </div>
  ),
};

/** Картка-плейсхолдер: avatar + 2 рядки тексту. */
export const CardPlaceholder: Story = {
  render: () => (
    <div className="bg-panel rounded-2xl p-4 flex items-start gap-3 w-80">
      <Skeleton className="h-12 w-12 rounded-full shrink-0" />
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <SkeletonText className="w-3/4" />
        <SkeletonText className="w-1/2" />
      </div>
    </div>
  ),
};

/** Список рядків зі staggered animation-delay для відчуття "хвилі". */
export const StaggeredList: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-80">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-10 w-full"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  ),
};
