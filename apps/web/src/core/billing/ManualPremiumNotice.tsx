import { useState } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Notice } from "@shared/components/ui/Notice";
import { manualPremiumNoticeMessages as COPY } from "@shared/i18n/uk.manualPremium";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { formatKyivLongDate } from "@shared/lib/time/kyivTime";
import { usePlan } from "./usePlan";

/**
 * Рядок про ручний Premium на хабі (спека
 * `docs/work/specs/manual-premium-request.md`, Б-2 → (Б)): «як у пробному
 * періоді». Trial-банера в коді вже немає (наджі знято 2026-10-09), тож
 * форма – `Notice`, а правило попередження – із записаного рішення про trial.
 *
 * - після видачі: «Premium відкрито до <дата>», закривається, показ один на
 *   видачу (ключ зі строком кінця);
 * - за ≤ {@link MANUAL_PREMIUM_WARN_DAYS} доби до кінця: «Premium діє до
 *   <дата>», закривається окремо;
 * - за ≤ 24 год до кінця закриття не діє (sticky).
 *
 * Founder-байпас і безстроковий internal-грант мають `currentPeriodEnd =
 * null`, reverse trial – `state: "trial"`: рядка вони не отримують.
 */

/**
 * Попередження за 2 доби до кінця, sticky в останню добу. Джерело:
 * `docs/work/specs/access-tiers.md`, § Рішення дизайну, пункт «Сповіщення:
 * лише банер у застосунку» (інтервʼю 2026-09-27).
 */
export const MANUAL_PREMIUM_WARN_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ManualPremiumStage = "granted" | "warning" | "sticky";

export interface ManualPremiumNoticeState {
  stage: ManualPremiumStage;
  /** ISO кінця доступу, він же частина ключа закриття. */
  periodEnd: string;
}

/** Чиста функція стану рядка: тестується без рендеру. */
export function manualPremiumNoticeState(
  input: {
    accessState: string | null | undefined;
    provider: string | null | undefined;
    currentPeriodEnd: string | null | undefined;
  },
  now: number = Date.now(),
): ManualPremiumNoticeState | null {
  const { accessState, provider, currentPeriodEnd } = input;
  if (accessState !== "pro" || provider !== "manual" || !currentPeriodEnd) {
    return null;
  }
  const end = Date.parse(currentPeriodEnd);
  if (Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0) return null;
  const stage: ManualPremiumStage =
    left <= DAY_MS
      ? "sticky"
      : left <= MANUAL_PREMIUM_WARN_DAYS * DAY_MS
        ? "warning"
        : "granted";
  return { stage, periodEnd: currentPeriodEnd };
}

function dismissKey(state: ManualPremiumNoticeState): string {
  // Sticky закривається як попередження, але закриття ігнорується.
  const stage = state.stage === "granted" ? "granted" : "warning";
  return `${state.periodEnd}|${stage}`;
}

export function ManualPremiumNotice() {
  const { access, subscription } = usePlan();
  const state = manualPremiumNoticeState({
    accessState: access?.state,
    provider: subscription?.provider,
    currentPeriodEnd: subscription?.currentPeriodEnd,
  });
  const [dismissed, setDismissed] = useState(
    () => safeReadStringLS(STORAGE_KEYS.MANUAL_PREMIUM_NOTICE_DISMISSED) ?? "",
  );

  if (!state) return null;
  const key = dismissKey(state);
  if (state.stage !== "sticky" && dismissed === key) return null;

  const date = formatKyivLongDate(state.periodEnd) ?? "";
  const text = (
    state.stage === "granted" ? COPY.granted : COPY.warning
  ).replace("{date}", date);

  const onDismiss = () => {
    safeWriteLS(STORAGE_KEYS.MANUAL_PREMIUM_NOTICE_DISMISSED, key);
    setDismissed(key);
  };

  return (
    <Notice
      tone={state.stage === "granted" ? "muted" : "ink"}
      role="status"
      className="mx-4 mt-2 shrink-0"
      data-testid="manual-premium-notice"
      action={
        state.stage === "sticky" ? undefined : (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {COPY.dismiss}
          </Button>
        )
      }
    >
      {text}
    </Notice>
  );
}
