/**
 * Mobile-side composer для HubChat: text input + send button + офлайн-банер.
 *
 * Port `apps/web/src/core/hub/chat/HubChatComposer.tsx`. Голосовий
 * input (web `ChatInput`) виведено за дужки (Phase 8 / Voice STT).
 */

import { forwardRef } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from "react-native";
import { Send } from "lucide-react-native";

export interface HubChatComposerProps {
  input: string;
  setInput: (value: string) => void;
  online: boolean;
  loading: boolean;
  onSend: () => void;
}

export const HubChatComposer = forwardRef<RNTextInput, HubChatComposerProps>(
  function HubChatComposer(
    { input, setInput, online, loading, onSend }: HubChatComposerProps,
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
