import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Modal } from "@shared/components/ui/Modal";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

/**
 * Pro-gate modal (initiative 0010 Phase 4.1).
 *
 * Generic, copy-driven modal used by Pro-only features when the caller's
 * `usePlan()` returns `isPro === false`. Fires `paywall_viewed` exactly
 * once per open transition (PostHog dashboard
 * `paywall_viewed → checkout_opened → subscription_started` funnel).
 * Navigates to `/pricing?source=paywall` on primary CTA.
 *
 * Callers own the headline + body copy so the modal stays generic and
 * we can tune messaging per surface without forking the component.
 */

export type PaywallSurface =
  | "ai_chat_limit"
  | "mono_auto_sync"
  | "cloud_sync"
  | "csv_export"
  | "unlimited_ai_photo"
  | "themes"
  | "other";

export interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Origin surface — fed into PostHog `paywall_viewed.surface` so the
   * funnel can pivot per locked feature (AI chat limit vs CloudSync vs …).
   */
  surface: PaywallSurface;
  /** Headline shown in the modal header. */
  title: string;
  /** Body paragraph explaining the locked feature. */
  description: string;
  /** Visible features list (3–5 bullets). */
  features?: ReadonlyArray<string>;
  /** Override the primary CTA label. Defaults to "Перейти до Pro". */
  ctaLabel?: string;
  /** Override the secondary CTA label. Defaults to "Не зараз". */
  dismissLabel?: string;
}

const DEFAULT_FEATURES: ReadonlyArray<string> = [
  "Безлімітний AI-чат + щоденні брифи",
  "Авто-синхронізація Mono + CloudSync між пристроями",
  "Експорт CSV/PDF + крос-модульні звіти",
  "7 днів trial без прив'язки картки",
];

export function PaywallModal({
  open,
  onClose,
  surface,
  title,
  description,
  features = DEFAULT_FEATURES,
  ctaLabel = "Перейти до Pro",
  dismissLabel = "Не зараз",
}: PaywallModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      trackEvent(ANALYTICS_EVENTS.PAYWALL_VIEWED, { surface });
    }
    // `surface` is part of the dependency tuple so a parent that swaps
    // the surface while the modal stays open (rare, but possible during
    // route transitions) re-fires the event. PostHog dedupes by uuid; we
    // do not attempt client-side dedupe here.
  }, [open, surface]);

  function handleCta() {
    navigate(`/pricing?source=paywall`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      description={description}
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            {dismissLabel}
          </Button>
          <Button variant="primary" size="md" onClick={handleCta}>
            {ctaLabel}
          </Button>
        </div>
      }
    >
      <ul className="space-y-2 text-sm text-text">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span aria-hidden className="text-brand-strong mt-0.5">
              •
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
