import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useCameraPermissions } from "expo-camera";
import { Bell, Camera, Check } from "lucide-react-native";

import { hapticTap, type DashboardModuleId } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

import { cx } from "./style";

/**
 * Outcome of a single just-in-time permission prompt. Mirrors the web
 * "ask only when it earns its keep" approach: each card explains the
 * payoff before triggering the OS dialog, and a declined prompt never
 * blocks finishing onboarding.
 */
export type PermissionPromptResult = "granted" | "denied" | "skipped";

export interface PermissionsStepResult {
  push: PermissionPromptResult;
  camera: PermissionPromptResult;
}

/**
 * Just-in-time permission prompts (mobile parity for the web wizard's
 * "permissions moved to JIT prompts" note in `WelcomeOneScreen.tsx`).
 *
 * - Push (`expo-notifications`) is offered whenever the user keeps any
 *   module, because every module surfaces reminders.
 * - Camera (`expo-camera`) is offered only when Nutrition is picked —
 *   that is the single surface web asks for the camera (barcode /
 *   photo-calorie scan).
 *
 * Each card requests its OS permission on demand and reports the result
 * up so the host can fire analytics. Declining is non-blocking — the
 * primary CTA always finishes onboarding.
 */
export function PermissionsStep({
  picks,
  onPushResult,
  onCameraResult,
  onFinish,
  onBack,
  busy,
}: {
  picks: DashboardModuleId[];
  onPushResult: (result: PermissionPromptResult) => void;
  onCameraResult: (result: PermissionPromptResult) => void;
  onFinish: () => void;
  onBack: () => void;
  busy?: boolean;
}) {
  const wantsCamera = picks.includes("nutrition");
  const [, requestCameraPermission] = useCameraPermissions();
  const [pushState, setPushState] = useState<PermissionPromptResult | null>(
    null,
  );
  const [cameraState, setCameraState] = useState<PermissionPromptResult | null>(
    null,
  );

  const askPush = useCallback(async () => {
    if (pushState !== null) return;
    hapticTap();
    try {
      const current = await Notifications.getPermissionsAsync();
      const alreadyGranted =
        current.granted ||
        current.ios?.status ===
          Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (alreadyGranted) {
        setPushState("granted");
        onPushResult("granted");
        return;
      }
      if (current.status === "denied" && !current.canAskAgain) {
        setPushState("denied");
        onPushResult("denied");
        return;
      }
      const next = await Notifications.requestPermissionsAsync();
      const granted =
        next.granted ||
        next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      const result: PermissionPromptResult = granted ? "granted" : "denied";
      setPushState(result);
      onPushResult(result);
    } catch {
      setPushState("denied");
      onPushResult("denied");
    }
  }, [pushState, onPushResult]);

  const askCamera = useCallback(async () => {
    if (cameraState !== null) return;
    hapticTap();
    try {
      const next = await requestCameraPermission();
      const result: PermissionPromptResult = next.granted
        ? "granted"
        : "denied";
      setCameraState(result);
      onCameraResult(result);
    } catch {
      setCameraState("denied");
      onCameraResult("denied");
    }
  }, [cameraState, requestCameraPermission, onCameraResult]);

  return (
    <View className="items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-center text-xl font-bold text-fg">
          Дозволи — лише потрібні
        </Text>
        <Text className="text-center text-xs text-fg-muted">
          Проси можна пізніше. Нічого не обов’язкове.
        </Text>
      </View>

      <View className="w-full gap-2">
        <PermissionCard
          icon={<Bell size={20} color="#7c6af7" strokeWidth={2} />}
          title="Нагадування"
          desc="Щоб не забути про звички, тренування та бюджет."
          state={pushState}
          onPress={askPush}
        />
        {wantsCamera && (
          <PermissionCard
            icon={<Camera size={20} color="#84cc16" strokeWidth={2} />}
            title="Камера"
            desc="Сканувати штрихкоди та рахувати калорії з фото."
            state={cameraState}
            onPress={askCamera}
          />
        )}
      </View>

      <View className="w-full flex-row gap-2">
        <Pressable
          onPress={onBack}
          className="items-center justify-center rounded-xl px-4 py-3 active:opacity-70"
          testID="onboarding-back-permissions"
        >
          <Text className="text-sm text-fg-muted">←</Text>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onPress={onFinish}
          loading={busy}
          testID="onboarding-finish"
          className="flex-1"
        >
          Заповни мій хаб
        </Button>
      </View>
    </View>
  );
}

function PermissionCard({
  icon,
  title,
  desc,
  state,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  state: PermissionPromptResult | null;
  onPress: () => void;
}) {
  const decided = state !== null;
  const granted = state === "granted";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: decided }}
      disabled={decided}
      onPress={onPress}
      className={cx(
        "w-full flex-row items-start gap-3 rounded-2xl border p-3.5",
        "active:opacity-70",
        granted
          ? "border-brand-500/60 bg-brand-500/10"
          : "border-cream-300 bg-cream-50",
      )}
    >
      <View
        className={cx(
          "h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          granted ? "bg-brand-500/15" : "bg-cream-100",
        )}
      >
        {granted ? <Check size={20} color="#7c6af7" strokeWidth={2.5} /> : icon}
      </View>
      <View className="min-w-0 flex-1 pr-2">
        <Text className="text-sm font-bold leading-tight text-fg">{title}</Text>
        <Text className="mt-0.5 text-xs leading-snug text-fg-muted">
          {decided
            ? granted
              ? "Дозволено"
              : "Можна увімкнути пізніше в налаштуваннях"
            : desc}
        </Text>
      </View>
    </Pressable>
  );
}
