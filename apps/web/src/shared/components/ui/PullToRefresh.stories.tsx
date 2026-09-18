import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullToRefresh } from "./PullToRefresh";

/**
 * `PullToRefresh` — iOS-стиль pull-to-refresh для скролюваних регіонів.
 *
 * Обгортає scrollable content. Жест потягування виклика `onRefresh`.
 * Підтримує module accent (`variant`) і можна відключити через `enabled={false}`.
 *
 * Для тестування жесту: відкрий Storybook на мобільному або в DevTools
 * з touch-емуляцією та потягни контент вниз.
 */
const meta: Meta<typeof PullToRefresh> = {
  title: "UI / PullToRefresh",
  component: PullToRefresh,
  parameters: {
    layout: "fullscreen",
    chromatic: { disableSnapshot: true },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "finyk", "fizruk", "routine", "nutrition"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof PullToRefresh>;

const mockItems = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  label: `Елемент ${i + 1}`,
}));

const mockRefresh = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 1500));

export const Default: Story = {
  args: {
    variant: "default",
    onRefresh: mockRefresh,
  },
  render: (args) => (
    <div className="h-screen bg-bg">
      <PullToRefresh {...args} className="h-full">
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted text-center py-2">
            Потягни вниз для оновлення
          </p>
          {mockItems.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-panel rounded-2xl border border-line"
            >
              <p className="text-sm text-text">{item.label}</p>
            </div>
          ))}
        </div>
      </PullToRefresh>
    </div>
  ),
};

export const FinykVariant: Story = {
  args: {
    variant: "finyk",
    onRefresh: mockRefresh,
  },
  render: (args) => (
    <div className="h-screen bg-bg">
      <PullToRefresh {...args} className="h-full">
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted text-center py-2">
            Finyk — Emerald accent
          </p>
          {mockItems.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="p-4 bg-panel rounded-2xl border border-finyk/30"
            >
              <p className="text-sm text-text">{item.label}</p>
            </div>
          ))}
        </div>
      </PullToRefresh>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    variant: "default",
    enabled: false,
    onRefresh: mockRefresh,
  },
  render: (args) => (
    <div className="h-screen bg-bg">
      <PullToRefresh {...args} className="h-full">
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted text-center py-2">
            Pull-to-refresh вимкнено (наприклад, під час відкритого Sheet)
          </p>
          {mockItems.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="p-4 bg-panel rounded-2xl border border-line"
            >
              <p className="text-sm text-text">{item.label}</p>
            </div>
          ))}
        </div>
      </PullToRefresh>
    </div>
  ),
};
