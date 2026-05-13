/**
 * Empty-state placeholder для HubChat на mobile.
 *
 * Port `apps/web/src/core/hub/chat/ChatEmpty.tsx`:
 *  - Заголовок + опис + чотири suggestion-чіпи по модулях
 *    (finyk / fizruk / nutrition / routine). Тап на чіп префілить
 *    composer відповідним промптом; парент (`HubChatBody` →
 *    `HubChat`) пробрасує `setInput` + `focus`.
 *  - На відміну від web, тут немає `getActiveModules` фільтра — в
 *    мобільному dashboard ще нема dashboard-store, тому показуємо
 *    всі чотири варіанти, як baseline.
 */

import { Pressable, Text, View } from "react-native";
import {
  CreditCard,
  Dumbbell,
  Sparkles,
  type LucideIcon,
  CheckCircle2,
  UtensilsCrossed,
} from "lucide-react-native";

// Direct hex constants keep the module-accent colours readable without
// pulling `moduleColors.<id>.primary` through `noUncheckedIndexedAccess`
// (which collapses the index access to `string | undefined`).
const MODULE_ACCENT = {
  finyk: "#10b981",
  fizruk: "#14b8a6",
  nutrition: "#92cc17",
  routine: "#f97066",
} as const;

export interface ChatEmptyProps {
  onPickSuggestion: (text: string) => void;
}

interface Suggestion {
  readonly id: "finyk" | "fizruk" | "nutrition" | "routine";
  readonly Icon: LucideIcon;
  readonly iconColor: string;
  readonly prompt: string;
}

const SUGGESTIONS: readonly Suggestion[] = [
  {
    id: "finyk",
    Icon: CreditCard,
    iconColor: MODULE_ACCENT.finyk,
    prompt: "Скільки я витратив цього тижня?",
  },
  {
    id: "fizruk",
    Icon: Dumbbell,
    iconColor: MODULE_ACCENT.fizruk,
    prompt: "Як мої тренування?",
  },
  {
    id: "nutrition",
    Icon: UtensilsCrossed,
    iconColor: MODULE_ACCENT.nutrition,
    prompt: "Що я їв сьогодні?",
  },
  {
    id: "routine",
    Icon: CheckCircle2,
    iconColor: MODULE_ACCENT.routine,
    prompt: "Стан моїх звичок",
  },
];

export function ChatEmpty({ onPickSuggestion }: ChatEmptyProps) {
  return (
    <View
      testID="chat-empty"
      accessibilityRole="text"
      accessibilityLabel="Підказки для початку чату"
      className="flex-1 items-center justify-center gap-4 px-4 py-6"
    >
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-cream-100">
        <Sparkles size={22} color={MODULE_ACCENT.finyk} />
      </View>
      <Text className="text-base font-semibold text-fg">
        Запитай щось — я допоможу
      </Text>
      <Text className="max-w-xs text-center text-sm leading-relaxed text-fg-muted">
        Тапни на підказку — текст вставиться у поле, і ти зможеш відредагувати
        його перед відправкою.
      </Text>
      <View className="w-full max-w-md gap-2">
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s.id}
            testID={`chat-empty-suggestion-${s.id}`}
            accessibilityRole="button"
            accessibilityLabel={s.prompt}
            onPress={() => onPickSuggestion(s.prompt)}
            className="flex-row items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-3 active:bg-panel-hi"
          >
            <s.Icon size={16} color={s.iconColor} />
            <Text className="flex-1 text-sm text-fg" numberOfLines={1}>
              {s.prompt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
