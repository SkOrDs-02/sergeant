import type { Meta, StoryObj } from "@storybook/react-vite";
import { FloatingActionButton } from "./FloatingActionButton";

/**
 * `FloatingActionButton` (FAB) — material-style фіксована кнопка з
 * можливим fan-меню. Stories покривають варіанти модулів, розміри,
 * extended label, position варіанти. Render-only — обробники нічого
 * не роблять. Initiative 0007 Phase 2 — shared/ui story.
 *
 * Sandbox-обгортка `relative h-[420px]` потрібна, бо FAB використовує
 * `position: fixed` — у Storybook frame це ламає layout без manual
 * containment.
 */
const meta: Meta<typeof FloatingActionButton> = {
  title: "Shared / FloatingActionButton",
  component: FloatingActionButton,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="relative min-h-[420px] w-full bg-bg p-6">
        <p className="text-sm text-muted">
          Прикладова поверхня модуля. FAB рендериться `position: fixed` —
          координати breakpoint-залежні.
        </p>
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    icon: "plus",
    onClick: () => {},
    "aria-label": "Додати",
  },
};
export default meta;

type Story = StoryObj<typeof FloatingActionButton>;

/** Дефолтний brand-FAB справа знизу. */
export const Default: Story = {};

/** Module-tinted: Finyk → finyk-strong + tint shadow. */
export const FinykVariant: Story = {
  args: {
    variant: "finyk",
    "aria-label": "Додати транзакцію",
  },
};

/** Великий розмір (`lg` = 64px). */
export const Large: Story = {
  args: { size: "lg" },
};

/** Extended label — текст поряд із іконкою. */
export const ExtendedLabel: Story = {
  args: {
    label: "Нова транзакція",
    variant: "finyk",
  },
};

/** Зліва знизу — `bottom-left` варіант. */
export const BottomLeft: Story = {
  args: {
    position: "bottom-left",
  },
};

/** Багато actions — fan-menu (render-only, click не відкриває menu). */
export const WithActions: Story = {
  args: {
    actions: [
      {
        id: "expense",
        icon: "wallet",
        label: "Витрата",
        onClick: () => {},
      },
      {
        id: "income",
        icon: "trending-up",
        label: "Дохід",
        onClick: () => {},
      },
      { id: "note", icon: "edit", label: "Нотатка", onClick: () => {} },
    ],
  },
};
