/**
 * Sergeant Finyk — account multiselect bottom sheet for the
 * transactions feed. Toggles ids in the persisted whitelist; clearing
 * the selection emits `[]` so the consumer can untoggle everything in
 * one tap.
 */
import { Pressable, Text, View } from "react-native";

import { Sheet } from "@/components/ui/Sheet";

interface AccountOption {
  id?: string;
  type?: string;
}

interface AccountFilterSheetProps {
  testID: string;
  open: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

export function AccountFilterSheet({
  testID,
  open,
  onClose,
  accounts,
  selectedIds,
  onChange,
}: AccountFilterSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Фільтр по рахунках"
      description="Оберіть рахунки, транзакції з яких показувати."
    >
      <View testID={`${testID}-accounts-sheet`}>
        {accounts.length === 0 ? (
          <Text className="text-sm text-fg-muted px-3 py-2">
            Немає підключених рахунків.
          </Text>
        ) : (
          accounts.map((a) => {
            const aid = a.id ?? "";
            const checked = selectedIds.includes(aid);
            return (
              <Pressable
                key={aid}
                onPress={() => {
                  const next = checked
                    ? selectedIds.filter((x) => x !== aid)
                    : [...selectedIds, aid];
                  onChange(next);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                testID={`${testID}-account-opt-${aid}`}
                className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
              >
                <Text className="text-sm text-fg flex-1">
                  {a.type ?? aid ?? "Рахунок"}
                </Text>
                <Text className={checked ? "text-brand-500" : "text-fg-subtle"}>
                  {checked ? "☑" : "☐"}
                </Text>
              </Pressable>
            );
          })
        )}
        {selectedIds.length > 0 && (
          <Pressable
            onPress={() => onChange([])}
            accessibilityRole="button"
            testID={`${testID}-account-clear`}
            className="mt-2 px-3 py-3 rounded-xl bg-cream-100 active:opacity-70"
          >
            <Text className="text-sm text-fg-muted text-center">
              Скинути вибір рахунків
            </Text>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}
