/**
 * HubChat — мобільний root-компонент AI-асистента.
 *
 * Port `apps/web/src/core/hub/HubChat.tsx` під React Native + Expo
 * Router. Композує мобільні `useChatSessions` / `useChatSend` (їх
 * web-аналоги тримають DOM-only API, тому існують паралельні
 * mobile-копії), а UI-шар будується з `HubChatHeader` /
 * `HubChatBody` / `HubChatComposer` / `HubChatHistoryDrawer`.
 *
 * Експортнутий як `default` для прямого використання Expo Router
 * route-ом (`apps/mobile/app/hub-chat.tsx`).
 */

import { useCallback, useRef } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import type { TextInput as RNTextInput } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useToast } from "@/components/ui/Toast";
import { useTextToSpeech } from "@/lib/voice/useTextToSpeech";

import { HubChatBody } from "./HubChatBody";
import { HubChatComposer } from "./HubChatComposer";
import { HubChatHeader } from "./HubChatHeader";
import { HubChatHistoryDrawer } from "./HubChatHistoryDrawer";
import { useChatSend } from "./useChatSend";
import { useChatSessions } from "./useChatSessions";

export interface HubChatProps {
  onClose?: () => void;
  initialMessage?: string;
  autoSendInitial?: boolean;
  onOpenCatalogue?: () => void;
}

export function HubChat({
  onClose,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
}: HubChatProps) {
  const router = useRouter();
  const toast = useToast();

  const inputRef = useRef<RNTextInput | null>(null);

  const {
    sessions,
    activeId,
    messages,
    setMessages,
    historyOpen,
    setHistoryOpen,
    handleCreateSession,
    handleSelectSession,
    handleDeleteSession,
  } = useChatSessions();

  // TTS-рушій (expo-speech) живе тут, а не у composer-і, щоб
  // `useChatSend` міг озвучити відповідь через `onSpeak`, а composer —
  // лише тогл-ити mute. Mute прапор persist-иться у MMKV самим хуком.
  const { speak, stop: stopSpeaking, muted, toggleMute } = useTextToSpeech();

  const fallbackOpenCatalogue = useCallback(() => {
    router.push("/assistant");
  }, [router]);

  const { input, setInput, loading, online, send, cancelInFlight, sendRef } =
    useChatSend({
      messages,
      setMessages,
      ...(initialMessage !== undefined ? { initialMessage } : {}),
      ...(autoSendInitial !== undefined ? { autoSendInitial } : {}),
      onOpenCatalogue: onOpenCatalogue ?? fallbackOpenCatalogue,
      onSpeak: speak,
    });

  const handleClose = useCallback(() => {
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
  }, [onClose, router]);

  const handlePickSuggestion = useCallback(
    (text: string) => {
      setInput(text);
      inputRef.current?.focus();
    },
    [setInput],
  );

  const handleSend = useCallback(() => {
    void send();
  }, [send]);

  // STT final transcript → авто-надсилання як голосовий турн
  // (`fromVoice=true` → відповідь озвучиться). Зупиняємо поточне
  // озвучення перед стартом нової фрази, щоб TTS-вивід не накладався
  // на STT-ввід.
  const handleVoiceResult = useCallback(
    (transcript: string) => {
      const text = transcript.trim();
      if (!text) return;
      stopSpeaking();
      void sendRef.current?.(text, true);
    },
    [sendRef, stopSpeaking],
  );

  const handleVoiceError = useCallback(
    (message: string) => {
      if (message) toast.error(message);
    },
    [toast],
  );

  return (
    <SafeAreaView
      className="flex-1 bg-bg"
      edges={["top", "bottom"]}
      testID="hub-chat-root"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 pt-3">
          <HubChatHeader
            online={online}
            sessionsCount={sessions.length}
            onOpenHistory={() => setHistoryOpen(true)}
            onClearChat={handleCreateSession}
            onClose={handleClose}
          />
          <HubChatBody
            messages={messages}
            loading={loading}
            onCancel={cancelInFlight}
            onPickSuggestion={handlePickSuggestion}
          />
          <HubChatComposer
            ref={inputRef}
            input={input}
            setInput={setInput}
            online={online}
            loading={loading}
            onSend={handleSend}
            onVoiceResult={handleVoiceResult}
            onVoiceError={handleVoiceError}
            muted={muted}
            onToggleMute={toggleMute}
          />
        </View>
      </KeyboardAvoidingView>
      <HubChatHistoryDrawer
        open={historyOpen}
        sessions={sessions}
        activeId={activeId}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
      />
    </SafeAreaView>
  );
}

export default HubChat;
