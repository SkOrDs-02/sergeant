import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";
import type { PullToRefreshState } from "@shared/hooks/usePullToRefresh";

/**
 * `PullToRefreshIndicator` — Візуальний індикатор жесту pull-to-refresh.
 *
 * Кружечок зі spinner що повертається пропорційно до відстані потягування.
 * Коли `isRefreshing=true` — крутиться нескінченно.
 */

const pulling: PullToRefreshState = {
  isPulling: true,
  isRefreshing: false,
  pullProgress: 0.6,
  pullDistance: 40,
  canRefresh: false,
};

const canRefresh: PullToRefreshState = {
  isPulling: true,
  isRefreshing: false,
  pullProgress: 1,
  pullDistance: 70,
  canRefresh: true,
};

const refreshing: PullToRefreshState = {
  isPulling: false,
  isRefreshing: true,
  pullProgress: 1,
  pullDistance: 60,
  canRefresh: false,
};

const meta: Meta<typeof PullToRefreshIndicator> = {
  title: "UI / PullToRefreshIndicator",
  component: PullToRefreshIndicator,
  parameters: {
    layout: "centered",
    chromatic: { viewports: [375] },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="relative h-24 w-64 bg-bg rounded-2xl border border-line overflow-hidden">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "finyk", "fizruk", "routine", "nutrition"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof PullToRefreshIndicator>;

export const Pulling: Story = {
  args: { state: pulling, variant: "default" },
};

export const CanRefresh: Story = {
  args: { state: canRefresh, variant: "default" },
};

export const Refreshing: Story = {
  args: { state: refreshing, variant: "default" },
};

export const FinykVariant: Story = {
  args: { state: refreshing, variant: "finyk" },
};

export const RoutineVariant: Story = {
  args: { state: canRefresh, variant: "routine" },
};
