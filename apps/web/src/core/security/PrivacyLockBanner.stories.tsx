/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { safeWriteLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { PrivacyLockBanner } from "./PrivacyLockBanner";

const LS_KEY = "sergeant.privacy.lockBanner.dismissed";

const meta: Meta<typeof PrivacyLockBanner> = {
  title: "Security / PrivacyLockBanner",
  component: PrivacyLockBanner,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768], disableSnapshot: false },
  },
  tags: ["autodocs"],
  beforeEach() {
    safeRemoveLS(LS_KEY);
  },
};
export default meta;

type Story = StoryObj<typeof PrivacyLockBanner>;

/** Undismissed — default visible state. */
export const Default: Story = {};

/** Dismissed — banner is hidden (localStorage flag set). */
export const Dismissed: Story = {
  beforeEach() {
    safeWriteLS(LS_KEY, true);
  },
};

/** No animations (motion-safe override for snapshot stability). */
export const NoAnimation: Story = {
  parameters: {
    chromatic: { disableSnapshot: false },
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <div className="motion-reduce">
        <Story />
      </div>
    ),
  ],
};
