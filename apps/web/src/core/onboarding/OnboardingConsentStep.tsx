/**
 * @status Active
 * @owner @Skords-01
 */
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { BrandLogo } from "../app/BrandLogo";
import { lazyImport } from "../lib/lazyImport";
import { useAnalyticsConsentChoice } from "../observability/useAnalyticsConsentChoice";

// Текст політики потрібен лише тому, хто тапнув «Про приватність».
const PrivacyPolicySheet = lazyImport(
  () => import("../legal/PrivacyPolicySheet"),
  "PrivacyPolicySheet",
);

const copy = messages.privacy.analyticsConsent;

interface OnboardingConsentStepProps {
  /**
   * Викликається після того, як вибір записано (`setAnalyticsConsent`), тож
   * події, які хост шле далі, вже бачать актуальну згоду.
   */
  onDecided: (granted: boolean) => void;
}

/**
 * Крок онбордингу «Допоможеш зробити Sergeant кращим?» (рішення власника
 * 2026-10-01, аудит external-critique § 1.3): згода на продуктову аналітику
 * стала частиною `/welcome` замість плаваючого банера, що перекривав картки
 * модулів першого екрана.
 *
 * Стоїть ОДРАЗУ ПІСЛЯ вибору модулів і ДО завершення онбордингу. Людина вже
 * отримала те, заради чого прийшла (обрала, з чого почати), а події воронки
 * `onboarding_vibe_picked` / `onboarding_completed` стартують після
 * рішення, тож у PostHog потрапляють, якщо згода є (до рішення SDK мовчить —
 * `opt_out_capturing_by_default`).
 *
 * Без темних патернів: обидві відповіді однакового вигляду й розміру, у
 * природному порядку «так / ні». Запис — `useAnalyticsConsentChoice`, той
 * самий, що в запасному банері (`AnalyticsConsentBanner`): `setAnalyticsConsent`
 * + дублювання на сервер для залогіненого. «Про приватність» відкриває
 * політику в аркуші поверх кроку, тож онбординг нікуди не зникає.
 */
export function OnboardingConsentStep({
  onDecided,
}: OnboardingConsentStepProps) {
  const { choose, saving } = useAnalyticsConsentChoice(onDecided);
  const [policyOpen, setPolicyOpen] = useState(false);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Крок підміняє екран модулів, тож кнопка «Почати», на якій був фокус,
  // зникає з DOM. Без явного переносу фокус лишився б на `<body>`, а
  // скрінрідер не оголосив би нове питання (WCAG 2.4.3).
  useEffect(() => {
    try {
      headingRef.current?.focus({ preventScroll: true });
    } catch {
      /* заголовок від'єднано — відновлювати нічого */
    }
  }, []);

  return (
    <section
      aria-labelledby={headingId}
      data-testid="onboarding-consent-step"
      className="flex flex-col items-center text-center space-y-5"
    >
      <div className="space-y-2">
        <BrandLogo size="md" variant="inline" className="mx-auto" />
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-style-headline text-text outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded-sm"
        >
          {copy.title}
        </h2>
        <p className="text-style-body text-muted leading-relaxed max-w-xs mx-auto">
          {copy.body}
        </p>
        <p className="text-style-caption text-muted max-w-xs mx-auto">
          {copy.changeLater}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPolicyOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-[44px] items-center rounded-md px-1 text-style-label text-text underline underline-offset-2 focus-ring"
      >
        {copy.privacyLink}
      </button>

      <div className="flex w-full gap-2">
        <Button
          type="button"
          variant="solid"
          size="lg"
          className="min-h-[44px] flex-1"
          onClick={() => choose(true)}
          disabled={saving}
        >
          {copy.accept}
        </Button>
        <Button
          type="button"
          variant="solid"
          size="lg"
          className="min-h-[44px] flex-1"
          onClick={() => choose(false)}
          disabled={saving}
        >
          {copy.decline}
        </Button>
      </div>

      {policyOpen ? (
        <Suspense fallback={null}>
          <PrivacyPolicySheet open onClose={() => setPolicyOpen(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}
