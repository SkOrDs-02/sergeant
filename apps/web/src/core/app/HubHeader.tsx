/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { useShortcutGlyph } from "@shared/hooks";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { messages } from "@shared/i18n/uk";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { formatKyivNominativeDate } from "@shared/lib/time/greeting";
import { coreMessages } from "@shared/i18n/uk.core";
import { useHubDayCounts } from "../hub/now/hubDayCounts";
import { NotificationBell, type HubNotification } from "./NotificationBell";
import type { HubView } from "../hooks/useHubUIState";

// Мова H (redesign v3): H1 вкладки «Головна» - сьогоднішня дата, решти
// вкладок - їхня назва. Привітання за часом доби знято (каталог п. 1).
const HUB_TAB_TITLES: Partial<Record<HubView, string>> = {
  reports: messages.nav.reports,
  profile: messages.nav.profile,
  settings: messages.nav.settings,
};

// Дві кнопки-іконки 44 px праворуч: Сержант і пошук. Радіус 8, як у кнопок.
const ICON_BUTTON_CLS =
  "w-11 h-11 flex items-center justify-center rounded-lg text-text hover:bg-panel transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

interface HubHeaderProps {
  onOpenSearch: () => void;
  /** System notifications (SW update / PWA install) surfaced in the bell. */
  notifications?: readonly HubNotification[];
  /**
   * Currently active hub tab. Drives the visible orientation subtitle
   * (PR-H2) — omit or pass `"dashboard"` on the home tab, where no
   * subtitle renders.
   */
  activeTab?: HubView;
}

export function HubHeader({
  onOpenSearch,
  notifications,
  activeTab,
}: HubHeaderProps) {
  const dateStr = useMemo(() => formatKyivNominativeDate(), []);
  const { modK } = useShortcutGlyph();
  const tabTitle = activeTab ? HUB_TAB_TITLES[activeTab] : undefined;
  const counts = useHubDayCounts();

  return (
    <header
      className={cn(
        "px-5 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full",
        "shrink-0 z-40 pt-6 pb-2",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* `<p>`, не `<h1>`: семантичний h1 кожної вкладки вже стоїть у
              контенті (sr-only), другий інвертував би структуру заголовків. */}
          <p
            data-testid="hub-header-title"
            className="text-style-headline-lg text-text"
          >
            {tabTitle ?? dateStr}
          </p>
          {!tabTitle && counts.now !== null && (
            <p className="mt-1 text-style-label tnum text-muted">
              {coreMessages.hub.daySummary.now} {counts.now} ·{" "}
              {coreMessages.hub.daySummary.closed} {counts.closed ?? 0}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span data-sync-status-slot className="contents" />
          {/* Один явний вхід до Сержанта на хабі: відкриває аркуш чату через
              шину, той самий контракт, що й у шапці модуля. */}
          <Tooltip
            content={messages.nav.openAssistant}
            placement="bottom-center"
          >
            <button
              type="button"
              onClick={() => {
                hapticTap();
                emitHubBus("openChat", { message: null, autoSend: false });
              }}
              aria-label={messages.nav.openAssistant}
              className={ICON_BUTTON_CLS}
            >
              <Icon name="sergeant" size="lg" />
            </button>
          </Tooltip>

          <Tooltip
            content={`Пошук по всіх модулях (${modK})`}
            placement="bottom-center"
          >
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Пошук"
              className={ICON_BUTTON_CLS}
            >
              <Icon name="search" size="lg" />
            </button>
          </Tooltip>

          {/* Дзвоник рендериться лише коли є системне сповіщення (оновлення
              застосунку, встановлення PWA). */}
          {/* Вхід для аноніма живе у вкладці tab bar, не тут (мова H: дві
              іконки в шапці). */}
          <NotificationBell notifications={notifications ?? []} />
        </div>
      </div>
    </header>
  );
}
