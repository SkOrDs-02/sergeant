/**
 * @status Active
 * @owner @Skords-01
 *
 * Canonical `/404` (page-not-found) surface. Composed entirely from the
 * design-system `<EmptyState>` primitive + the curated `NotFoundIllustration`,
 * so the same focus contract, motion budget, and SR announcement
 * shipped by the primitive ship here for free. Replaces the inline
 * `apps/web/src/core/NotFoundPage.tsx` (kept as a re-export shim) so
 * route renderers can land on `@core/errors/NotFoundPage` and get the
 * polished surface without per-call drift.
 */
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Icon } from "@shared/components/ui";
import { NotFoundIllustration } from "@assets/illustrations";

export interface NotFoundPageProps {
  /**
   * Override the "home" CTA target. Defaults to `/`. Useful when the
   * 404 is rendered inside a module sub-tree and a softer "back to
   * module home" lands better than a hub-wide reset.
   */
  homePath?: string;
}

export function NotFoundPage({ homePath = "/" }: NotFoundPageProps) {
  const navigate = useNavigate();
  return (
    <main
      // Full-bleed surface — error pages are landing-tier, not nested.
      className="min-h-svh flex items-center justify-center bg-bg px-6"
    >
      <EmptyState
        size="lg"
        variant="info"
        eyebrow="404"
        illustration={<NotFoundIllustration size={200} />}
        title="Сторінку не знайдено"
        description="Здається, ця адреса вже не існує. Перевір посилання або повернись на головну — звідти можна знайти потрібний модуль."
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => {
              navigate(homePath, { replace: true });
            }}
          >
            <Icon name="home" size={16} />
            На головну
          </Button>
        }
        secondaryAction={
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => {
              navigate(-1);
            }}
          >
            <Icon name="chevron-left" size={16} />
            Назад
          </Button>
        }
        hint="Якщо ти перейшов сюди із зовнішнього посилання — напиши нам, ми його полагодимо."
      />
    </main>
  );
}
