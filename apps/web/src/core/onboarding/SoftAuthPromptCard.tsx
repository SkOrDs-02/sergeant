/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useMemo } from "react";
import {
  SOFT_AUTH_COPY_EXPERIMENT,
  assignVariant,
  type SoftAuthCopyVariant,
} from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { webKVStore } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { dismissSoftAuth } from "./vibePicks";
import { messages } from "@shared/i18n/uk";
import { coreMessages } from "@shared/i18n/uk.core";
import { useHubBannerSlot } from "../hub/bannerBudget";

/**
 * Inline dashboard card offering cloud sync *after* the user has logged
 * their first real entry. Intentionally not a modal — we never interrupt
 * the user; they can ignore it until they're ready.
 *
 * Мова H: коротка причина синхронізації й дві текстові дії. Призначення
 * варіанта та контекст накопичених записів лишаються в телеметрії;
 * оформлення й копі не повертають маркетинговий банер.
 */
export function SoftAuthPromptCard({
  onOpenAuth,
  onDismiss,
  entryCount = 0,
  sessionDays = -1,
}: {
  onOpenAuth: () => void;
  onDismiss?: () => void;
  entryCount?: number;
  /**
   * Days the user has actively returned (snapshot from
   * `getSessionDays()` in HubDashboard). `-1` means «not measured
   * yet» — copy resolver treats it as no signal.
   */
  sessionDays?: number;
}) {
  // Бюджет банерів хабу (F3, 2026-09-01): пріоритет 2, після попередження про локальні дані й демо.
  const hasSlot = useHubBannerSlot("softAuth");
  const variant = useMemo<SoftAuthCopyVariant>(
    () =>
      assignVariant(
        webKVStore,
        SOFT_AUTH_COPY_EXPERIMENT,
      ) as SoftAuthCopyVariant,
    [],
  );

  useEffect(() => {
    if (!hasSlot) return;
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN, {
      placement: "dashboard",
      variant,
      entryCount,
      sessionDays,
    });
  }, [variant, entryCount, sessionDays, hasSlot]);

  const handleOpenAuth = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_AFTER_VALUE, { variant });
    onOpenAuth();
  };

  const handleDismiss = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_DISMISSED, { variant });
    dismissSoftAuth();
    onDismiss?.();
  };

  if (!hasSlot) return null;

  return (
    <div className="border-y border-line py-3" data-variant={variant}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-style-body font-semibold text-text">
            {coreMessages.onboardingPrompts.syncTitle}
          </p>
          <p className="text-style-label text-muted mt-1">
            {coreMessages.onboardingPrompts.syncReason}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              type="button"
              onClick={handleOpenAuth}
              variant="outline"
              tone="neutral"
              size="sm"
            >
              {messages.auth.createAccount}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
            >
              {messages.actions.later}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
