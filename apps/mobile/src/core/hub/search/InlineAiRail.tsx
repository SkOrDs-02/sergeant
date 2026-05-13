/**
 * Inline answer rail rendered under SearchInput when the user picks
 * the `ai-handoff` hit. Mobile mirror of
 * `apps/web/src/core/hub/search/InlineAiRail.tsx`.
 *
 * Differences from web:
 *  - RN `View`/`Text`/`Pressable` instead of `<div>`/`<button>`. Native
 *    elements get the same a11y labels via `accessibilityRole`.
 *  - Tailwind hover/focus modifiers are dropped — RN has no hover and
 *    focus rings are handled by `Pressable` press state.
 *  - The "Open in chat" CTA falls back to dismissing the rail (web
 *    routes to `/chat`; the mobile chat route ships in a follow-up
 *    Phase-2 PR).
 */

import { AlertCircle, RefreshCw, Sparkles, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { colors } from "@/theme";

import type { InlineAiState } from "./useInlineAiRail";

export interface InlineAiRailProps {
  state: InlineAiState;
  /** Re-run the same prompt without leaving the launcher. */
  onRetry: (prompt: string) => void;
  /** Abort an in-flight request without dismissing the rail. */
  onCancel: () => void;
  /** Escalate to the (eventual) fullscreen chat surface. */
  onOpenInChat: (prompt: string) => void;
  /** Dismiss the rail without leaving the launcher. */
  onDismiss: () => void;
}

const STATUS_LABEL: Record<InlineAiState["status"], string> = {
  idle: "",
  loading: "AI шукає відповідь",
  success: "Відповідь асистента",
  aborted: "Запит скасовано",
  error: "Помилка асистента",
};

export function InlineAiRail({
  state,
  onRetry,
  onCancel,
  onOpenInChat,
  onDismiss,
}: InlineAiRailProps) {
  if (state.status === "idle") return null;

  const { question } = state;
  const isError = state.status === "error";

  return (
    <View
      className="px-3 pt-2"
      accessibilityRole="summary"
      accessibilityLabel="Inline-відповідь асистента"
      testID="hub-search-inline-ai"
    >
      <Card variant="default" radius="lg" padding="md" className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-row items-start gap-2 min-w-0 flex-1">
            <View
              className={
                isError
                  ? "h-7 w-7 items-center justify-center rounded-full bg-danger-soft"
                  : "h-7 w-7 items-center justify-center rounded-full bg-brand-soft"
              }
            >
              {isError ? (
                <AlertCircle size={16} color={colors.danger} />
              ) : (
                <Sparkles size={16} color={colors.accent} />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <SectionHeading size="sm" variant="muted">
                {STATUS_LABEL[state.status]}
              </SectionHeading>
              <Text className="text-fg" numberOfLines={1}>
                {question}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Закрити відповідь"
            hitSlop={8}
            testID="hub-search-inline-ai-dismiss"
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {state.status === "loading" && (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm text-fg-muted">Думаю…</Text>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Скасувати запит"
              hitSlop={8}
            >
              <Text className="text-sm text-fg-muted px-2 py-1">Скасувати</Text>
            </Pressable>
          </View>
        )}

        {state.status === "success" && (
          <View className="gap-2">
            <Text
              className="text-sm text-fg leading-5"
              testID="hub-search-inline-ai-answer"
            >
              {state.answer}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              <Pressable
                onPress={() => onOpenInChat(state.question)}
                accessibilityRole="button"
                accessibilityLabel="Відкрити в чаті"
                className="flex-row items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5"
              >
                <Sparkles size={14} color={colors.accent} />
                <Text className="text-brand-strong text-sm">
                  Відкрити в чаті
                </Text>
              </Pressable>
              {state.hasToolCalls && (
                <Text className="text-xs text-fg-muted">
                  Дія потребує підтвердження в чаті
                </Text>
              )}
              {state.truncated && !state.hasToolCalls && (
                <Text className="text-xs text-fg-muted">
                  Повна відповідь — у чаті
                </Text>
              )}
              <Pressable
                onPress={() => onRetry(state.question)}
                accessibilityRole="button"
                accessibilityLabel="Спробувати ще раз"
                className="ml-auto"
              >
                <Text className="text-sm text-fg-muted px-2 py-1">
                  Спробувати ще раз
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {state.status === "aborted" && (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm text-fg-muted flex-1">
              Запит скасовано — спробуй ще раз.
            </Text>
            <Pressable
              onPress={() => onRetry(state.question)}
              accessibilityRole="button"
            >
              <Text className="text-brand-strong text-sm px-2 py-1">
                Запитати знову
              </Text>
            </Pressable>
          </View>
        )}

        {state.status === "error" && (
          <View className="gap-2">
            <Text className="text-sm text-danger-strong">{state.message}</Text>
            <View className="flex-row flex-wrap items-center gap-2">
              <Pressable
                onPress={() => onRetry(state.question)}
                accessibilityRole="button"
                className="flex-row items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5"
              >
                <RefreshCw size={14} color={colors.text} />
                <Text className="text-sm text-fg">Повторити</Text>
              </Pressable>
              <Pressable
                onPress={() => onOpenInChat(state.question)}
                accessibilityRole="button"
                className="flex-row items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5"
              >
                <Sparkles size={14} color={colors.accent} />
                <Text className="text-brand-strong text-sm">
                  Відкрити в чаті
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Card>
    </View>
  );
}
