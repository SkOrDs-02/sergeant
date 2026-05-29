/**
 * Mobile-side composer для HubChat: text input + send button + офлайн-банер
 * + голосові афорданси (STT мікрофон + TTS mute/stop toggle).
 *
 * Port `apps/web/src/core/hub/chat/HubChatComposer.tsx` +
 * `apps/web/src/core/components/ChatInput.tsx`. На відміну від web, де
 * `ChatInput` сам тримає `useSpeech`, тут STT/TTS-хуки живуть у `HubChat`
 * (бо `expo-speech-recognition` / `expo-speech` — окремі нативні модулі),
 * а composer отримує готові колбеки + стани як props.
 */

import { forwardRef } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from "react-native";
import { Send, Volume2, VolumeX } from "lucide-react-native";

import { VoiceMicButton } from "@/components/ui/VoiceMicButton";
import { colors } from "@/theme";

export interface HubChatComposerProps {
  input: string;
  setInput: (value: string) => void;
  online: boolean;
  loading: boolean;
  onSend: () => void;
  /** Final STT transcript → prefill + auto-send (fromVoice=true). */
  onVoiceResult: (transcript: string) => void;
  /** STT error → UA toast. */
  onVoiceError: (message: string) => void;
  /** Persistent TTS mute прапор (з `useTextToSpeech`). */
  muted: boolean;
  /** Перемикач mute. */
  onToggleMute: () => void;
}

export const HubChatComposer = forwardRef<RNTextInput, HubChatComposerProps>(
  function HubChatComposer(
    {
      input,
      setInput,
      online,
      loading,
      onSend,
      onVoiceResult,
      onVoiceError,
      muted,
      onToggleMute,
    }: HubChatComposerProps,
    ref,
  ) {
    const disabled = loading || !input.trim();
    return (
      <View
        className="border-t border-line bg-panel px-3 pb-3 pt-2"
        testID="hub-chat-composer"
      >
        {!online && (
          <View className="mb-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
            <Text className="text-xs text-warning-strong">
              Асистент недоступний без інтернету. Дані модулів видно офлайн, але
              AI-відповіді потребують підключення.
            </Text>
          </View>
        )}
        <View className="flex-row items-end gap-2">
          <View className="flex-1 rounded-2xl border border-line bg-bg px-3 py-2">
            <TextInput
              ref={ref}
              testID="hub-chat-input"
              accessibilityLabel="Повідомлення для асистента"
              placeholder="Запитай Sergeant…"
              placeholderTextColor="#a8a29e"
              multiline
              value={input}
              onChangeText={setInput}
              className="min-h-9 max-h-32 text-sm text-fg"
              editable={!loading}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (!disabled) onSend();
              }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              muted ? "Увімкнути озвучення" : "Вимкнути озвучення"
            }
            accessibilityState={{ selected: muted }}
            onPress={onToggleMute}
            testID="hub-chat-tts-toggle"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-2xl border border-line bg-bg active:opacity-80"
          >
            {muted ? (
              <VolumeX size={20} color={colors.danger} />
            ) : (
              <Volume2 size={20} color={colors.text} />
            )}
          </Pressable>
          <VoiceMicButton
            size="md"
            onResult={onVoiceResult}
            onError={onVoiceError}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Надіслати"
            onPress={onSend}
            disabled={disabled}
            testID="hub-chat-send"
            className={`h-11 w-11 items-center justify-center rounded-2xl ${disabled ? "bg-line" : "bg-brand-700 active:opacity-90"}`}
          >
            <Send size={18} color={disabled ? "#a8a29e" : "#ffffff"} />
          </Pressable>
        </View>
      </View>
    );
  },
);
