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

export interface DemoCommandsOptions {
  /**
   * Відкрити глобальний пошук хаба. Із увімкненою палітрою `Cmd+K` веде в
   * палітру, тож пошук має бути досяжним ізсередини — командою тут і
   * рядком «Шукати „…“» у `CommandPaletteUI` (рішення власника 2026-09-16).
   */
  openSearch?: (() => void) | undefined;
}

export function useDemoCommands({
  openSearch,
}: DemoCommandsOptions = {}): void {
  const navigate = useNavigate();
  const toast = useToast();
  const { logout, status } = useAuth();
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
        // `logout()` сам питає про незбережені записи; `false` — людина
        // обрала «Залишитись», сесія жива: ні тосту, ні редіректу.
        const done = await logout();
        if (!done) return;
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
      ...(openSearch
        ? [
            {
              id: "search.open",
              title: "Глобальний пошук",
              description:
                "Записи всіх модулів, налаштування, підказки від Сержанта",
              group: "Навігація",
              keywords: ["search", "find", "пошук", "знайти"],
              run: () => openSearch(),
            } satisfies PaletteCommand,
          ]
        : []),
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
        id: "nav.routine",
        title: "Відкрити РУТИНУ",
        description: "Звички, серії днів, нагадування",
        group: "Навігація",
        keywords: ["routine", "звички", "рутина"],
        run: () => navigate("/routine"),
      },
      {
        id: "nav.nutrition",
        title: "Відкрити ХАРЧУВАННЯ",
        description: "Щоденник їжі, комора, план",
        group: "Навігація",
        keywords: ["nutrition", "їжа", "калорії", "харчування"],
        run: () => navigate("/nutrition"),
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
      // «Вийти» лише для залогіненого: анонімові виходити нема з чого
      // (аудит 2026-10-01, `data-19`).
      ...(status === "authenticated"
        ? [
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
            } satisfies PaletteCommand,
          ]
        : []),
    ],
    [isDark, navigate, openSearch, signOutFromPalette, status, toggleDark],
  );

  useRegisterCommand("core.demo", commands);
}
