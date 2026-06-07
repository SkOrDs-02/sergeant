/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";
import { useLocalStorageState } from "@shared/hooks";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";

const BANNER_LS_KEY = "sergeant.privacy.lockBanner.dismissed";

export function PrivacyLockBanner() {
  const [dismissed, setDismissed] = useLocalStorageState<boolean>(
    BANNER_LS_KEY,
    false,
  );

  if (dismissed) return null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-3">
      <div className="relative rounded-2xl border border-dashed border-line bg-panel px-4 py-3.5 flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-xl bg-finyk-soft flex items-center justify-center">
          <Icon name="lock" size="sm" className="text-finyk" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-style-label text-text">
            {messages.privacy.bannerTitle}
          </p>
          <p className="text-style-caption text-muted mt-0.5">
            {messages.privacy.bannerHint}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-1">
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
