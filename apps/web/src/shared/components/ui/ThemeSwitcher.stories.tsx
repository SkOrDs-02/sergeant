import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSwitcher } from "./ThemeSwitcher";

/**
 * `ThemeSwitcher` — uniform UI control for the 4-mode theme contract
 * (`useTheme`): light · dark · system · HC. Compact segmented control
 * with an icon + short caption per choice (round-2 UI audit X4).
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
};
export default meta;

type Story = StoryObj<typeof ThemeSwitcher>;

/** Segmented control — icon + caption per theme choice. */
export const Segmented: Story = {};
