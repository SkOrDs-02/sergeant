import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { usePlan } from "../billing/usePlan";
import { SettingsGroup } from "./SettingsPrimitives";

/**
 * Підписка та план — секція Settings (audit P1-6,
 * `docs/audits/2026-05-13-revenue-monetization-roast.md`).
 *
 * Читає план з `usePlan()` (через `billingKeys.status` — Hard Rule #2)
 * і показує:
 *   • Бейдж плану (Free / Pro).
 *   • Trial-дату (`status === "trialing"` → `currentPeriodEnd` = trial-end),
 *     дату наступного списання (`active`), warning при `canceled`/`past_due`.
 *   • CTA: «Перейти на Pro» (→ `/pricing?source=settings`) для Free;
 *     «Керувати підпискою» (→ `/api/billing/portal`) для Pro.
 *
 * `/api/billing/portal` створює Stripe Customer Portal session і редіректить
 * у його UI. Server-side endpoint — окремий outstanding item (P0-6 у тому ж
 * аудіті); UI шле браузер на канонічний URL уже зараз, щоб не плодити
 * proxy-методи у `billingApi` (api-client `openCustomerPortal` — Phase 3.3
 * ініціативи 0010).
 */

const BILLING_PORTAL_URL = "/api/billing/portal";

function formatKyivDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function PlanSection() {
  const navigate = useNavigate();
  const { isPro, isLoading, subscription } = usePlan();
  const [redirecting, setRedirecting] = useState(false);

  const status = subscription?.status ?? null;
  const periodEnd = formatKyivDate(subscription?.currentPeriodEnd);
  const planLabel = isPro ? "Pro" : "Free";

  function handleManage() {
    setRedirecting(true);
    window.location.assign(BILLING_PORTAL_URL);
  }

  function handleUpgrade() {
    navigate("/pricing?source=settings");
  }

  return (
    <SettingsGroup title="Підписка та план" emoji="💳" anchorId="settings-plan">
      <div className="flex flex-col gap-4">
        <div
          className="flex items-center gap-3"
          data-testid="plan-section-header"
        >
          <Badge
            variant={isPro ? "accent" : "neutral"}
            tone={isPro ? "solid" : "soft"}
            size="md"
            data-testid="plan-badge"
          >
            {planLabel}
          </Badge>
          {isLoading && (
            <span className="text-xs text-subtle">Завантажуємо…</span>
          )}
        </div>

        {isPro && status === "trialing" && periodEnd && (
          <div data-testid="plan-trial-info" className="space-y-1">
            <span className="text-style-label block">Пробний період</span>
            <p className="text-sm text-text leading-snug">
              Закінчується {periodEnd}. Після цього спишемо $7/міс — скасуй до
              цієї дати, якщо передумаєш.
            </p>
          </div>
        )}

        {isPro && status === "active" && periodEnd && (
          <p
            data-testid="plan-active-info"
            className="text-sm text-subtle leading-snug"
          >
            Наступне списання: {periodEnd}.
          </p>
        )}

        {isPro && status === "canceled" && (
          <p
            data-testid="plan-canceled-info"
            className="text-sm text-warning-strong leading-snug"
          >
            Підписку скасовано.
            {periodEnd ? ` Доступ до Pro завершиться ${periodEnd}.` : ""}
          </p>
        )}

        {isPro && status === "past_due" && (
          <p
            data-testid="plan-past-due-info"
            className="text-sm text-danger-strong leading-snug"
          >
            Останній платіж не пройшов. Онови картку у Stripe Portal, щоб не
            втратити доступ.
          </p>
        )}

        {!isPro && status !== "canceled" && (
          <p className="text-sm text-subtle leading-snug">
            Ти на безкоштовному тарифі. Pro відкриває безлімітний AI-чат,
            CloudSync між пристроями, авто-Mono sync і експорт CSV/PDF.
          </p>
        )}

        {!isPro && status === "canceled" && (
          <p
            data-testid="plan-ended-info"
            className="text-sm text-warning-strong leading-snug"
          >
            Підписка Pro завершилася{periodEnd ? ` ${periodEnd}` : ""}. Можеш
            поновити її в будь-який момент.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {isPro ? (
            <Button
              variant="primary"
              size="md"
              onClick={handleManage}
              disabled={redirecting}
              data-testid="plan-manage-button"
              className="gap-2"
            >
              <Icon name="credit-card" size={16} />
              Керувати підпискою
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleUpgrade}
              data-testid="plan-upgrade-button"
              className="gap-2"
            >
              <Icon name="sparkles" size={16} />
              Перейти на Pro
            </Button>
          )}
        </div>
      </div>
    </SettingsGroup>
  );
}

// Re-export the resolved plan label so the test can sanity-check without
// reaching into `usePlan` internals. Kept narrow to avoid a barrel export
// that drags `usePlan` into modules that only need plain JSX strings.
export const __PLAN_SECTION_PORTAL_URL = BILLING_PORTAL_URL;
