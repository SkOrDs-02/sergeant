import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MorphChevron } from "./MorphChevron";

const meta: Meta<typeof MorphChevron> = {
  title: "UI/MorphChevron",
  component: MorphChevron,
  parameters: { layout: "centered" },
  args: { open: true, size: 24, strokeWidth: 2 },
};
export default meta;

type Story = StoryObj<typeof MorphChevron>;

export const Static: Story = {};

/** Click to watch the single glyph rotate between collapsed ▶ and expanded ▼. */
export const Interactive: Story = {
  render: () => {
    const Demo = () => {
      const [open, setOpen] = useState(false);
      return (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-text focus-ring"
        >
          <MorphChevron open={open} size={20} className="text-subtle" />
          <span className="text-style-label">
            {open ? "Згорнути" : "Розгорнути"}
          </span>
        </button>
      );
    };
    return <Demo />;
  },
};
