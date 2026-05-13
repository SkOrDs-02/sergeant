import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSwitcher } from "./ThemeSwitcher";

/**
 * `ThemeSwitcher` — uniform UI control for the 4-mode theme contract
 * (`useTheme`): light · dark · system · HC. Two surfaces: compact
 * segmented control (default) for header chrome, and a verbose
 * dropdown variant for Settings / DesignShowcase.
 *
 * Storybook NOTE: the component invokes `useTheme()` internally, which
 * toggles `dark`/`hc` classes on the live `<html>` element. Clicking
 * an option here will flip the Storybook root theme — that's the
 * intended demo behaviour.
 */
const meta: Meta<typeof ThemeSwitcher> = {
  title: "UI / ThemeSwitcher",
  component: ThemeSwitcher,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "radio", options: ["segmented", "dropdown"] },
  },
  args: { variant: "segmented" },
};
export default meta;

type Story = StoryObj<typeof ThemeSwitcher>;

/** Compact segmented control — header-chrome variant. */
export const Segmented: Story = {};

/** Verbose dropdown — Settings / verbose surfaces variant. */
export const Dropdown: Story = {
  args: { variant: "dropdown" },
};

/** Both variants side by side for direct comparison. */
export const SideBySide: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <ThemeSwitcher />
      <ThemeSwitcher variant="dropdown" />
    </div>
  ),
};
