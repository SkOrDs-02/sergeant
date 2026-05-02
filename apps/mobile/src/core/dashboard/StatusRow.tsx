/**
 * Sergeant Hub — StatusRow (mobile)
 *
 * Single row in the mobile dashboard's module list. Visual layout
 * mirrors the web `StatusRow` inside `apps/web/src/core/hub/HubDashboard.tsx`:
 * accent bar -> icon tile -> label + description -> quick-stats preview
 * -> chevron. Uses Lucide icons instead of emoji for consistency.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import type { DashboardModuleId, ModulePreview } from "@sergeant/shared";
import { colors } from "@/theme";

import { DASHBOARD_MODULE_RENDER } from "./dashboardModuleConfig";

export interface StatusRowProps {
  id: DashboardModuleId;
  onPress?: (id: DashboardModuleId) => void;
  disabled?: boolean;
  testID?: string;
  preview?: ModulePreview | null;
  /**
   * When `true`, the row is rendered in a muted/greyed-out state and
   * the preview block is replaced by a hint pointing the user at Hub
   * Settings. Driven by the user's onboarding "vibe picks".
   */
  inactive?: boolean;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function hasPreviewContent(preview: ModulePreview | null | undefined): boolean {
  if (!preview) return false;
  if (preview.main || preview.sub) return true;
  if (typeof preview.progress === "number" && preview.progress > 0) return true;
  return false;
}

export const StatusRow = memo(function StatusRow({
  id,
  onPress,
  disabled,
  testID,
  preview,
  inactive,
}: StatusRowProps) {
  const config = DASHBOARD_MODULE_RENDER[id];
  const showPreview = !inactive && hasPreviewContent(preview);
  const showProgress = showPreview && typeof preview?.progress === "number";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        inactive
          ? `${config.label} — неактивний. Увімкнути в налаштуваннях.`
          : `${config.label}: ${config.description}`
      }
      accessibilityHint="Двічі торкнись, щоб відкрити модуль. Утримай і потягни, щоб змінити порядок."
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={() => onPress?.(id)}
      disabled={disabled}
      testID={testID ?? `dashboard-row-${id}`}
      className={`flex-row items-stretch overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 active:opacity-80 ${
        inactive ? "opacity-60" : ""
      }`}
    >
      <View
        className={`w-1.5 ${inactive ? "bg-cream-300" : config.accentClass}`}
      />
      <View className="flex-1 flex-row items-center gap-3 px-3 py-3">
        <View
          className={`h-11 w-11 items-center justify-center rounded-xl ${
            inactive ? "bg-cream-100" : config.iconBgClass
          }`}
        >
          <config.Icon size={22} color={config.iconColor} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text
            className={`text-base font-semibold ${
              inactive ? "text-fg-muted" : "text-fg"
            }`}
            numberOfLines={1}
          >
            {config.label}
          </Text>
          <Text
            className={`text-xs ${
              inactive ? "text-fg-subtle" : "text-fg-muted"
            }`}
            numberOfLines={1}
          >
            {inactive
              ? "Неактивний — увімкнути в налаштуваннях"
              : config.description}
          </Text>
          {showProgress ? (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                now: clampProgress(preview!.progress ?? 0),
              }}
              testID={`dashboard-row-${id}-progress`}
              className="mt-1 h-1 overflow-hidden rounded-full bg-cream-200"
            >
              <View
                style={{
                  width: `${clampProgress(preview!.progress ?? 0)}%`,
                }}
                className={`h-full ${config.accentClass}`}
              />
            </View>
          ) : null}
        </View>
        {showPreview ? (
          <View
            className="ml-1 max-w-[44%] items-end"
            testID={`dashboard-row-${id}-preview`}
          >
            {preview?.main ? (
              <Text className="text-sm font-semibold text-fg" numberOfLines={1}>
                {preview.main}
              </Text>
            ) : null}
            {preview?.sub ? (
              <Text className="text-[11px] text-fg-muted" numberOfLines={1}>
                {preview.sub}
              </Text>
            ) : null}
          </View>
        ) : null}
        <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
      </View>
    </Pressable>
  );
});
