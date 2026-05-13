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

  const fallbackOpenCatalogue = useCallback(() => {
    router.push("/assistant");
  }, [router]);

  const { input, setInput, loading, online, send, cancelInFlight } =
    useChatSend({
      messages,
      setMessages,
      ...(initialMessage !== undefined ? { initialMessage } : {}),
      ...(autoSendInitial !== undefined ? { autoSendInitial } : {}),
      onOpenCatalogue: onOpenCatalogue ?? fallbackOpenCatalogue,
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
