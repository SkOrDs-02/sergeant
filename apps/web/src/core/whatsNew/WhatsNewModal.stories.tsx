/**
 * Last validated: 2026-08-12
 * Status: Active
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { WhatsNewModal } from "./WhatsNewModal";
import { RELEASES } from "./releases";

const meta: Meta<typeof WhatsNewModal> = {
  title: "Core / WhatsNewModal",
  component: WhatsNewModal,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [390, 768] },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="min-h-screen bg-bg p-4">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    open: true,
    release: RELEASES[0] ?? null,
    onClose: () => {},
    onCtaClick: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof WhatsNewModal>;

/** Latest published release at the production mobile viewport. */
export const LatestRelease: Story = {};
