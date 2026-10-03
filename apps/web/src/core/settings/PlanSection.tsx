import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { isApiError } from "@sergeant/api-client";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { billingApi } from "@shared/api";
import { messages } from "@shared/i18n/uk";
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
 *   • Бейдж плану (Free / Premium).
 *   • Trial-дату (`status === "trialing"` → `currentPeriodEnd` = trial-end),
 *     дату наступного списання (`active`), warning при `canceled`/`past_due`.
 *   • CTA: «Перейти на Premium» (→ `/pricing?source=settings`) для Free;
 *     для legacy `provider === "stripe"` — «Керувати підпискою»
 *     (→ `/api/billing/portal` → Stripe Customer Portal);
 *     для LiqPay/Plata — «Скасувати Premium» (власний cancel, порталу нема).
 *   • Після скасування рядок лишається `active`, а доступ діє до кінця
 *     періоду: це видно лише з `subscription.cancelAtPeriodEnd` — тоді
 *     замість кнопки «Скасувати» показуємо «Підписку скасовано. … діє до …».
 *   • Premium без платіжного провайдера (founder-байпас, `provider: "manual"`,
 *     у тому числі reverse trial) скасовувати нема чого: кнопки немає, є
 *     пояснення. Сервер на `POST /api/billing/cancel` віддав би їм 409.
 *
 * Portal redirect робимо тільки після успішного POST `/api/billing/portal`:
 * endpoint не має GET-форми, тож прямий `location.assign("/api/...")` ламає
 * self-serve billing flow.
 */

const BILLING_PORTAL_UNAVAILABLE =
  "Портал підписки тимчасово недоступний. Спробуй ще раз за хвилину.";
const BILLING_CANCEL_FAILED =
  "Не вдалося скасувати. Спробуй ще раз за хвилину.";
// 409 NO_ACTIVE_SUBSCRIPTION: стан у кеші застарів, активної підписки вже нема.
const BILLING_CANCEL_NOTHING = "Активної підписки, яку можна скасувати, немає.";
// 502 PROVIDER_CANCEL_FAILED: платіжний сервіс відмовив, підписка лишилась.
const BILLING_CANCEL_PROVIDER_FAILED =
  "Платіжний сервіс не підтвердив скасування. Підписка лишається активною, спробуй ще раз за хвилину.";

/** Текст помилки скасування за статусом відповіді сервера (`POST /api/billing/cancel`). */
function cancelErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 409) return BILLING_CANCEL_NOTHING;
    if (err.status === 502) return BILLING_CANCEL_PROVIDER_FAILED;
  }
  return BILLING_CANCEL_FAILED;
}

function cancelScheduledText(
  premiumName: string,
  periodEnd: string | null,
): string {
  return `Підписку скасовано. ${premiumName} діє ${
    periodEnd ? `до ${periodEnd}` : "до кінця оплаченого періоду"
  }.`;
}

