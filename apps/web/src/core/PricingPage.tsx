import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@shared/lib/ui/cn";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { useToast } from "@shared/hooks/useToast";
import { useLocale } from "@shared/i18n/useLocale";
import type { BillingCheckoutResponse } from "@sergeant/api-client";
import { openHubSettingsSection } from "@shared/lib/modules/hubNav";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { captureException } from "./observability/sentry";
import { usePlan } from "./billing";
import { useAuthOptional } from "./auth/AuthContext";
import { SIGN_IN_PATH } from "./app/appPaths";
import { WaitlistForm } from "./pricing/WaitlistForm";
import { buildTiers, type Tier } from "./pricing/pricingTiers";
import { LegalLinks } from "./legal/LegalLinks";

/**
 * Phase 7 D3 — Pricing tiers (one paid tier).
 *
 * Decision locked в `docs/design/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`:
 *   Free → Premium €X/міс. No Plus/Pro split, no Lifetime, no trial-only gate.
 *
 * v2 chrome: `<MeshBackground>` shell, `<Card prominence="hero">` для Premium,
 * `<Card prominence="default">` для Free, `text-style-display` для ціни,
 * `text-style-headline` для назви тіра.
 *
 * Internals: checkout flow та billing API лишаються незмінні — серверний
 * `BillingPlan` enum усе ще `"plus" | "pro"`, тому під капотом ми передаємо
 * `plan: "pro"`. User-facing label = "Premium" (D3). Перейменування серверного
 * enum — окремий PR на бекенд.
 */

// AI-NOTE: конкретної ціни Premium тут більше немає (B4, браузерний аудит
// 2026-08-05). Premium ще не запущений, оплата не підключена, а внизу
// сторінки стоїть waitlist «Один лист, коли Premium стартує» — число
// «199 ₴ / місяць» прямо йому суперечило. Ціна і каденція тепер приходять
// з каталогу (`tiers.premiumPrice` / `tiers.premiumCadence`); повертати
// число слід туди ж, а не хардкодом у компонент.

// Defense-in-depth open-redirect guard (audit F4,
// docs/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md). Backend
// returns checkout.url / portal.url (LiqPay / Plata / legacy Stripe);
// додатково валідовуємо host на клієнті — щоб контракт-дрифт чи
// компроментація бекенду не змогли перевести юзера на довільний origin
// у high-trust моменті funnel-у.
const ALLOWED_CHECKOUT_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
  // Phase 7 UA billing — LiqPay (ПриватБанк) checkout host.
  "www.liqpay.ua",
  // Plata by mono (monopay) invoice-page hosts.
  "pay.mbnk.biz",
  "pay.monobank.ua",
]);

// Людські назви провайдерів для кнопок checkout-у.
const PROVIDER_LABELS: Record<string, string> = {
  liqpay: "LiqPay",
  plata: "Plata by mono",
  stripe: "Карткою",
};

function assertAllowedCheckoutUrl(raw: string): string {
  const parsed = new URL(raw, window.location.origin);
  // Same-origin manage-URL (LiqPay/Plata не мають зовнішнього Customer
  // Portal → повертають `${app}/settings?billing=manage`) безпечний за
  // визначенням — не проганяємо через host-allow-list зовнішніх checkout-ів.
  if (parsed.origin === window.location.origin) {
    return parsed.toString();
  }
  if (!ALLOWED_CHECKOUT_HOSTS.has(parsed.host)) {
    throw new Error(`checkout url host not in allow-list: ${parsed.host}`);
  }
  return parsed.toString();
}

