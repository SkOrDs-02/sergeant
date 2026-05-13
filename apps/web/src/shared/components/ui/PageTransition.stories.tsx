import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PageTransition } from "./PageTransition";
import { Button } from "./Button";
import type { TransitionDirection } from "./PageTransition";

/**
 * `PageTransition` — Обгортка для анімації між сторінками/вмістом.
 *
 * При зміні `pageKey` поточний вміст вилітає (exit animation), а новий
 * влітає (enter animation). Поважає `prefers-reduced-motion`.
 */

const PAGES = ["Сторінка A", "Сторінка B", "Сторінка C"];

function Demo({ direction }: { direction: TransitionDirection }) {
  const [index, setIndex] = useState(0);
  return (
    <div className="flex flex-col gap-4 items-center w-72">
      <PageTransition pageKey={String(index)} direction={direction}>
        <div className="w-72 h-32 bg-panel border border-line rounded-2xl flex items-center justify-center">
          <span className="text-style-title text-text">
            {PAGES[index % PAGES.length]}
          </span>
        </div>
      </PageTransition>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ← Назад
        </Button>
        <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
          Вперед →
        </Button>
      </div>
    </div>
  );
}

const meta: Meta<typeof PageTransition> = {
  title: "UI / PageTransition",
  component: PageTransition,
  parameters: {
    layout: "centered",
    chromatic: { disableSnapshot: true },
  },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof PageTransition>;

export const Forward: Story = {
  render: () => <Demo direction="forward" />,
};

export const Backward: Story = {
  render: () => <Demo direction="backward" />,
};

export const SlideUp: Story = {
  render: () => <Demo direction="up" />,
};

export const SlideDown: Story = {
  render: () => <Demo direction="down" />,
};

export const Fade: Story = {
  render: () => <Demo direction="fade" />,
};