function manualGrantText(
  premiumName: string,
  periodEnd: string | null,
): string {
  return `${premiumName} надано без підписки, тож скасовувати нічого.${
    periodEnd ? ` Діє до ${periodEnd}.` : ""
  }`;
}

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
  // Premium без платіжного провайдера: founder-байпас (`id: null`), ручні
  // гранти і reverse trial (`provider: "manual"`). Підписки, яку можна
  // скасувати, тут нема, тож і кнопки нема: раніше вона була, а сервер
  // відповідав `ok` без жодної дії.
  const isManualGrant =
    isPro && (subscription?.provider === "manual" || subscription?.id === null);
  // Скасовано, але доступ діє до кінця періоду: статус рядка лишається
  // `active`, тож відрізнити це від «діє» можна лише за прапорцем.
  const cancelScheduled =
    isPro &&
    !isManualGrant &&
    status !== "canceled" &&
    subscription?.cancelAtPeriodEnd === true;
  // Серверний id тарифу — `pro`, але для людини він зветься «Premium»
  // (рішення D3, див. `core/PricingPage.tsx`). Беремо канонічну назву з
  // i18n, а не хардкодимо: на `/pricing` тариф називався «Premium», а тут
  // і в чаті «Pro», тобто один продукт мав дві назви (browser-QA 2026-09-02).
  const premiumName = messages.pricing.tiers.premiumName;
  // `usePlan` віддає `plan: "free"` як дефолт, ПОКИ запит у польоті — це
  // прямо задокументовано в його типі. Тобто до відповіді сервера платний
  // користувач бачив бейдж «Free», абзац «Ти на безкоштовному тарифі…» і
  // кнопку «Перейти на Premium», яка вела його на /pricing (аудит
  // 2026-09-16, WF-19). `isLoading` у цьому файлі вже читався — але лише
  // задля підпису «Завантаження…» поруч; самі твердження його ігнорували.
  // Плейсхолдер замість назви тарифу — бо «ще не знаю» це не «Free».
  const planLabel = isLoading ? "—" : isPro ? premiumName : "Free";

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
    } catch (err) {
      setCancelError(cancelErrorMessage(err));
      if (isApiError(err) && err.status === 409) {
        // Скасовувати вже нема чого: закриваємо підтвердження й підтягуємо
        // свіжий стан, щоб кнопка не лишалась.
        setConfirmingCancel(false);
        void queryClient.invalidateQueries({ queryKey: billingKeys.status });
      }
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
            variant={isPro && !isLoading ? "accent" : "neutral"}
            tone={isPro && !isLoading ? "solid" : "soft"}
            size="md"
            data-testid="plan-badge"
          >
            {planLabel}
          </Badge>
          {isLoading && (
            <span className="text-style-caption text-subtle">
              Завантаження…
            </span>
          )}
        </div>

        {isPro &&
          status === "trialing" &&
          periodEnd &&
          !cancelScheduled &&
          !isManualGrant && (
            <div data-testid="plan-trial-info" className="space-y-1">
              <span className="text-style-label block">Пробний період</span>
              <p className="text-style-body text-text leading-snug">
                Закінчується {periodEnd}. Після цього підписка стане платною за
                планом з чекауту, скасуй до цієї дати, якщо передумаєш.
              </p>
            </div>
          )}

        {isPro &&
          status === "active" &&
          periodEnd &&
          !cancelScheduled &&
          !isManualGrant && (
            <p
              data-testid="plan-active-info"
              className="text-style-body text-subtle leading-snug"
            >
              Наступне списання: {periodEnd}.
            </p>
          )}

        {cancelScheduled && (
          <p
            data-testid="plan-cancel-scheduled-info"
            className="text-style-body text-warning-strong leading-snug"
          >
            {cancelScheduledText(premiumName, periodEnd)}
          </p>
        )}

        {isManualGrant && (
          <p
            data-testid="plan-manual-info"
            className="text-style-body text-subtle leading-snug"
          >
            {manualGrantText(premiumName, periodEnd)}
          </p>
        )}

        {isPro && status === "canceled" && (
          <p
            data-testid="plan-canceled-info"
            className="text-style-body text-warning-strong leading-snug"
          >
            Підписку скасовано.
            {periodEnd
              ? ` Доступ до ${premiumName} завершиться ${periodEnd}.`
              : ""}
          </p>
        )}

        {isPro && status === "past_due" && !cancelScheduled && (
          <p
            data-testid="plan-past-due-info"
            className="text-style-body text-danger-strong leading-snug"
          >
            {subscription?.provider === "stripe"
              ? "Останній платіж не пройшов. Онови картку в платіжному порталі, щоб не втратити доступ."
              : "Останній платіж не пройшов. Онови спосіб оплати або спробуй списання знову, щоб не втратити доступ."}
          </p>
        )}

        {!isPro && !isLoading && status !== "canceled" && (
          <p className="text-style-body text-subtle leading-snug">
            Ти на безкоштовному плані. {premiumName} відкриває безлімітний чат
            із Сержантом, CloudSync між пристроями, авто-Mono sync і експорт
            CSV/PDF.
          </p>
        )}

        {!isPro && status === "canceled" && (
          <p
            data-testid="plan-ended-info"
            className="text-style-body text-warning-strong leading-snug"
          >
            Підписка {premiumName} завершилася
            {periodEnd ? ` ${periodEnd}` : ""}. Можеш поновити її в будь-який
            момент.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {isPro ? (
            <>
              {/* Customer Portal є лише у Stripe. Для liqpay/plata керування =
                  кнопка «Скасувати Premium» нижче (порталу нема). Для manual і
                  вже скасованої підписки кнопки немає (див. isManualGrant /
                  cancelScheduled). */}
              {subscription?.provider === "stripe" && (
                <Button
                  variant="solid"
                  size="md"
                  onClick={handleManage}
                  disabled={redirecting}
                  data-testid="plan-manage-button"
                  className="gap-2"
                >
                  <Icon name="credit-card" size="md" />
                  Керувати підпискою
                </Button>
              )}
              {status !== "canceled" &&
                !cancelScheduled &&
                !isManualGrant &&
                (confirmingCancel ? (
                  <div className="flex gap-2">
                    <Button
                      variant="soft"
                      tone="danger"
                      size="md"
                      onClick={handleCancel}
                      disabled={canceling}
                      data-testid="plan-cancel-confirm-button"
                    >
                      {canceling ? "Скасовую…" : "Точно скасувати?"}
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setConfirmingCancel(false)}
                      disabled={canceling}
                    >
                      Ні, лишити
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setConfirmingCancel(true)}
                    data-testid="plan-cancel-button"
                  >
                    Скасувати {premiumName}
                  </Button>
                ))}
            </>
          ) : isLoading ? null : (
            <Button
              variant="solid"
              size="md"
              onClick={handleUpgrade}
              data-testid="plan-upgrade-button"
              className="gap-2"
            >
              <Icon name="sergeant" size="md" />
              Перейти на Premium
            </Button>
          )}
        </div>
        {portalError ? (
          <p
            role="alert"
            data-testid="plan-portal-error"
            className="text-style-body text-danger-strong"
          >
            {portalError}
          </p>
        ) : null}
        {cancelError ? (
          <p
            role="alert"
            data-testid="plan-cancel-error"
            className="text-style-body text-danger-strong"
          >
            {cancelError}
          </p>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
