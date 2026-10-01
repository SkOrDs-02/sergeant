/** @status Active */

import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { LAST_UPDATED } from "./legalShared";
import { privacyDocument } from "./privacyDocument";

interface PrivacyPolicySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Політика приватності в аркуші: той самий `privacyDocument`, що й сторінка
 * `/legal/privacy`, але без виходу з поточного екрана.
 *
 * AI-CONTEXT: існує заради кроку згоди в онбордингу
 * (`core/onboarding/OnboardingConsentStep.tsx`). Перехід на `/legal/privacy`
 * губив би незавершений онбординг: обрані модулі живуть у стані
 * `WelcomeScreen`, а повернення стрілкою «назад» ремонтує екран з нуля.
 * Аркуш лишає все на місці, а закриття (кнопка, Escape, «назад») повертає
 * людину на крок із тим самим вибором.
 *
 * Монтується ліниво й лише після тапу, тож текст політики не важить на шляху
 * до першого екрана.
 */
export function PrivacyPolicySheet({ open, onClose }: PrivacyPolicySheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={privacyDocument.title}>
      <div className="space-y-4 pb-2">
        <p className="text-style-body text-muted">{privacyDocument.intro}</p>
        <p className="text-style-caption text-subtle">
          {messages.legal.lastUpdatedPrefix} {LAST_UPDATED}
        </p>
        {privacyDocument.sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-line bg-panel p-4"
          >
            <h3 className="text-style-label font-semibold text-text">
              {section.title}
            </h3>
            <div className="mt-2 space-y-2 text-style-label text-muted">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
        <div className="rounded-2xl border border-warning-soft bg-warning-soft/40 p-3 text-left text-style-caption text-text">
          <strong>Founder/lawyer review gate:</strong>{" "}
          {messages.legal.reviewGateNotice}
        </div>
      </div>
    </Sheet>
  );
}
