import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Modal } from "@shared/components/ui/Modal";
import { messages } from "@shared/i18n/uk";
import type { PaywallSurface } from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

/**
 * Premium-gate modal (initiative 0010 Phase 4.1).
 *
 * Generic, copy-driven modal used by Premium-only features when the caller's
 * `usePlan()` returns `isPro === false`. Fires `paywall_viewed` exactly
 * once per open transition (PostHog dashboard
 * `paywall_viewed → checkout_opened → subscription_started` funnel).
 * Navigates to `/pricing?source=paywall` on primary CTA.
 *
 * Callers own the headline + body copy so the modal stays generic and
 * we can tune messaging per surface without forking the component.
 */

// Поверхні живуть у реєстрі доступу (`@sergeant/shared`, поле `surface`
// рядка фічі), а не окремою мапою тут.
export type { PaywallSurface };

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
  /** Override the primary CTA label. Defaults to `messages.paywallModal.cta`. */
  ctaLabel?: string;
  /** Override the secondary CTA label. Defaults to `messages.paywallModal.dismiss`. */
  dismissLabel?: string;
}

// AI-NOTE: буліт «7 днів trial без привʼязки картки» прибрано 2026-08-05
// (B4 браузерного аудиту) і не повертається: trial дається лише новому
// акаунту і лише за прапорцем `BILLING_REVERSE_TRIAL_ENABLED`, тож людина
// перед пейволом його вже або має, або не отримає.
const COPY = messages.paywallModal;

// Порядок булетів — тут: каталог тримає плоскі ключі, бо `MessageCatalog`
// не допускає масивів (див. коментар над групою в `uk.ts`).
const DEFAULT_FEATURES: ReadonlyArray<string> = [
  COPY.featureAi,
  COPY.featureSync,
  COPY.featureExport,
];

export function PaywallModal({
  open,
  onClose,
  surface,
  title,
  description,
  features = DEFAULT_FEATURES,
  ctaLabel = COPY.cta,
  dismissLabel = COPY.dismiss,
}: PaywallModalProps) {
  const navigate = useNavigate();
  const prevOpen = useRef(false);

  useEffect(() => {
    // Fire once per open false→true transition. Surface swaps while the
    // modal stays open must NOT re-fire — that would inflate the
    // `paywall_viewed → checkout_opened → subscription_started` funnel.
    if (open && !prevOpen.current) {
      trackEvent(ANALYTICS_EVENTS.PAYWALL_VIEWED, { surface });
    }
    prevOpen.current = open;
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
      // v2 visual refresh (Phase 7 D2). Panel inherits `bg-surface` from
      // <Modal>; the extra `bg-gradient` overlay lifts the paywall to a
      // brand-accented hero tone so the upsell does not look like a
      // generic system dialog. Scrim + backdrop-blur (AMBIENT motion
      // slot per Motion #17) live inside <Modal>; we add no new ambient
      // here. The CTA hover state is the single RESPONSE.
      panelClassName="bg-gradient-to-b from-brand/8 to-surface border-brand/20"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            {dismissLabel}
          </Button>
          {/* Початковий фокус — на основній CTA, а не на «Закрити» в шапці:
              інакше випадковий Enter/Space одразу закриває пейвол. */}
          <Button variant="solid" size="md" onClick={handleCta} data-autofocus>
            {ctaLabel}
          </Button>
        </div>
      }
    >
      <ul className="space-y-2 text-style-label text-text">
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
