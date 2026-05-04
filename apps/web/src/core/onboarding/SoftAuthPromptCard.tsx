import { useEffect, useMemo } from "react";
import {
  SOFT_AUTH_COPY_EXPERIMENT,
  assignVariant,
  getSoftAuthCopy,
  type SoftAuthCopyVariant,
} from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { webKVStore } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { dismissSoftAuth } from "./vibePicks";

/**
 * Inline dashboard card offering cloud sync *after* the user has logged
 * their first real entry. Intentionally not a modal — we never interrupt
 * the user; they can ignore it until they're ready.
 *
 * Copy is gain-first by default (S3.2): «{N} записів вже тут. Акаунт
 * синхронізує…» rather than the pre-S3.2 fear framing «створи акаунт,
 * щоб не втратити». The fear copy is preserved as the `fear` A/B arm
 * via `SOFT_AUTH_COPY_EXPERIMENT` (`assignVariant` defaults to 100%
 * `gain`; PostHog can flip the bucket at runtime).
 */
export function SoftAuthPromptCard({
  onOpenAuth,
  onDismiss,
  entryCount = 0,
  sessionDays = -1,
}: {
  onOpenAuth: () => void;
  onDismiss?: () => void;
  entryCount?: number;
  /**
   * Days the user has actively returned (snapshot from
   * `getSessionDays()` in HubDashboard). `-1` means «not measured
   * yet» — copy resolver treats it as no signal.
   */
  sessionDays?: number;
}) {
  const variant = useMemo<SoftAuthCopyVariant>(
    () =>
      assignVariant(
        webKVStore,
        SOFT_AUTH_COPY_EXPERIMENT,
      ) as SoftAuthCopyVariant,
    [],
  );
  const copy = useMemo(
    () => getSoftAuthCopy(variant, { entryCount, sessionDays }),
    [variant, entryCount, sessionDays],
  );

  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN, {
      placement: "dashboard",
      variant,
      entryCount,
      sessionDays,
    });
  }, [variant, entryCount, sessionDays]);

  const handleOpenAuth = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_AFTER_VALUE, { variant });
    onOpenAuth();
  };

  const handleDismiss = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_DISMISSED, { variant });
    dismissSoftAuth();
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-brand-500/30",
        "bg-linear-to-br from-brand-500/10 via-panel to-panel p-4",
        "shadow-card",
      )}
      data-variant={variant}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-500/15 text-brand-strong dark:text-brand flex items-center justify-center">
          <Icon name="cloud-check" size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-style-label text-text">{copy.title}</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">{copy.body}</p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              type="button"
              onClick={handleOpenAuth}
              variant="primary"
              size="sm"
            >
              Створити акаунт
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-muted hover:text-text px-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
            >
              Пізніше
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
