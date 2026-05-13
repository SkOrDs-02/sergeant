/**
 * Mobile-side scrollable message list для HubChat.
 *
 * Port `apps/web/src/core/hub/chat/HubChatBody.tsx`:
 *  - Якщо `messages.length === 0 && !loading` — рендерить `ChatEmpty`.
 *  - Кожне повідомлення показуємо у `ChatMessageRow` (bubble + опційні
 *    action cards). На відміну від web, тут немає markdown-rendering —
 *    plain `Text` (markdown lib — окрема ініціатива).
 *  - Авто-скрол до низу на новий message / на flip `loading`.
 *  - Інлайн «скасувати» pill під typing indicator.
 */

import { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";

import { deepLinkForCard, type ChatActionCard } from "./hubChatActionCards";
import type { ChatMessage } from "./hubChatUtils";
import { ChatEmpty } from "./ChatEmpty";

export interface HubChatBodyProps {
  messages: ChatMessage[];
  loading: boolean;
  onCancel: () => void;
  onPickSuggestion: (text: string) => void;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        className={
          isUser
            ? "max-w-[85%] rounded-2xl bg-brand-700 px-4 py-2.5"
            : "max-w-[85%] rounded-2xl bg-panel-hi px-4 py-2.5"
        }
      >
        <Text className={isUser ? "text-sm text-white" : "text-sm text-fg"}>
          {message.text}
        </Text>
      </View>
      {message.cards && message.cards.length > 0 && (
        <View className="mt-2 gap-2">
          {message.cards.map((card) => (
            <ActionCardRow key={card.id} card={card} />
          ))}
        </View>
      )}
    </View>
  );
}

function ActionCardRow({ card }: { card: ChatActionCard }) {
  const router = useRouter();
  const href = deepLinkForCard(card);
  const isFailed = card.status === "failed";
  const moduleAccent =
    card.module === "finyk"
      ? "border-l-finyk"
      : card.module === "fizruk"
        ? "border-l-fizruk"
        : card.module === "routine"
          ? "border-l-routine"
          : card.module === "nutrition"
            ? "border-l-nutrition"
            : "border-l-brand-500";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.title}${card.summary ? ` — ${card.summary}` : ""}`}
      accessibilityHint={href ? "Перейти на відповідний модуль" : undefined}
      onPress={() => {
        if (href) router.push(href);
      }}
      disabled={!href}
      testID={`hub-chat-action-card-${card.toolName}`}
      className={`rounded-xl border border-line border-l-4 ${moduleAccent} bg-panel px-3 py-2.5 ${href ? "active:bg-panel-hi" : ""}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className={`flex-1 text-sm font-semibold ${isFailed ? "text-danger" : "text-fg"}`}
        >
          {card.title}
        </Text>
        {card.risky && (
          <View className="rounded-full bg-warning/15 px-2 py-0.5">
            <Text className="text-2xs font-medium text-warning">ризик</Text>
          </View>
        )}
      </View>
      {!!card.summary && (
        <Text className="mt-1 text-xs text-fg-muted">{card.summary}</Text>
      )}
    </Pressable>
  );
}

function TypingIndicator() {
  return (
    <View className="self-start rounded-2xl bg-panel-hi px-4 py-2.5">
      <Text className="text-sm text-fg-muted">Друкую…</Text>
    </View>
  );
}

export function HubChatBody({
  messages,
  loading,
  onCancel,
  onPickSuggestion,
}: HubChatBodyProps) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollToEnd({ animated: true });
  }, [messages, loading]);

  const isEmpty = messages.length === 0 && !loading;

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerClassName="px-4 py-3 gap-3"
      keyboardShouldPersistTaps="handled"
      accessibilityLiveRegion="polite"
      testID="hub-chat-body"
    >
      {isEmpty ? (
        <ChatEmpty onPickSuggestion={onPickSuggestion} />
      ) : (
        messages.map((m) => <ChatBubble key={m.id} message={m} />)
      )}
      {loading && (
        <View className="flex-row items-center gap-2">
          <TypingIndicator />
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Скасувати поточний запит"
            className="flex-row items-center gap-1.5 rounded-full bg-panel-hi px-2.5 py-1 active:bg-line"
            testID="hub-chat-cancel"
          >
            <X size={12} color="#737373" />
            <Text className="text-2xs font-medium text-fg-muted">
              Скасувати
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
