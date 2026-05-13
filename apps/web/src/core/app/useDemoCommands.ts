// AI-CONTEXT: Seeds the global Command Palette with a baseline set of
// demo commands (navigation + theme + settings + sign-out). These are
// intentionally stubbed with `console.log` + a WIP toast where the real
// handler isn't trivial — Track 5 of the Design System polish initiative
// ships only the primitive; per-module commands land in follow-up PRs
// behind the same `hub_command_palette` flag.
//
// Status: Active (Track 5 seed). Last validated: 2026-05-13 by @Skords-01 / Devin.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@shared/hooks/useToast";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import {
  useRegisterCommand,
  type PaletteCommand,
} from "@shared/components/ui/CommandPalette";

export function useDemoCommands(): void {
  const navigate = useNavigate();
  const toast = useToast();
  const { dark, toggle: toggleDark } = useDarkMode();

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "nav.hub",
        title: "Перейти на головну",
        description: "Hub — стрічка модулів і центральний дашборд",
        group: "Навігація",
        keywords: ["hub", "home", "головна", "дашборд"],
        run: () => navigate("/"),
      },
      {
        id: "nav.finyk",
        title: "Відкрити ФІНІК",
        description: "Витрати, бюджети, картки",
        group: "Навігація",
        keywords: ["finyk", "фінанси", "гроші"],
        run: () => navigate("/finyk"),
      },
      {
        id: "nav.fizruk",
        title: "Відкрити ФІЗРУК",
        description: "Тренування, програма, прогрес",
        group: "Навігація",
        keywords: ["fizruk", "тренування", "спорт"],
        run: () => navigate("/fizruk"),
      },
      {
        id: "settings.toggle-dark",
        title: dark ? "Світла тема" : "Темна тема",
        description: "Перемкнути візуальну схему інтерфейсу",
        group: "Налаштування",
        shortcut: "⇧ T",
        keywords: ["theme", "dark", "light", "тема"],
        run: () => toggleDark(),
      },
      {
        id: "settings.open",
        title: "Відкрити налаштування",
        description: "Профіль, конфіденційність, експериментальні фічі",
        group: "Налаштування",
        keywords: ["settings", "preferences", "налаштування"],
        // Settings UI lives behind the user menu — wiring is module-side;
        // surface as WIP until that lands.
        run: () => {
          console.log("[command-palette] settings.open (WIP)");
          toast.info("Налаштування — у розробці (WIP)");
        },
      },
      {
        id: "session.sign-out",
        title: "Вийти з акаунту",
        description: "Завершити сесію та повернутися на екран входу",
        group: "Сесія",
        keywords: ["logout", "sign out", "вийти"],
        // Real sign-out goes through AuthContext + Better Auth — wiring
        // happens in the auth track. Stub for now.
        run: () => {
          console.log("[command-palette] session.sign-out (WIP)");
          toast.info("Вихід — у розробці (WIP)");
        },
      },
    ],
    [dark, navigate, toast, toggleDark],
  );

  useRegisterCommand("core.demo", commands);
}
