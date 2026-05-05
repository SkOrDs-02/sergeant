/**
 * Mobile port of `apps/web/src/core/hub/CrossModulePreview.tsx` (S6.4
 * mobile parity, sprint plan §S6.4 "non-blocking separate PR").
 *
 * Rendered inline on the dashboard exactly once after the user crosses
 * the first-real-entry threshold, demonstrating Sergeant's
 * cross-module USP with a static example pairing two modules. After
 * the user taps the CTA or the dismiss-X, the seen-flag is persisted
 * via `markCrossModulePreviewSeen` and the component never re-renders
 * for that user/device.
 *
 * Per-module copy and persistence live in `@sergeant/shared`
 * (`lib/crossModulePreview.ts`), so web ↔ mobile stay in lock-step;
 * this file is intentionally only the RN/NativeWind shell + telemetry.
 *
 * Telemetry contract — `ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_*` with
 * payload `{ source_module, partner_module }`. Funnel invariant:
 * `SEEN ≥ CLICKED + DISMISSED`. CLICKED:DISMISSED ratio is the
 * primary success metric for the audit hypothesis (S6.4).
 */

import { useCallback, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { Sparkles, X } from "lucide-react-native";

import {
  type DashboardModuleId,
  getCrossModulePreviewCopy,
  hapticTap,
  markCrossModulePreviewSeen,
} from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { mobileKVStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

export interface CrossModulePreviewProps {
  /** Module that owned the user's first real entry. */
  sourceModule: DashboardModuleId;
  /** Called once the card is dismissed (CTA *or* X) so the parent can
   * remove it from the layout the same frame. */
  onClose: () => void;
}

export function CrossModulePreview({
  sourceModule,
  onClose,
}: CrossModulePreviewProps) {
  const copy = getCrossModulePreviewCopy(sourceModule);

  useEffect(() => {
    if (!copy) return;
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_SEEN, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    // Mount-only — `copy` is keyed by `sourceModule` and stable for
    // this render. The persisted `markCrossModulePreviewSeen` flag
    // (set on close/click below) guards against repeat surfaces
    // across reloads, mirroring web.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(() => {
    if (!copy) return;
    hapticTap();
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_CLICKED, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    markCrossModulePreviewSeen(mobileKVStore);
    onClose();
  }, [copy, onClose]);

  const handleDismiss = useCallback(() => {
    if (!copy) return;
    trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_DISMISSED, {
      source_module: copy.sourceModule,
      partner_module: copy.partnerModule,
    });
    markCrossModulePreviewSeen(mobileKVStore);
    onClose();
  }, [copy, onClose]);

  if (!copy) return null;

  return (
    <View
      testID="cross-module-preview"
      accessibilityLabel="Що Sergeant покаже далі"
      className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.dismissAriaLabel}
        onPress={handleDismiss}
        testID="cross-module-preview-dismiss"
        className="absolute right-2 top-2 rounded-xl p-1 active:opacity-70"
      >
        <X size={16} color="#6b7280" />
      </Pressable>

      <View className="flex-row items-start gap-3 pr-6">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
          <Sparkles size={18} color="#0ea5a4" />
        </View>
        <View className="min-w-0 flex-1 gap-2">
          <View className="gap-1">
            <Text className="text-sm font-semibold text-fg-default">
              {copy.title}
            </Text>
            <Text className="text-xs leading-relaxed text-fg-muted">
              {copy.body}
            </Text>
          </View>
          <View className="flex-row">
            <Button
              variant="secondary"
              size="sm"
              onPress={handleClick}
              testID="cross-module-preview-cta"
            >
              {copy.ctaLabel}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
