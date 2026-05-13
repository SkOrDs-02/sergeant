/**
 * Mobile-side history drawer для HubChat: список збережених бесід.
 *
 * Port `apps/web/src/core/hub/HubChatHistoryDrawer.tsx`. На web — слайдер
 * зліва з фокусом-трапом; на mobile — bottom-sheet поверх існуючого
 * `Sheet` primitive-у (`@/components/ui/Sheet`), який сам тримає focus,
 * scrim і hardware-back.
 *
 * Сортує сесії за `updatedAt` спадно. Активна сесія підсвічена. Tap
 * на рядок викликає `onSelect`, кнопка smetnyk — `onDelete`.
 */

import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";

import { Sheet } from "@/components/ui/Sheet";

import type { HubChatSession } from "./hubChatSessions";

export interface HubChatHistoryDrawerProps {
  open: boolean;
  sessions: HubChatSession[];
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}

export function HubChatHistoryDrawer({
  open,
  sessions,
  activeId,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: HubChatHistoryDrawerProps) {
  const sorted = useMemo(
    () => sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Бесіди"
      description={`${sessions.length} ${sessions.length === 1 ? "збережена" : "збережених"}`}
    >
      <View className="gap-2 px-4 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Створити нову бесіду"
          onPress={onCreate}
          testID="hub-chat-history-create"
          className="flex-row items-center gap-2 rounded-2xl border border-line bg-cream-50 px-3 py-3 active:bg-cream-100"
        >
          <Plus size={16} color="#10b981" />
          <Text className="text-sm font-semibold text-brand-700">
            Нова бесіда
          </Text>
        </Pressable>
        {sorted.length === 0 ? (
          <View className="rounded-2xl border border-line bg-panel px-4 py-6">
            <Text className="text-center text-sm text-fg-muted">
              Поки що немає збережених бесід.
            </Text>
          </View>
        ) : (
          sorted.map((s) => {
            const isActive = s.id === activeId;
            return (
              <View
                key={s.id}
                className={`flex-row items-center gap-2 rounded-2xl border px-3 py-2.5 ${isActive ? "border-brand-300 bg-brand-50" : "border-line bg-panel"}`}
                testID={`hub-chat-history-row-${s.id}`}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Відкрити бесіду «${s.title}»`}
                  onPress={() => onSelect(s.id)}
                  className="min-w-0 flex-1"
                >
                  <Text
                    className={`text-sm font-semibold ${isActive ? "text-brand-700" : "text-fg"}`}
                    numberOfLines={1}
                  >
                    {s.title}
                  </Text>
                  <Text className="text-2xs text-fg-muted" numberOfLines={1}>
                    {formatTime(s.updatedAt)} · {s.messages.length}{" "}
                    {s.messages.length === 1 ? "повідомлення" : "повідомлень"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Видалити бесіду «${s.title}»`}
                  onPress={() => onDelete(s.id)}
                  testID={`hub-chat-history-delete-${s.id}`}
                  className="h-9 w-9 items-center justify-center rounded-xl active:bg-panel-hi"
                >
                  <Trash2 size={16} color="#dc2626" />
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </Sheet>
  );
}
