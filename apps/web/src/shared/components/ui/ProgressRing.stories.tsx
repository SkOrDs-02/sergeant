import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressRing } from "./ProgressRing";

/**
 * `ProgressRing` — radial progress (SVG `stroke-dasharray`). Використовується
 * у KPI-картках усіх 4 модулів: Routine streaks, Fizruk goals, Nutrition
 * macro rings, Finyk budget burn-down.
 *
 * **API:**
 *
 * - `value` (0..`max`) — progress-значення; clamp-ається.
 * - `max` (default 100) — верхня межа.
 * - `size` — `xs` 32 / `sm` 48 / `md` 72 / `lg` 96 / `xl` 128 px.
 * - `variant` — semantic-token, мапиться на `text-*` колір.
 * - `label` — кастомний центрований ReactNode (інакше — `NN%`).
 *
 * **A11y:** елемент `role="progressbar"` з повним набором ARIA-атрибутів.
 * Якщо `aria-label` не передано — fallback "NN%" або "value / max".
 * `motion-safe:transition-all` на дузі — респектує
 * `prefers-reduced-motion`.
 */
const meta: Meta<typeof ProgressRing> = {
  title: "UI / ProgressRing",
  component: ProgressRing,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "number", min: 0, max: 100 } },
    max: { control: { type: "number", min: 1 } },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg", "xl"],
    },
    variant: {
      control: "select",
      options: [
        "accent",
        "success",
        "warning",
        "danger",
        "info",
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
      ],
    },
    showPercent: { control: "boolean" },
  },
  args: {
    value: 65,
    max: 100,
    size: "md",
    variant: "accent",
    showPercent: true,
  },
};
export default meta;

type Story = StoryObj<typeof ProgressRing>;

/** Default — 65% accent, `md` (72px). */
export const Default: Story = {};

/** 100% completed — повна дуга, для goal-met станів. */
export const Complete: Story = {
  args: { value: 100, variant: "success" },
};

/**
 * Розміри `xs..xl` поряд — `xs` для inline-table, `xl` для головного KPI
 * на dashboard-екрані.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-1">
          <ProgressRing value={65} size={size} variant="accent" />
          <span className="text-xs text-muted">{size}</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * Module-варіанти: кожен з 4 ринків Sergeant має власний accent-колір,
 * тож KPI-каблиця візуально належить своєму модулю.
 */
export const ModuleVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {(["finyk", "fizruk", "routine", "nutrition"] as const).map((variant) => (
        <div key={variant} className="flex flex-col items-center gap-1">
          <ProgressRing value={72} variant={variant} size="lg" />
          <span className="text-xs text-muted">{variant}</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * Custom label — для не-percent-метрик (kcal, kg, грн), де `value/max` має
 * сенс в одиницях, а не у відсотках.
 */
export const CustomLabel: Story = {
  args: {
    value: 1850,
    max: 2200,
    variant: "nutrition",
    size: "lg",
    label: (
      <div className="flex flex-col items-center leading-tight">
        <span className="text-style-title">1850</span>
        <span className="text-2xs text-muted">/ 2200 ккал</span>
      </div>
    ),
  },
};

/** Status-семантика — danger коли user перевищив бюджет. */
export const Danger: Story = {
  args: { value: 102, max: 100, variant: "danger" },
};

/** Без видимого label — тільки візуальна дуга (текст приховано). */
export const HiddenLabel: Story = {
  args: { value: 40, showPercent: false, "aria-label": "40 з 100" },
};
