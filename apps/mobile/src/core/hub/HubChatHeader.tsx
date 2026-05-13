/**
 * Mobile-side HubChat header.
 *
 * Port-equivalent `apps/web/src/core/hub/chat/HubChatHeader.tsx`:
 *  - Title row з sparkle-аватаром і online-індикатором.
 *  - «+ Нова» pill для нової бесіди.
 *  - Кнопка «Бесіди» (відкриває history drawer) — bottom-sheet
 *    замість slide-from-left у web.
 *  - Кнопка ✕ для закриття.
 *
 * Popover з privacy-notice + всі деталі контексту у web — collapse-нуто
 * до простого `subtitle`-рядку (контекст на mobile поки що завжди
 * порожній, тож «Готовий» = ready, без власних статусів).
 */

import { Pressable, Text, View } from "react-native";
import { Plus, Sparkles, ListOrdered, X } from "lucide-react-native";

// Module-accent hex — keep inline to bypass the
// `Record<ModuleAccent, Record<string, string>>` widening that
// `noUncheckedIndexedAccess` would otherwise turn into `string | undefined`.
const FINYK_ACCENT = "#10b981";

export interface HubChatHeaderProps {
  online: boolean;
  sessionsCount: number;
  onOpenHistory: () => void;
  onClearChat: () => void;
  onClose: () => void;
}

export function HubChatHeader({
  online,
  sessionsCount,
  onOpenHistory,
  onClearChat,
  onClose,
}: HubChatHeaderProps) {
  return (
    <View
      className="flex-row items-center justify-between gap-2 border-b border-line px-3 pb-3"
      testID="hub-chat-header"
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <View className="relative h-9 w-9 items-center justify-center rounded-xl bg-cream-100">
          <Sparkles size={16} color={FINYK_ACCENT} />
          <View
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${online ? "bg-brand-500" : "bg-warning"}`}
            style={{ borderWidth: 2, borderColor: "#ffffff00" }}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-base font-bold leading-snug text-fg"
            numberOfLines={1}
          >
            Асистент
          </Text>
          <Text className="text-2xs text-fg-muted" numberOfLines={1}>
            {online ? "Готовий" : "Офлайн"} · {sessionsCount}{" "}
            {sessionsCount === 1 ? "бесіда" : "бесід"}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Відкрити список бесід"
          onPress={onOpenHistory}
          testID="hub-chat-open-history"
          className="h-9 w-9 items-center justify-center rounded-xl active:bg-panel-hi"
        >
          <ListOrdered size={16} color="#737373" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Нова бесіда"
          onPress={onClearChat}
          testID="hub-chat-new-session"
          className="h-9 flex-row items-center gap-1 rounded-xl border border-line bg-cream-50 px-2.5 active:bg-cream-100"
        >
          <Plus size={14} color={FINYK_ACCENT} />
          <Text className="text-xs font-semibold text-brand-700">Нова</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрити асистента"
          onPress={onClose}
          testID="hub-chat-close"
          className="h-9 w-9 items-center justify-center rounded-xl active:bg-panel-hi"
        >
          <X size={16} color="#737373" />
        </Pressable>
      </View>
    </View>
  );
}
