/**
 * Last validated: 2026-08-05
 * Status: Active
 */
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Money, Delta } from "./Money";

const meta: Meta<typeof Money> = {
  title: "UI/Money",
  component: Money,
  parameters: {
    docs: {
      description: {
        component:
          "Типографіка чисел (анти-слоп П4). Сума домінує; знак, копійки й " +
          "символ — окремі приглушені тири. Розміри в `em`, тож компонент " +
          "успадковує кегль від контейнера.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Money>;

/** Той самий компонент у всіх кеглях — пропорції тирів не змінюються. */
export const Scale: Story = {
  render: () => (
    <div className="space-y-3 text-text">
      <div className="text-style-display">
        <Money amount={12480} />
      </div>
      <div className="text-style-title">
        <Money amount={12480} />
      </div>
      <div className="text-style-headline">
        <Money amount={12480} />
      </div>
      <div className="text-style-body">
        <Money amount={12480} />
      </div>
      <div className="text-style-caption">
        <Money amount={12480} />
      </div>
    </div>
  ),
};

/** Копійки окремим тиром — гривні лишаються домінантою. */
export const Kopecks: Story = {
  render: () => (
    <div className="space-y-2 text-style-title text-text">
      <div>
        <Money amount={1250.5} />
        <span className="text-style-caption text-muted ml-3">без копійок</span>
      </div>
      <div>
        <Money amount={1250.5} kopecks />
        <span className="text-style-caption text-muted ml-3">з копійками</span>
      </div>
    </div>
  ),
};

/**
 * Головний аргумент за `tabular-nums` і справжній U+2212: у стовпчику
 * розряди стоять один під одним, а рядки зі знаком не зʼїжджають.
 */
export const Column: Story = {
  render: () => (
    <div className="text-style-headline text-text inline-flex flex-col items-end gap-1">
      {[1250.5, -89413, 7, -340.25, 12480, -5].map((v) => (
        <Money key={v} amount={v} kopecks />
      ))}
    </div>
  ),
};

/** На забарвленому числі тири беруть його ж колір, а не власний. */
export const Tones: Story = {
  render: () => (
    <div className="space-y-2 text-style-title">
      <div className="text-text">
        <Money amount={4261} />
        <span className="text-style-caption text-muted ml-3">
          tone=&quot;muted&quot; (дефолт)
        </span>
      </div>
      <div className="text-success-strong dark:text-success">
        <Money amount={4261} signed tone="inherit" />
        <span className="text-style-caption text-muted ml-3">
          tone=&quot;inherit&quot;
        </span>
      </div>
      <div className="text-danger">
        <Money amount={-4261} tone="inherit" />
        <span className="text-style-caption text-muted ml-3">
          tone=&quot;inherit&quot;
        </span>
      </div>
    </div>
  ),
};

/**
 * Дельта як типографіка, а не бейдж. Колір задає ВИКЛИКАЧ через
 * `polarity`: `+340 ₴` доходу — успіх, `+340 ₴` витрат — ні.
 */
export const Deltas: Story = {
  render: () => (
    <div className="space-y-2 text-style-headline">
      <div>
        <Delta value={340} polarity="positive" />
        <span className="text-style-caption text-muted ml-3">
          дохід виріс — добре
        </span>
      </div>
      <div>
        <Delta value={340} polarity="negative" />
        <span className="text-style-caption text-muted ml-3">
          витрати виросли — погано
        </span>
      </div>
      <div>
        <Delta value={-12} polarity="negative" symbol="%" />
        <span className="text-style-caption text-muted ml-3">
          витрати впали — добре
        </span>
      </div>
      <div>
        <Delta value={0} polarity="positive" />
        <span className="text-style-caption text-muted ml-3">
          нуль нейтральний
        </span>
      </div>
    </div>
  ),
};
