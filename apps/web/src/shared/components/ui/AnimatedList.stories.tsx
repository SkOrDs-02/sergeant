import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnimatedList } from "./AnimatedList";

/**
 * `AnimatedList` — staggered entrance-animations для списків. Stories
 * вимикають `triggerOnView` (анімація стартує одразу), щоб visual
 * regression snapshots не залежали від IntersectionObserver-у. Покривають
 * 4 animation styles. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof AnimatedList> = {
  title: "Shared / AnimatedList",
  component: AnimatedList,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    triggerOnView: false,
    staggerDelay: 60,
  },
};
export default meta;

type Story = StoryObj<typeof AnimatedList>;

const sampleItems = [
  "Кафе «Світлячок»",
  "Чай із имбіром",
  "Тренування ніг",
  "Прогулянка ввечері",
  "Книга «Атомні звички»",
];

function renderItems() {
  return sampleItems.map((label) => (
    <div
      key={label}
      className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-text"
    >
      {label}
    </div>
  ));
}

/** Default — `slideUp` animation, 60ms stagger. */
export const Default: Story = {
  render: (args) => (
    <AnimatedList {...args} className="flex flex-col gap-2 max-w-md">
      {renderItems()}
    </AnimatedList>
  ),
};

/** Fade-only animation (без translate). */
export const Fade: Story = {
  args: { animation: "fade" },
  render: (args) => (
    <AnimatedList {...args} className="flex flex-col gap-2 max-w-md">
      {renderItems()}
    </AnimatedList>
  ),
};

/** `slideRight` — items виїжджають зліва. */
export const SlideRight: Story = {
  args: { animation: "slideRight" },
  render: (args) => (
    <AnimatedList {...args} className="flex flex-col gap-2 max-w-md">
      {renderItems()}
    </AnimatedList>
  ),
};

/** `scale` — items виростають із 95% розміру. */
export const Scale: Story = {
  args: { animation: "scale" },
  render: (args) => (
    <AnimatedList {...args} className="flex flex-col gap-2 max-w-md">
      {renderItems()}
    </AnimatedList>
  ),
};
