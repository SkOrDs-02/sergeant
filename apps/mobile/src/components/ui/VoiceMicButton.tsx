/**
 * Sergeant Design System — VoiceMicButton (React Native).
 *
 * Mobile-port "mic"-кнопки з web (`apps/web/src/shared/components/ui/
 * VoiceMicButton.tsx`). Public-props свідомо вузький підмножина web-у
 * (без groq / preview-чипа / Whisper-фолбеку), щоб не тягнути на
 * перший Phase 8-PR увесь web-стек. Server-side Whisper fallback —
 * follow-up §6.5 task.
 *
 * Поведінка:
 *   - На пристрої БЕЗ native STT (`supported=false`) кнопка не
 *     рендериться (мовчазний фолбек, як web для відсутнього Web Speech).
 *     Опційно `renderWhenUnsupported={true}` форсує рендер, тоді тап
 *     стрельне `onError` з UA-повідомленням.
 *   - Тап → haptic + `toggle()` (запит permission якщо ще не питав → старт STT).
 *   - Іконка міняється з `Mic` → `MicOff` (== "натисни щоб зупинити"),
 *     border підсвічується `danger` коли listening.
 */
import { Mic, MicOff } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { hapticSelection } from "@/lib/haptic";
import { colors } from "@/theme";

import { useSpeechRecognition } from "@/lib/voice/useSpeechRecognition";

export type VoiceMicButtonSize = "sm" | "md" | "lg";

export interface VoiceMicButtonProps {
  onResult?: (transcript: string) => void;
  onError?: (message: string) => void;
  lang?: string;
  size?: VoiceMicButtonSize;
  /** Aria-label-аналог для іконок (`Кнопка диктовки` за дефолтом). */
  accessibilityLabel?: string;
  disabled?: boolean;
  /**
   * Якщо `false` (дефолт) — не рендеримо кнопку коли STT не підтримується
   * на пристрої. Якщо `true` — все одно рендеримо, тап стрельне `onError`.
   */
  renderWhenUnsupported?: boolean;
}

const SIZE_PX: Record<VoiceMicButtonSize, number> = {
  sm: 36,
  md: 44,
  lg: 52,
};

const ICON_PX: Record<VoiceMicButtonSize, number> = {
  sm: 18,
  md: 22,
  lg: 26,
};

export function VoiceMicButton({
  onResult,
  onError,
  lang = "uk-UA",
  size = "md",
  accessibilityLabel = "Кнопка диктовки",
  disabled = false,
  renderWhenUnsupported = false,
}: VoiceMicButtonProps) {
  const { listening, supported, toggle } = useSpeechRecognition({
    lang,
    onResult,
    onError,
  });

  if (!supported && !renderWhenUnsupported) return null;

  const px = SIZE_PX[size];
  const iconPx = ICON_PX[size];
  const Icon = listening ? MicOff : Mic;
  const tint = listening ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? "Зупинити запис" : accessibilityLabel}
      accessibilityState={{ disabled, busy: listening }}
      disabled={disabled}
      onPress={() => {
        hapticSelection();
        toggle();
      }}
      hitSlop={8}
      style={{
        width: px,
        height: px,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: listening ? colors.danger : colors.border,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icon size={iconPx} color={tint} />
      </View>
    </Pressable>
  );
}
