/**
 * Mobile port of `apps/web/src/core/onboarding/SoftAuthPromptCard.tsx`.
 *
 * Shown on the hub dashboard *after* the user has logged their first
 * real entry, prompting them to create an account so their data syncs
 * across devices. Intentionally inline (never a modal) — we do not
 * interrupt the user.
 *
 * Deferred vs web:
 *   - `trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN, …)` etc. Mobile
 *     analytics sink is not wired yet (Phase 6). Optional `onShown` /
 *     `onOpenAuth` / `onDismissed` callbacks let the caller plug
 *     console / Sentry hooks in once they're ready.
 *   - The web copy says «20 секунд» referring to the Better Auth web
 *     form. Better Auth's native sheet is also one-screen, so the
 *     copy is preserved verbatim.
 */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { dismissSoftAuth, hapticTap } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { mobileKVStore } from "@/lib/storage";

export interface SoftAuthPromptCardProps {
  /** Called when the user taps "Створити акаунт". Caller is
   *  responsible for opening the Better Auth native sheet. */
  onOpenAuth: () => void;
  /** Called after the user taps "Пізніше". The dismissal flag is
   *  persisted before this fires, so the card stays hidden on
   *  subsequent renders. */
  onDismiss?: () => void;
  /** Optional analytics hook (mount-level). */
  onShown?: () => void;
  /** Optional analytics hook (CTA). */
  onAuthOpened?: () => void;
  /** Optional analytics hook (dismiss). */
  onDismissed?: () => void;
}

export function SoftAuthPromptCard({
  onOpenAuth,
  onDismiss,
  onShown,
  onAuthOpened,
  onDismissed,
}: SoftAuthPromptCardProps) {
  useEffect(() => {
    onShown?.();
    // Mount-only event, parity with web placement={"dashboard"}.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenAuth = () => {
    hapticTap();
    onAuthOpened?.();
    onOpenAuth();
  };

  const handleDismiss = () => {
    onDismissed?.();
    dismissSoftAuth(mobileKVStore);
    onDismiss?.();
  };

  return (
    <View
      className="overflow-hidden rounded-2xl border border-brand-500/30 bg-brand-50/70 p-4"
      testID="soft-auth-prompt"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15">
          <Text className="text-lg">☁️</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-fg">
            Зберегти на всіх пристроях?
          </Text>
          <Text className="mt-1 text-xs leading-relaxed text-fg-muted">
            Акаунт синхронізує твої дані між телефоном і браузером. 20 секунд.
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onPress={handleOpenAuth}
              testID="soft-auth-open"
            >
              Створити акаунт
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Відкласти"
              onPress={handleDismiss}
              className="rounded-xl px-3 py-2 active:opacity-60"
              testID="soft-auth-dismiss"
            >
              <Text className="text-xs text-fg-muted">Пізніше</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
