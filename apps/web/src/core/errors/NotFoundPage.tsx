/**
 * @status Active
 * @owner @Skords-01
 *
 * Canonical `/404` (page-not-found) surface. Composed entirely from the
 * design-system `<EmptyState>` primitive + the curated `NotFoundIllustration`,
 * so the same focus contract, motion budget, and SR announcement
 * shipped by the primitive ship here for free. Route renderers land here
 * via `@core/errors/NotFoundPage` (was previously a re-export shim at
 * `apps/web/src/core/NotFoundPage.tsx` — deleted 2026-05-21).
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Button, EmptyState } from "@shared/components/ui";
import { SUPPORT_EMAIL } from "../legal/legalShared";

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
  const location = useLocation();
  return (
    <main
      id="main"
      tabIndex={-1}
      // Full-bleed surface — error pages are landing-tier, not nested.
      className="min-h-svh flex items-center justify-center bg-bg px-6 outline-none"
    >
      <EmptyState
        size="lg"
        eyebrow="404"
        title="Сторінку не знайдено"
        // The empty state is the entire 404 surface, so it has to carry the
        // page heading — otherwise this route ships with no heading at all.
        titleAs="h1"
        ariaLive="off"
        // Рішення власника 2026-11-25: підказка видима, з реальним каналом.
        // «Ми» тут доречне: це жива команда, а не голос застосунку.
        tertiaryLink={
          <p className="text-style-caption text-subtle">
            Прийшов за зовнішнім посиланням?{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex min-h-[44px] items-center text-brand-strong underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              Напиши нам
            </a>
          </p>
        }
        description="Перевір посилання або повернись на головну."
        primaryAction={
          <Button
            type="button"
            variant="solid"
            size="lg"
            onClick={() => {
              navigate(homePath, { replace: true });
            }}
          >
            На головну
          </Button>
        }
        secondaryAction={
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              // Перший запис історії (зовнішнє посилання, набрана адреса):
              // `navigate(-1)` нікуди б не привів або вивів би з застосунку.
              if (location.key !== "default") navigate(-1);
              else navigate(homePath, { replace: true });
            }}
          >
            Назад
          </Button>
        }
      />
    </main>
  );
}