export function PricingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutReturnHandledRef = useRef(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Tier["id"] | null>(null);
  const [checkoutResult, setCheckoutResult] =
    useState<BillingCheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const { isPro: isPremiumActive } = usePlan();
  // «Зараз твій план» — твердження про СЕСІЮ, а не про дефолт тарифу. Без
  // цієї перевірки анонімний відвідувач бачив бейдж і disabled-кнопку
  // «Зараз твій план» на Free-картці, хоча жодного акаунта не існує
  // (browser QA 2026-08-23). `useAuthOptional`: у застосунку `AuthProvider`
  // стоїть над роутом завжди, контексту немає лише у юніт-тестах, що
  // монтують сторінку голою — там лишаємо попередню поведінку.
  const auth = useAuthOptional();
  const signedOut = auth?.status === "unauthenticated";
  // Payment-провайдери, доступні юзеру (UA → liqpay/plata). Джерело кнопок
  // checkout-у. 401 → fall through до порожнього списку (default-flow).
  const providersQuery = useQuery({
    queryKey: billingKeys.providers,
    queryFn: ({ signal }) => billingApi.providers({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
    // FUN-1 (аудит 2026-09): без сесії ендпоінт віддає 401 — не питаємо.
    enabled: !signedOut,
  });
  const enabledProviders = providersQuery.data?.providers ?? [];
  // i18n. Resolved messages frozen per-locale у resolver → memo identity
  // stable, `tiers` recomputes лише при locale-flip (rare).
  const { messages } = useLocale();
  const t = messages.pricing;
  const tiers = useMemo(() => buildTiers(t), [t]);

  // Pageview-аналітика. `source` (з useSearchParams) дозволяє розрізнити
  // "user натиснув CTA з paywall" vs "user сам зайшов на /pricing". Залежимо
  // саме від похідного `viewSource`-рядка, а не від усього `searchParams`-
  // обʼєкта: інакше чистка `?checkout=...` нижче (setSearchParams) міняла б
  // референс і повторно слала б PRICING_VIEWED з тим самим source (audit F25
  // + cubic: дубль pageview при поверненні з checkout).
  const viewSource = searchParams.get("source") ?? "direct";
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source: viewSource });
  }, [viewSource]);

  // Checkout повертає юзера на `/pricing?checkout=success` (success_url)
  // або `/pricing?checkout=cancel|cancelled` (cancel_url). `success` означає, що
  // webhook міг ще не долетіти / `billingApi.status` у кеші лишається stale →
  // інвалідовуємо `billingKeys.status` (Hard Rule #2), щоб `usePlan` пере-fetch-нувся
  // і paywall пропустив користувача. Toast із action веде в Settings, де живе
  // керування підпискою. URL чистимо через `setSearchParams({}, { replace: true })`
  // — щоб при reload / share-і URL знову не тригерив toast. ref-guard
  // захищає від StrictMode double-invoke в dev.
  useEffect(() => {
    if (checkoutReturnHandledRef.current) return;
    const checkout = searchParams.get("checkout");
    if (
      checkout !== "success" &&
      checkout !== "cancel" &&
      checkout !== "cancelled"
    )
      return;
    checkoutReturnHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
    if (checkout === "success") {
      void queryClient.invalidateQueries({ queryKey: billingKeys.status });
      toast.success(t.toast.subscriptionActive, undefined, {
        label: t.toast.subscriptionActiveCta,
        // PR-S7 (аудит 2026-09-13 хвиля 5): `navigate("/?tab=settings")`
        // без таргета секції приземляв людину на чотири згорнуті рядки
        // «Загальних» — після скасування форсованого розкриття першої
        // секції (рішення власника 2026-09-11, див. PR-S1) вона НЕ бачила
        // свій щойно активований план узагалі. `openHubSettingsSection`
        // — той самий канал, яким інактивна Bento-картка й ⌘K вже
        // ведуть у конкретну секцію: перемикає таб на «Налаштування» і
        // скролить/розкриває «Підписка та план» (`#settings-plan`).
        onClick: () => openHubSettingsSection("plan"),
      });
      return;
    }
    toast.info(t.toast.paymentCanceled);
  }, [searchParams, setSearchParams, queryClient, toast, navigate, t]);

  async function handlePremiumCta(provider?: string): Promise<void> {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "pro",
      cta: provider ? `checkout_${provider}` : "checkout",
    });
    setCheckoutPlan("premium");
    setCheckoutError(null);
    setCheckoutResult(null);
    try {
      // Server `BillingPlan` enum усе ще `"plus" | "pro"` — D3 змінює лише
      // UI-label, не серверний контракт. `provider` (Phase 7 UA billing) —
      // LiqPay/Plata; коли не передано, server бере перший enabled для країни.
      const checkout = await billingApi.createCheckout(
        provider
          ? { plan: "pro", provider: provider as "liqpay" | "plata" | "stripe" }
          : { plan: "pro" },
      );
      setCheckoutResult(checkout);
      trackEvent(ANALYTICS_EVENTS.CHECKOUT_OPENED, {
        plan: "pro",
        mode: checkout.mode,
      });
      // Audit F4: refuse to navigate if server returned a non-allowlisted host.
      const safeUrl = assertAllowedCheckoutUrl(checkout.url);
      window.location.assign(safeUrl);
      return;
    } catch (err) {
      captureException(err, {
        tags: { scope: "pricing-checkout-redirect" },
      });
      setCheckoutError(t.errors.checkoutUnavailable);
      const anchor = document.getElementById("waitlist-anchor");
      if (anchor && typeof anchor.scrollIntoView === "function") {
        // `block: "nearest"` (not "start") — the waitlist section sits near
        // the end of the page; aligning it to the viewport TOP over-scrolls
        // past it, revealing the trailing padding below the footer as a
        // dead empty zone (round-2 UI audit X5). "nearest" scrolls only as
        // far as needed to bring it into view.
        anchor.scrollIntoView({
          behavior: motionScrollBehavior(),
          block: "nearest",
        });
      }
    } finally {
      setCheckoutPlan(null);
    }
  }

  function handleFreeCta(): void {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "free",
      cta: "free",
    });
    // Downgrade Premium → Free: Stripe legacy — через Customer Portal у
    // Settings; LiqPay/Plata — через «Скасувати Premium» у Settings. Тут Free
    // CTA лишається disabled для Premium-юзерів.
    if (isPremiumActive) return;
    // Free-тір вже доступний за замовчуванням — нікуди не ведемо.
  }

  /** Гостьова гілка Free-CTA: єдина осмислена дія тут — завести акаунт. */
  function handleSignInCta(): void {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "free",
      cta: "sign_in",
    });
    navigate(SIGN_IN_PATH);
  }

  // Manage subscription — initiative 0010 Phase 4.2 residual. Активний
  // subscriber бачить "Керувати підпискою" замість "Спробувати Premium":
  // POST /api/billing/portal → URL → redirect.
  //   • Stripe legacy → Stripe Customer Portal.
  //   • LiqPay/Plata → same-origin `/settings?billing=manage` (порталу нема).
  // 409 `NO_BILLING_CUSTOMER` — локальний plan='pro' без provider customer
  // (manual/internal upgrade) → саппорт. 503 = billing вимкнено → fallback.
  async function handleManageSubscription(): Promise<void> {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "pro",
      cta: "manage_subscription",
    });
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await billingApi.createPortal();
      // Audit F4: refuse to navigate if server returned a non-allowlisted host.
      const safeUrl = assertAllowedCheckoutUrl(url);
      window.location.assign(safeUrl);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: unknown }).status
          : undefined;
      if (status === 409) {
        setPortalError(t.errors.portalNoBillingCustomer);
      } else if (status === 503) {
        setPortalError(t.errors.portalUnavailable);
      } else {
        captureException(err, {
          tags: { scope: "pricing-checkout-redirect" },
        });
        setPortalError(t.errors.portalGeneric);
      }
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <MeshBackground className="min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <main
        id="main"
        tabIndex={-1}
        className="min-h-full w-full shrink-0 outline-none"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* `pb-4`, not `pb-12`: `<main>` already reserves
            `max(1.25rem, env(safe-area-inset-bottom))` below this div, and
            the footer is the last element — stacking a full 48px on top of
            that left a dead scrollable gap under the footer, most visible
            after the waitlist-redirect auto-scroll (round-2 UI audit X5). */}
        <div className="max-w-5xl mx-auto px-5 pb-4 space-y-10">
          <header className="flex items-center gap-3 pt-6 pb-2">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => navigate(-1)}
              aria-label={t.backLabel}
            >
              <Icon name="chevron-left" size="lg" />
            </Button>
            <h1 className="text-style-title text-text">{t.pageTitle}</h1>
          </header>

          <section className="space-y-3 text-center">
            <h2 className="text-style-headline text-text leading-tight">
              {t.hero.headlineLine1}
              <br />
              {t.hero.headlineLine2}
            </h2>
            <p className="text-style-body text-muted max-w-2xl mx-auto">
              {t.hero.subtitle}
            </p>
            {checkoutResult ? (
              <p className="text-style-label text-success-strong">
                {t.status.checkoutCreatedPrefix} ({checkoutResult.mode} mode).
              </p>
            ) : null}
            {checkoutError ? (
              <p className="text-style-label text-danger-strong" role="alert">
                {checkoutError}
              </p>
            ) : null}
            {portalError ? (
              <p className="text-style-label text-danger-strong" role="alert">
                {portalError}
              </p>
            ) : null}
          </section>

          <section
            className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full"
            aria-label={t.plansAriaLabel}
          >
            {tiers.map((tier, idx) => {
              const isPremium = tier.id === "premium";
              const isCurrent =
                !signedOut &&
                ((isPremium && isPremiumActive) ||
                  (!isPremium && !isPremiumActive));
              const checkoutLoading = checkoutPlan === tier.id;
              // Для активного Premium-юзера Premium-CTA веде у manage-flow
              // (Stripe Portal або in-app Settings для LiqPay/Plata) —
              // Phase 4.2 residual з initiative 0010. Для не-subscriber —
              // звичайний checkout.
              const ctaLabel = isPremium
                ? isPremiumActive
                  ? portalLoading
                    ? t.cta.openingPortal
                    : t.cta.manageSubscription
                  : checkoutLoading
                    ? t.cta.openingCheckout
                    : t.cta.tryPremium
                : signedOut
                  ? t.cta.signInToStart
                  : isPremiumActive
                    ? t.cta.switchToFree
                    : t.cta.currentPlan;
              const ctaDisabled = isPremium
                ? isPremiumActive
                  ? portalLoading
                  : checkoutLoading
                : // Free CTA: disabled both для активного Free-юзера
                  // (вже ваш план) і для Premium-юзера (downgrade /
                  // cancel живе у Settings, не тут). Для гостя вона,
                  // навпаки, єдина дія на екрані — вхід.
                  !signedOut;
              // NB: handlePremiumCta приймає optional `provider` — не можна
              // передавати його прямо в onClick (MouseEvent став би provider).
              const onPremiumClick = isPremiumActive
                ? handleManageSubscription
                : () => void handlePremiumCta(enabledProviders[0]);
              // Кілька UA-провайдерів → показуємо кнопку на кожен (вибір на
              // checkout). Один/нуль → звичайна одна CTA (server-default).
              const showProviderChoice =
                isPremium && !isPremiumActive && enabledProviders.length > 1;
              // Premium — «чорнило хаба», не hero-градієнт Фініка. До
              // 2026-09-24 картка рендерилась `module="finyk"
              // prominence="hero"` («Чорнило» v3.1 § 3), але Тарифи живуть
              // на нейтральному хабі, а Premium відкриває всі чотири модулі,
              // тож teal читався як чужий акцент (критика екранів
              // 2026-09-23; рішення власника 2026-09-24 після порівняння
              // двох живих кадрів). Заливка та сама, що в primary-кнопки
              // хаба: stone-800 у світлій темі, інвертована світла плитка з
              // темним чорнилом у «Чорнилі». Same JSX block serves both
              // tiers, so ink tone must branch on `isPremium`.
              const inkTone = "text-hero-ink dark:text-brand-900";
              const headingTone = isPremium ? inkTone : "text-text";
              // Чорнило без альфи (A9, рішення власника 2026-10-01): на
              // Premium-картці приглушені рівні `muted`/`subtle` раніше були
              // `/95` і `/90` від `hero-ink`. Тепер це те саме повне чорнило,
              // а ієрархію тримають кегль (`text-style-caption` для лімітів)
              // і ваги, не прозорість. Храповик `heroInkAlpha` = 0.
              const mutedTone = isPremium ? inkTone : "text-muted";
              const subtleTone = isPremium ? inkTone : "text-subtle";
              const checkTone = isPremium ? inkTone : "text-brand-strong";
              // Solid-кнопка має ту саму заливку, що й чорнильна картка
              // (stone-800 / світла плитка в «Чорнилі»), тож на Premium
              // вона зливалась із фоном. Інверсія: світла плитка на
              // чорнилі, чорнило на світлій плитці, з тими самими hover.
              const premiumCtaInverse =
                "bg-brand-100 text-brand-900 hover:bg-brand-200 active:bg-brand-200 dark:bg-brand-strong dark:text-white dark:hover:bg-brand-900";

              return (
                <Card
                  key={tier.id}
                  as="article"
                  radius="xl"
                  padding="lg"
                  className={cn(
                    "flex flex-col gap-4 motion-safe:animate-stagger-in",
                    isPremium &&
                      "bg-brand-strong border-transparent dark:bg-brand-100",
                  )}
                  // Hard Rule #17: між дітьми стагеру максимум 30 мс,
                  // сумарна затримка ≤150 мс — канонічна форма
                  // `Math.min(index * 30, 150)`. Було `idx * 100`:
                  // виміряно на prod-збірці 0 мс / 100 мс.
                  style={{ animationDelay: `${Math.min(idx * 30, 150)}ms` }}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <header className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={cn("text-style-headline", headingTone)}>
                        {tier.name}
                      </h3>
                      {/* B5 (браузерний аудит 2026-08-05): маркер поточного
                          тарифу жив лише в disabled-кнопці Free-картки, тож
                          підписник не бачив його ніде — його Premium-кнопка
                          зайнята дією «Керувати підпискою». Бейдж тепер
                          стоїть на тій картці, яка активна, для обох станів. */}
                      {isCurrent ? (
                        <Badge
                          data-testid="current-plan-badge"
                          variant={isPremium ? "neutral" : "accent"}
                          // Hero-картка: outline, а не заливка. Вимірювання
                          // на світлому кінці градієнта (teal-700): чистий
                          // `text-hero-ink` дає 5.22:1, а вже 15 % ink-washу
                          // під ним — 3.93:1, тобто нижче AA для 12px-копії.
                          tone={isPremium ? "outline" : "soft"}
                          size="sm"
                          className={cn(
                            "shrink-0",
                            isPremium &&
                              "text-hero-ink border-hero-ink/40 dark:text-brand-900 dark:border-brand-900/40",
                          )}
                        >
                          {t.cta.currentPlan}
                        </Badge>
                      ) : null}
                    </div>
                    <p className={cn("text-style-label", mutedTone)}>
                      {tier.tagline}
                    </p>
                  </header>

                  {/* `text-style-display` має line-height 1, тож нижні
                      виноси «Скоро» (р, у) впирались у рядок каденції під
                      ним (зауваження власника 2026-09-24). Запас під
                      виноси дає сам рядок, а не відступ між блоками. */}
                  <div className="space-y-1">
                    <span
                      className={cn(
                        "block text-style-display tabular-nums leading-[1.15]",
                        headingTone,
                      )}
                    >
                      {tier.price}
                    </span>
                    <span className={cn("block text-style-label", mutedTone)}>
                      {tier.cadence}
                    </span>
                  </div>

                  <ul className="space-y-2 grow">
                    {tier.features.map((f) => {
                      const excluded = f.included === false;
                      return (
                        <li
                          key={f.label}
                          className={cn(
                            "flex items-start gap-2 text-style-label",
                            excluded ? subtleTone : headingTone,
                          )}
                        >
                          <Icon
                            name={excluded ? "close" : "check"}
                            size="md"
                            className={cn(
                              "mt-0.5 shrink-0",
                              excluded ? subtleTone : checkTone,
                            )}
                          />
                          <span className="min-w-0">
                            {/* Іконка декоративна (`Icon` без `title` йде
                                `aria-hidden`), тож стан рядка озвучує текст. */}
                            <span className="sr-only">
                              {excluded
                                ? t.features.excludedSr
                                : t.features.includedSr}{" "}
                            </span>
                            <span>{f.label}</span>
                            {f.limit ? (
                              <span
                                className={cn(
                                  "block text-style-caption",
                                  subtleTone,
                                )}
                              >
                                {f.limit}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {showProviderChoice ? (
                    <div className="flex flex-col gap-2">
                      {enabledProviders.map((p) => (
                        <Button
                          key={p}
                          variant="solid"
                          size="md"
                          className={premiumCtaInverse}
                          onClick={() => void handlePremiumCta(p)}
                          disabled={checkoutLoading}
                        >
                          {checkoutLoading
                            ? t.cta.openingCheckout
                            : `${t.cta.tryPremium} · ${PROVIDER_LABELS[p] ?? p}`}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button
                      // Канон `(variant, tone)`: `solid`/`outline` при
                      // нейтральному тоні — це рівно те, що давали легасі
                      // `primary`/`secondary` (мапа `EMPHASIS_TONE_MAP` у
                      // `Button.tsx`), тобто вигляд не змінився. Храповик
                      // `legacyButton` тернарного виразу не бачить, тож цей
                      // рядок дожив до боргу дизайн-контракту тарифів.
                      variant={isPremium ? "solid" : "outline"}
                      size="md"
                      className={isPremium ? premiumCtaInverse : undefined}
                      onClick={
                        isPremium
                          ? onPremiumClick
                          : signedOut
                            ? handleSignInCta
                            : handleFreeCta
                      }
                      disabled={ctaDisabled}
                    >
                      {ctaLabel}
                    </Button>
                  )}
                </Card>
              );
            })}
          </section>

          <section
            id="waitlist-anchor"
            className="rounded-3xl border border-line bg-panel p-6 sm:p-8 max-w-2xl mx-auto"
          >
            <header className="space-y-2 mb-6">
              <h2 className="text-style-headline text-text">
                {t.waitlist.headline}
              </h2>
              <p className="text-style-label text-muted">
                {t.waitlist.subtitle}
              </p>
            </header>
            <WaitlistForm source="pricing_page" />
          </section>

          <footer className="text-center text-style-caption text-muted space-y-1">
            <p>{t.footer}</p>
            <LegalLinks compact />
          </footer>
        </div>
      </main>
    </MeshBackground>
  );
}
