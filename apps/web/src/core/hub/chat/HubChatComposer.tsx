import type { Dispatch, SetStateAction } from "react";
import { ChatInput } from "../../components/ChatInput";
import { ChatQuickActions } from "../../components/ChatQuickActions";
import type { ActiveModule } from "../../lib/hubChatUtils";
import { messages } from "@shared/i18n/uk";

export interface HubChatComposerProps {
  activeModule: ActiveModule | null;
  loading: boolean;
  online: boolean;
  speaking: boolean;
  setSpeaking: Dispatch<SetStateAction<boolean>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  onSend: (prompt?: string) => void;
  onHelp: () => void;
  sendRef: React.MutableRefObject<
    ((text?: string, fromVoice?: boolean) => Promise<void>) | null
  >;
  focusInputRef: React.MutableRefObject<(() => void) | null>;
}

/**
 * Composer block at the bottom of the chat panel: quick-action chips,
 * an offline banner (rendered only when `online` flips false), and
 * the text input itself. Wrapped in a subtle panel surface with a
 * top divider so it visually reads as a separate "send tray" instead
 * of free-floating controls on top of the chat scroll area — same
 * pattern as iMessage / ChatGPT / Claude composers.
 */
export function HubChatComposer({
  activeModule,
  loading,
  online,
  speaking,
  setSpeaking,
  input,
  setInput,
  onSend,
  onHelp,
  sendRef,
  focusInputRef,
}: HubChatComposerProps) {
  return (
    <div className="shrink-0 border-t border-line/60 bg-panel/40 backdrop-blur-sm">
      {/* Quick action chips (spec: assistant-quick-actions-v1) */}
      <ChatQuickActions
        activeModule={activeModule}
        loading={loading}
        online={online}
        onSend={(prompt) => onSend(prompt)}
        onPrefill={(prompt) => {
          setInput(prompt);
          // Невелика затримка, щоб React встиг змонтувати оновлений
          // value у input перш ніж ми поставимо фокус.
          setTimeout(() => focusInputRef.current?.(), 0);
        }}
      />

      {!online && (
        <div
          role="status"
          className="mx-4 mb-2 mt-1 px-3 py-2 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning text-center shrink-0"
        >
          {messages.hub.chatOfflineNotice}
        </div>
      )}

      <ChatInput
        input={input}
        setInput={setInput}
        loading={loading}
        online={online}
        speaking={speaking}
        setSpeaking={setSpeaking}
        onSend={() => onSend()}
        onHelp={onHelp}
        sendRef={sendRef}
        focusInputRef={focusInputRef}
      />
    </div>
  );
}
