import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * `CollapsibleSection` — section-wrapper, що згортається/розгортається
 * і зберігає стан у `localStorage`. Stories покривають expanded /
 * collapsed-with-icon / collapsed-with-subtitle варіанти. Кожна story
 * використовує унікальний `storageKey`, щоб не конфліктувати з real-app
 * state. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof CollapsibleSection> = {
  title: "Shared / CollapsibleSection",
  component: CollapsibleSection,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
  args: {
    storageKey: "sb-collapsible-default",
    title: "Підказки на сьогодні",
    defaultOpen: true,
  },
};
export default meta;

type Story = StoryObj<typeof CollapsibleSection>;

/** Expanded — eyebrow + контент видимий. */
export const Expanded: Story = {
  render: (args) => (
    <CollapsibleSection {...args}>
      <p className="text-sm text-text">Контент секції — будь-який JSX.</p>
    </CollapsibleSection>
  ),
};

/** Collapsed — `defaultOpen=false` із collapsedIcon-ом. */
export const Collapsed: Story = {
  args: {
    storageKey: "sb-collapsible-collapsed",
    defaultOpen: false,
    title: "Аналітика тижня",
    collapsedIcon: "bar-chart",
  },
  render: (args) => (
    <CollapsibleSection {...args}>
      <p className="text-sm text-text">Контент секції — будь-який JSX.</p>
    </CollapsibleSection>
  ),
};

/** Collapsed з subtitle — preview-line у pill-стані. */
export const CollapsedWithSubtitle: Story = {
  args: {
    storageKey: "sb-collapsible-subtitle",
    defaultOpen: false,
    title: "AI-порада",
    collapsedIcon: "sparkles",
    collapsedSubtitle: "Оновлено хвилину тому",
  },
  render: (args) => (
    <CollapsibleSection {...args}>
      <p className="text-sm text-text">Контент секції — будь-який JSX.</p>
    </CollapsibleSection>
  ),
};

/** Великий розмір eyebrow — `headingSize="md"`. */
export const LargerHeading: Story = {
  args: {
    storageKey: "sb-collapsible-md",
    headingSize: "md",
    title: "Тренування за тиждень",
  },
  render: (args) => (
    <CollapsibleSection {...args}>
      <p className="text-sm text-text">Контент секції — будь-який JSX.</p>
    </CollapsibleSection>
  ),
};
