import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { usePlan } from "../billing";
import { SettingsGroup } from "./SettingsPrimitives";
import { formatKyivLongDate } from "@shared/lib/time/kyivTime";

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
 *     для legacy `provider === "stripe"` — «Керувати підпискою»
 *     (→ `/api/billing/portal` → Stripe Customer Portal);
 *     для LiqPay/Plata — «Скасувати Pro» (власний cancel, порталу нема).
 *
 * Portal redirect робимо тільки після успішного POST `/api/billing/portal`:
 * endpoint не має GET-форми, тож прямий `location.assign("/api/...")` ламає
 * self-serve billing flow.
 */

const BILLING_PORTAL_UNAVAILABLE =
  "Портал підписки тимчасово недоступний. Спробуй ще раз за хвилину.";
const BILLING_CANCEL_FAILED =
  "Не вдалося скасувати. Спробуй ще раз за хвилину.";

export function PlanSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isPro, isLoading, subscription } = usePlan();
  const [redirecting, setRedirecting] = useState(false);
  const [portalError, setPortalError] = useState("");
  // Власне скасування (LiqPay/Plata без Customer Portal): двокрокове
  // підтвердження без окремого модалу.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const status = subscription?.status ?? null;
  const periodEnd = formatKyivLongDate(subscription?.currentPeriodEnd);
  const planLabel = isPro ? "Pro" : "Free";

  async function handleManage() {
    setRedirecting(true);
    setPortalError("");
    try {
      const portal = await billingApi.createPortal();
      window.location.assign(portal.url);
    } catch {
      setPortalError(BILLING_PORTAL_UNAVAILABLE);
      setRedirecting(false);
    }
  }

  function handleUpgrade() {
    navigate("/pricing?source=settings");
  }

  async function handleCancel() {
    setCanceling(true);
    setCancelError("");
    try {
      await billingApi.cancel();
      setConfirmingCancel(false);
      await queryClient.invalidateQueries({ queryKey: billingKeys.status });
    } catch {
      setCancelError(BILLING_CANCEL_FAILED);
    } finally {
      setCanceling(false);
    }
  }

  return (
    <SettingsGroup
      title="Підписка та план"
      icon="wallet"
      anchorId="settings-plan"
    >
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
              Закінчується {periodEnd}. Після цього підписка стане платною за
              тарифом з чекауту — скасуй до цієї дати, якщо передумаєш.
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
            {subscription?.provider === "stripe"
              ? "Останній платіж не пройшов. Онови картку в платіжному порталі, щоб не втратити доступ."
              : "Останній платіж не пройшов. Онови спосіб оплати або спробуй списання знову, щоб не втратити доступ."}
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
            <>
              {/* Customer Portal є лише у Stripe. Для liqpay/plata/manual
                  керування = кнопка «Скасувати Pro» нижче (порталу нема). */}
              {subscription?.provider === "stripe" && (
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
              )}
              {status !== "canceled" &&
                (confirmingCancel ? (
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="md"
                      onClick={handleCancel}
                      disabled={canceling}
                      data-testid="plan-cancel-confirm-button"
                    >
                      {canceling ? "Скасовуємо…" : "Точно скасувати?"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => setConfirmingCancel(false)}
                      disabled={canceling}
                    >
                      Ні, лишити
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setConfirmingCancel(true)}
                    data-testid="plan-cancel-button"
                  >
                    Скасувати Pro
                  </Button>
                ))}
            </>
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
        {portalError ? (
          <p
            role="alert"
            data-testid="plan-portal-error"
            className="text-sm text-danger-strong"
          >
            {portalError}
          </p>
        ) : null}
        {cancelError ? (
          <p
            role="alert"
            data-testid="plan-cancel-error"
            className="text-sm text-danger-strong"
          >
            {cancelError}
          </p>
        ) : null}
      </div>
    </SettingsGroup>
  );
}

export const __PLAN_SECTION_PORTAL_UNAVAILABLE = BILLING_PORTAL_UNAVAILABLE;
