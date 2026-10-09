/**
 * @status Active
 * @owner @Skords-01
 */
import { useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import {
  CONSENT_BANNER_INSET_VAR,
  useBottomInsetVar,
} from "@shared/hooks/useBottomInsetVar";
import { messages } from "@shared/i18n/uk";
import { LEGAL_PRIVACY_PATH } from "../app/appPaths";
import { useAnalyticsConsentChoice } from "./useAnalyticsConsentChoice";

const copy = messages.privacy.analyticsConsent;

/**
 * Банер згоди на продуктову аналітику (рішення власника 2026-09-29, аудит
 * external-critique § 1.3).
 *
 * З 2026-10-01 це ЗАПАСНИЙ шлях: нові люди відповідають кроком онбордингу
 * (`OnboardingConsentStep`), а `AnalyticsConsentGate` не показує банер на
 * `/welcome` і `/onboarding/*`. Тут лишається той, хто вже минув онбординг і
 * ніколи не відповідав.
 *
 * Неблокуючий: плаває знизу над таббаром (`--sgt-bottom-nav-inset`, той самий
 * інсет, що читають `Sheet` і тости), фокус не краде, решту екрана не
 * закриває. Запис вибору — `useAnalyticsConsentChoice` (спільний із кроком
 * онбордингу). Після вибору `AnalyticsConsentGate` знімає банер, і він не
 * повертається.
 *
 * Без темних патернів: «Дозволити» і «Ні, дякую» однакового вигляду й
 * розміру, як у кроці онбордингу. Залита згода поруч з обведеною відмовою
 * підштовхувала б до «так» (рішення власника 2026-10-01).
 *
 * Монтується лише через `AnalyticsConsentGate` і ліниво, тож не важить на
 * критичному шляху.
 */
export default function AnalyticsConsentBanner() {
  const { choose, saving } = useAnalyticsConsentChoice();
  const bannerRef = useRef<HTMLElement>(null);
  useBottomInsetVar(bannerRef, CONSENT_BANNER_INSET_VAR);

  return (
    <section
      ref={bannerRef}
      aria-labelledby="analytics-consent-title"
      data-testid="analytics-consent-banner"
      className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-line bg-panel p-4 shadow-e2"
      style={{
        bottom:
          "calc(max(var(--sgt-bottom-nav-inset, 0px), env(safe-area-inset-bottom, 0px)) + 0.75rem)",
      }}
    >
      <h2
        id="analytics-consent-title"
        className="text-style-headline text-content"
      >
        {copy.title}
      </h2>
      <p className="mt-1 text-style-body text-subtle leading-relaxed">
        {copy.body} {copy.changeLater}
      </p>
      <Link
        to={LEGAL_PRIVACY_PATH}
        className="mt-1 inline-flex min-h-[44px] items-center rounded-md text-style-body text-content underline underline-offset-2 focus-ring"
      >
        {copy.privacyLink}
      </Link>
      <div className="mt-1 flex gap-2">
        <Button
          type="button"
          variant="solid"
          size="md"
          className="min-h-[44px] flex-1"
          onClick={() => choose(true)}
          disabled={saving}
        >
          {copy.accept}
        </Button>
        <Button
          type="button"
          variant="solid"
          size="md"
          className="min-h-[44px] flex-1"
          onClick={() => choose(false)}
          disabled={saving}
        >
          {copy.decline}
        </Button>
      </div>
    </section>
  );
}
