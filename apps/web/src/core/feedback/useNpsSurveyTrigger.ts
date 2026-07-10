/**
 * @status Active
 * @owner @Skords-01
 */
import { useEffect } from "react";
import { ANALYTICS_EVENTS, type User } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";
import { useAuth } from "../auth/AuthContext";
import { accountAgeDays } from "./accountAge";

export { accountAgeDays } from "./accountAge";

/**
 * NPS-опитування через PostHog Surveys (GTM § 3.2 — «NPS опитування
 * після 7 днів використання»).
 *
 * Саме опитування живе у PostHog dashboard (Surveys → NPS, popover);
 * клієнт лише постачає тригер: коли вік акаунта сягає ≥ 7 днів, один
 * раз на browser profile стріляє `nps_survey_eligible`, на який
 * survey таргетиться display-умовою «user sends event». Показ,
 * throttling («не показувати повторно N днів»), збір відповіді і
 * `survey sent`-події — цілком на боці posthog-js; жодного власного
 * UI тут немає. Setup-довідка:
 * `docs/03-operations/observability/feedback-loop.md`.
 *
 * Вік акаунта — цілі доби від `user.createdAt` (UTC, той самий
 * підхід, що й trait `signup_date` в `identifyTraits.ts` — точність
 * до доби достатня, Kyiv-межі дня тут нічого не змінюють). Legacy
 * акаунти з `createdAt: null` тригер пропускають — краще не показати
 * survey, ніж показати його новому користувачу.
 *
 * Idempotency — той самий патерн, що `useActivationV2`
 * (`sergeant.activation_v2_fired`): localStorage-флаг тримає
 * fire-once межу через re-mounts і re-renders; скидання флага у
 * devtools ре-armить тригер для dev-replay.
 */

const FIRED_FLAG_KEY = "sergeant.nps_survey_eligible_fired";

export const NPS_MIN_ACCOUNT_AGE_DAYS = 7;

function hasAlreadyFired(): boolean {
  return safeReadLS<boolean>(FIRED_FLAG_KEY) === true;
}

function markFired(): void {
  safeWriteLS(FIRED_FLAG_KEY, true);
}

/**
 * Fire-once тригер `nps_survey_eligible`. Приймає `user` явно, щоб
 * логіка тестувалась без AuthProvider; production wire-up —
 * `NpsSurveyGate` нижче.
 */
export function useNpsSurveyTrigger(user: User | null): void {
  useEffect(() => {
    if (!user) return;
    const age = accountAgeDays(user.createdAt);
    if (age === null || age < NPS_MIN_ACCOUNT_AGE_DAYS) return;
    if (hasAlreadyFired()) return;

    markFired();
    trackEvent(ANALYTICS_EVENTS.NPS_SURVEY_ELIGIBLE, {
      account_age_days: age,
    });
  }, [user]);
}

/**
 * Side-effect-only gate для `AppShell` — дзеркалить
 * `NutritionBootGate`/`FinykBootGate` патерн: рендериться app-wide,
 * нічого не малює, тригерить NPS-eligibility для залогіненого юзера.
 */
export function NpsSurveyGate(): null {
  const { user } = useAuth();
  useNpsSurveyTrigger(user);
  return null;
}
