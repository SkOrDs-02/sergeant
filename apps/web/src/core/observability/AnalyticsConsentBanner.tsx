/**
 * @status Active
 * @owner @Skords-01
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { messages } from "@shared/i18n/uk";
import { useAuth } from "../auth/AuthContext";
import { LEGAL_PRIVACY_PATH } from "../app/appPaths";
import { setAnalyticsConsent } from "./analyticsConsent";

const copy = messages.privacy.analyticsConsent;

/**
 * Банер згоди на продуктову аналітику при першому запуску (рішення власника
 * 2026-09-29, аудит external-critique § 1.3).
 *
 * Неблокуючий: плаває знизу над таббаром (`--sgt-bottom-nav-inset`, той самий
 * інсет, що читають `Sheet` і тости), фокус не краде, решту екрана не
 * закриває. Вибір іде в `setAnalyticsConsent` — те саме джерело правди, що й
 * тумблер у Налаштування → Приватність; для залогіненого дублюється на
 * сервер, гість лишає рішення на пристрої. Після вибору
 * `AnalyticsConsentGate` знімає банер, і він не повертається.
 *
 * Монтується лише через `AnalyticsConsentGate` і ліниво, тож не важить на
 * критичному шляху.
 */
export default function AnalyticsConsentBanner() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const choose = (granted: boolean) => {
    if (saving) return;
    setSaving(true);
    // Локально й одразу: PostHog opt-in/out і зникнення банера без мережі.
    setAnalyticsConsent(granted);
    if (user) {
      meApi.updatePreferences({ analytics: granted }).catch((err: unknown) => {
        // Вибір на пристрої вже діє; сервер підтягнеться тумблером.
        logger.warn("[analyticsConsent] banner persist failed", err);
      });
    }
  };

  return (
    <section
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
          variant="outline"
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
