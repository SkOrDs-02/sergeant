import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModulePageLoader } from "./ModulePageLoader";

/**
 * `ModulePageLoader` — Скелетон-лоадер що відповідає макету кожного модуля.
 *
 * Кожен тип (`finyk` / `fizruk` / `routine` / `nutrition` / `generic`) рендерує
 * унікальну skeleton-структуру що точно відображає layout сторінки модуля.
 */
const meta: Meta<typeof ModulePageLoader> = {
  title: "UI / ModulePageLoader",
  component: ModulePageLoader,
  parameters: {
    layout: "fullscreen",
    chromatic: { viewports: [375, 768] },
  },
  tags: ["autodocs"],
  argTypes: {
    module: {
      control: "select",
      options: ["finyk", "fizruk", "routine", "nutrition", "generic"],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm mx-auto bg-bg min-h-screen">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ModulePageLoader>;

export const Generic: Story = {
  args: { module: "generic" },
};

export const Finyk: Story = {
  args: { module: "finyk" },
};

export const Fizruk: Story = {
  args: { module: "fizruk" },
};

export const Routine: Story = {
  args: { module: "routine" },
};

export const Nutrition: Story = {
  args: { module: "nutrition" },
};
