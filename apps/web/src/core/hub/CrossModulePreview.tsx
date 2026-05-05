/**
 * CrossModulePreview — one-shot post-first-entry promo card (S6.4).
 *
 * Renders inline on the dashboard exactly once after the user crosses the
 * first-real-entry threshold, demonstrating Sergeant's cross-module USP
 * with a static example pairing two modules. After the user clicks the CTA
 * or dismisses the card, the seen-flag is persisted and the component
 * never re-renders for that browser profile.
 *
 * Telemetry contract — see `ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_*` in
 * `packages/shared/src/lib/analyticsEvents.ts`.
 */

import { useCallback, useEffect } from "react";
import {
  ANALYTICS_EVENTS,
  type DashboardModuleId,
  getCrossModulePreviewCopy,
  markCrossModulePreviewSeen,
} from "@sergeant/shared";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { webKVStore } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";
import { messages } from "@shared/i18n/uk";

interface CrossModulePreviewProps {
  /** Module that owned the user's first real entry. */
  sourceModule: DashboardModuleId;
  /** Called once the card is dismissed (CTA *or* X) to remove it from the layout. */
  onClose: () => void;
}

export function CrossModulePreview({
  sourceModule,
  onClose,
}: CrossModulePreviewProps) {
  const copy = getCrossModulePreviewCopy(sourceModule);

  useEffect(() => {
    if (!copy) return;
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_SEEN, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    // Mount-only — `copy` is keyed by `sourceModule` and stable for this
    // render. The seen-event must fire exactly once per render-cycle of the
    // card; the persisted `markCrossModulePreviewSeen` flag (set on
    // close/click below) guards against repeat surfaces across reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(() => {
    if (!copy) return;
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_CLICKED, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    markCrossModulePreviewSeen(webKVStore);
    onClose();
  }, [copy, onClose]);

  const handleDismiss = useCallback(() => {
    if (!copy) return;
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_DISMISSED, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    markCrossModulePreviewSeen(webKVStore);
    onClose();
  }, [copy, onClose]);

  if (!copy) return null;

  return (
    <section
      className="relative bg-panel border border-line rounded-2xl p-4 shadow-card overflow-hidden"
      aria-label={messages.hub.crossModulePreviewAria}
      data-testid="cross-module-preview"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={copy.dismissAriaLabel}
        className="absolute top-2 right-2 p-1 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Icon name="close" size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-500/10 text-brand-strong dark:text-brand flex items-center justify-center">
          <Icon name="sparkles" size={18} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="space-y-1">
            <h3 className="text-style-label text-text">{copy.title}</h3>
            <p className="text-xs text-muted leading-relaxed">{copy.body}</p>
          </div>
          <div className="flex">
            <Button variant="secondary" size="sm" onClick={handleClick}>
              {copy.ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
