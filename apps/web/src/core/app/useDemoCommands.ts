// AI-CONTEXT: Seeds the global Command Palette with a baseline set of
// demo commands (navigation + theme + settings + sign-out). `settings.open`
// navigates to the Hub Settings tab via `openHubSettingsSection()` — the
// same event-based helper the inactive-module Bento card uses, so it goes
// through `useAppEffects`'s `HUB_OPEN_SETTINGS_EVENT` listener rather than a
// raw `navigate("/?tab=settings")` (keeps the in-memory hub-view state and
// the URL in sync in one commit). `session.sign-out` is wired to the real
// `useAuth().logout()` flow (see `ProfilePage.handleLogout` for the
// reference implementation).
//
// Status: Active (Track 5 seed). Last validated: 2026-08-05 by @claude.

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@shared/lib";
import { useToast } from "@shared/hooks/useToast";
import { useTheme } from "@shared/hooks/useTheme";
import {
  useRegisterCommand,
  type PaletteCommand,
} from "@shared/components/ui/CommandPalette";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";
import { SIGN_IN_PATH } from "./appPaths";
import { useAuth } from "../auth/AuthContext";

export function useDemoCommands(): void {
  const navigate = useNavigate();
  const toast = useToast();
  const { logout } = useAuth();
  // `useDarkMode` was retired in PR #2660 in favour of the 3-mode
  // `useTheme` (`light` / `dark` / `hc`). The Command Palette's binary
  // toggle keeps its old UX semantics by flipping between explicit
  // `light` and `dark` (`hc` is surfaced via the dedicated
  // `<ThemeSwitcher />` in HubHeader).
  const { isDark, setChoice } = useTheme();
  const toggleDark = useCallback(
    () => setChoice(isDark ? "light" : "dark"),
    [isDark, setChoice],
  );

  // Mirrors `ProfilePage.handleLogout`: `logout()` already clears the query
  // cache and purges SW/SQLite/local-first state, so `user` is `null` by the
  // time we navigate — sending the signed-out user to `/sign-in` instead of
  // the hub root avoids a momentary guest-hub flash.
  // Іменований function expression, щоб retry в тості міг покликати сам
  // себе — стрілка з `const` тут ще в TDZ у момент створення замикання.
  const signOutFromPalette = useCallback(
    async function attempt(): Promise<void> {
      try {
        await logout();
        toast.success("Вихід виконано");
        navigate(SIGN_IN_PATH, { replace: true });
      } catch {
        // Дзеркалить `ProfilePage.handleLogout`: вихід ідемпотентний, тож
        // повтор безпечний і це єдиний вихід із «сесія жива, а я думав, що
        // вийшов».
        toast.error("Не вдалося вийти", undefined, {
          label: "Повторити",
          onClick: () => void attempt(),
        });
      }
    },
    [logout, navigate, toast],
  );

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "nav.hub",
        title: "Перейти на головну",
        description: "Hub: стрічка модулів і центральний дашборд",
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
        title: isDark ? "Світла тема" : "Темна тема",
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
        run: () => {
          logger.debug("[command-palette] settings.open");
          openHubSettingsSection();
        },
      },
      {
        id: "session.sign-out",
        title: "Вийти з акаунту",
        description: "Завершити сесію та повернутися на екран входу",
        group: "Сесія",
        keywords: ["logout", "sign out", "вийти"],
        run: () => {
          logger.debug("[command-palette] session.sign-out");
          void signOutFromPalette();
        },
      },
    ],
    [isDark, navigate, signOutFromPalette, toggleDark],
  );

  useRegisterCommand("core.demo", commands);
}
