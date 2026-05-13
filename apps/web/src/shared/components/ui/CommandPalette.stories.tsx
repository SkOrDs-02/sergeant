import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPaletteControls,
  useRegisterCommand,
  type PaletteCommand,
} from "./CommandPalette";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * `CommandPalette` — глобальний ⌘K / Ctrl+K surface.
 *
 * Pluggable registry: будь-який модуль реєструє команди через
 * `useRegisterCommand("module-id", commands)`. Підтримує debounced
 * search, групування, recent commands (localStorage), keyboard nav.
 */
const meta: Meta<typeof CommandPalette> = {
  title: "UI / CommandPalette",
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof CommandPalette>;

const DEMO_COMMANDS: PaletteCommand[] = [
  {
    id: "nav.hub",
    title: "Перейти на головну",
    description: "Hub — стрічка модулів",
    group: "Навігація",
    icon: <Icon name="home" />,
    run: () => console.log("[story] hub"),
  },
  {
    id: "nav.settings",
    title: "Відкрити налаштування",
    group: "Навігація",
    icon: <Icon name="settings" />,
    shortcut: "⌘ ,",
    run: () => console.log("[story] settings"),
  },
  {
    id: "ui.toggle-theme",
    title: "Перемкнути тему",
    description: "Світла ↔ темна",
    group: "Інтерфейс",
    icon: <Icon name="sun" />,
    shortcut: "⇧ T",
    run: () => console.log("[story] theme"),
  },
  {
    id: "ai.ask",
    title: "Запитати AI-асистента",
    group: "AI",
    icon: <Icon name="sparkle" />,
    run: () => console.log("[story] ai"),
  },
  {
    id: "session.logout",
    title: "Вийти з акаунту",
    group: "Сесія",
    run: () => console.log("[story] logout"),
    keywords: ["logout", "sign out"],
  },
  {
    id: "settings.preferences",
    title: "Налаштування експорту",
    group: "Налаштування",
    disabled: true,
    description: "Доступно після підписки Pro",
    run: () => console.log("[story] export"),
  },
];

function Harness() {
  const { open } = useCommandPaletteControls();
  useRegisterCommand("story.demo", DEMO_COMMANDS);
  return (
    <div className="min-h-screen bg-bg p-8">
      <p className="text-sm text-muted mb-4">
        Натисни ⌘K (на Mac) / Ctrl+K (Windows / Linux) — або кнопку нижче.
      </p>
      <Button onClick={open}>Відкрити палітру</Button>
      <CommandPalette />
    </div>
  );
}

/** Інтерактивна палітра з 6 seed-командами + кнопкою. */
export const Default: Story = {
  render: () => (
    <CommandPaletteProvider>
      <Harness />
    </CommandPaletteProvider>
  ),
};

/** Demo: відкривається одразу при першому рендері. */
export const InitiallyOpen: Story = {
  render: () => (
    <CommandPaletteProvider>
      <AutoOpen />
    </CommandPaletteProvider>
  ),
};

function AutoOpen() {
  const { open } = useCommandPaletteControls();
  useRegisterCommand("story.demo", DEMO_COMMANDS);
  useEffect(() => {
    open();
  }, [open]);
  return (
    <div className="min-h-screen bg-bg p-8">
      <CommandPalette />
    </div>
  );
}
