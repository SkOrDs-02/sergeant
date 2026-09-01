/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";
import { useLocalStorageState } from "@shared/hooks";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";
import { useHubBannerSlot } from "../hub/bannerBudget";

const BANNER_LS_KEY = "sergeant.privacy.lockBanner.dismissed";

export function PrivacyLockBanner() {
  const [dismissed, setDismissed] = useLocalStorageState<boolean>(
    BANNER_LS_KEY,
    false,
  );

  // Бюджет банерів хабу (F3, 2026-09-01): не більше двох підказок
  // одночасно; цей — після конверсії в акаунт.
  const hasSlot = useHubBannerSlot("privacyLock", !dismissed);

  if (dismissed || !hasSlot) return null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-3">
      {/* `flex-wrap` + `basis-full` на групі кнопок до `sm`: на 393px
          `shrink-0`-кнопки лишали заголовку 56px і ламали копію на сім
          рядків, а кнопка накривала текст (анти-слоп аудит 2026-09-01,
          F5). Тепер кнопки переносяться під текст і вирівнюються праворуч. */}
      <div className="relative rounded-2xl border border-dashed border-line bg-panel px-4 py-3.5 flex flex-wrap items-start gap-3">
        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-brand-soft flex items-center justify-center">
          <Icon name="lock" size="sm" className="text-brand" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-style-label text-text">
            {messages.privacy.bannerTitle}
          </p>
          <p className="text-style-caption text-text mt-0.5">
            {messages.privacy.bannerHint}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0 basis-full sm:basis-auto sm:ml-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openHubSettingsSection("privacy")}
          >
            {messages.privacy.bannerCta}
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={messages.actions.close}
            className="p-1.5 rounded-xl touch-target text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <Icon name="x" size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
