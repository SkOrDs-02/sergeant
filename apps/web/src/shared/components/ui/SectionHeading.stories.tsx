import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionHeading } from "./SectionHeading";

/**
 * `SectionHeading` — канонічний eyebrow / heading-компонент: 6 розмірів
 * (`2xs`–`xl`) × 8 варіантів кольору × 5 weight-токенів. Stories
 * покривають розміри, module-tinted variants (finyk / fizruk / routine
 * / nutrition), action-slot та custom weight. Initiative 0007 Phase 2 —
 * shared/ui story.
 */
const meta: Meta<typeof SectionHeading> = {
  title: "Shared / SectionHeading",
  component: SectionHeading,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    children: "Транзакції за тиждень",
    size: "xs",
  },
};
export default meta;

type Story = StoryObj<typeof SectionHeading>;

/** Дефолтний eyebrow (xs / subtle / bold). */
export const Default: Story = {};

/** Усі шість розмірів — від компактного 2xs eyebrow до xl page-heading. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SectionHeading size="2xs">2xs · compact eyebrow</SectionHeading>
      <SectionHeading size="xs">xs · default eyebrow</SectionHeading>
      <SectionHeading size="sm">sm · widest tracking eyebrow</SectionHeading>
      <SectionHeading size="md">md · body heading</SectionHeading>
      <SectionHeading size="lg">lg · card title</SectionHeading>
      <SectionHeading size="xl">xl · page title</SectionHeading>
    </div>
  ),
};

/** Module-tinted варіанти — accent палітра кожного модуля. */
export const ModuleVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SectionHeading size="sm" variant="finyk">
        Фінік · витрати
      </SectionHeading>
      <SectionHeading size="sm" variant="fizruk">
        Фізрук · тренування
      </SectionHeading>
      <SectionHeading size="sm" variant="routine">
        Рутина · звички
      </SectionHeading>
      <SectionHeading size="sm" variant="nutrition">
        Харчування · раціон
      </SectionHeading>
    </div>
  ),
};

/** З `action`-slot — назва секції + посилання справа. */
export const WithAction: Story = {
  render: () => (
    <SectionHeading
      size="md"
      action={
        <button
          type="button"
          className="text-xs text-brand-strong hover:underline"
        >
          Детальніше
        </button>
      }
    >
      Останні транзакції
    </SectionHeading>
  ),
};

/** Semibold-варіант — Finyk eyebrow tone (`weight="semibold"`). */
export const SemiboldFinyk: Story = {
  args: {
    size: "xs",
    weight: "semibold",
    variant: "muted",
    children: "Категорії витрат",
  },
};
