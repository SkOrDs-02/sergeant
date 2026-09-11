/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Одна форма подачі «чому не можна» на всі поверхні.
 *
 * Зразок — `core/hub/chat/ChatAuthGate.tsx`, і це рішення власника
 * 2026-09-11, не смак: **фіча лишається видимою, дія не стартує, поруч
 * стоїть причина і одна кнопка.** Ховати недоступне ми не ховаємо, бо
 * зникла кнопка не пояснює нічого, а людина встигає вкласти роботу в
 * дію, яка не почнеться.
 *
 * AI-CONTEXT: компонент навмисно НЕ вирішує, коли себе показати, і НЕ
 * знає, яка саме фіча його відрендерила. Він рендерить `AccessDenial` —
 * ту саму структуру, що приходить і з pre-gate (`useCanUse`), і з
 * розбору помилки після старту (`resolveDenial`). Саме тому обидві
 * подачі однакові за побудовою: різних шляхів до різного вигляду тут
 * просто немає.
 *
 * Навігація — звичайний `<a href>`, як у `ChatAuthGate`: компонент
 * монтується і поза `<Router>` у частині юніт-тестів, а повний перехід
 * на екран входу чи тарифів тут доречний.
 */
import { Icon } from "@shared/components/ui/Icon";
import type { AccessDenial } from "@shared/lib/api/accessDenial";

import { PRICING_PATH, PROFILE_PATH, SIGN_IN_PATH } from "../app/appPaths";
import { accessDenialCopy } from "./accessDenialCopy";

/** Куди веде кнопка причини. `null` — кнопки немає. */
function actionHref(denial: AccessDenial): string | null {
  switch (denial.reason) {
    case "sign-in-required":
    case "wrong-account":
      return SIGN_IN_PATH;
    case "plan-required":
      return PRICING_PATH;
    case "quota-exhausted":
      return denial.preset ? PROFILE_PATH : null;
    case "provider-down":
    case "offline":
      return null;
  }
}

export interface AccessDenialNoticeProps {
  denial: AccessDenial;
  /** Показати хрестик закриття. Без обробника хрестика немає. */
  onDismiss?: (() => void) | undefined;
  className?: string | undefined;
}

export function AccessDenialNotice({
  denial,
  onDismiss,
  className,
}: AccessDenialNoticeProps) {
  const copy = accessDenialCopy(denial);
  const href = actionHref(denial);

  return (
    <div
      role="note"
      data-testid="access-denial-notice"
      data-reason={denial.reason}
      className={`rounded-2xl border border-line bg-panel px-4 py-4 space-y-3 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          name="lock"
          size="sm"
          aria-hidden
          className="shrink-0 mt-0.5 text-muted"
        />
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-style-label font-semibold text-text">
            {copy.title}
          </p>
          <p className="text-style-body text-muted leading-snug">{copy.body}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            /* eslint-disable-next-line sergeant-design/no-cyrillic-jsx-literal --
               Каталог `shared/i18n/uk.ts` уперся в `max-lines: 600` (Hard Rule
               #18); той самий компроміс уже стоїть у `ChatAuthGate`. */
            aria-label="Закрити пояснення"
            className="min-h-11 min-w-11 shrink-0 rounded-xl text-style-title leading-none text-muted hover:bg-panelHi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            ×
          </button>
        ) : null}
      </div>
      {href && copy.actionLabel ? (
        <a
          href={href}
          data-testid="access-denial-action"
          className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-2xl bg-primary text-bg font-semibold text-style-label transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 focus-visible:ring-offset-2"
        >
          {copy.actionLabel}
        </a>
      ) : null}
    </div>
  );
}
