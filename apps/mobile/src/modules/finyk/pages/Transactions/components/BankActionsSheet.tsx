/**
 * Sergeant Finyk — secondary actions sheet for bank transactions.
 *
 * Bank rows aren't editable in-place (their source of truth is the
 * Mono webhook), so the long-press / swipe-left affordance routes to
 * "Categorize" or "Hide" instead of opening the manual-expense form.
 */
import { Pressable, Text, View } from "react-native";

import type { Transaction } from "@sergeant/finyk-domain/domain";

import { Sheet } from "@/components/ui/Sheet";

interface BankActionsSheetProps {
  testID: string;
  tx: Transaction | null;
  onCategorize: (tx: Transaction) => void;
  onHide: (tx: Transaction) => void;
  onClose: () => void;
}

export function BankActionsSheet({
  testID,
  tx,
  onCategorize,
  onHide,
  onClose,
}: BankActionsSheetProps) {
  return (
    <Sheet
      open={!!tx}
      onClose={onClose}
      title="Дії над транзакцією"
      description={
        tx?.description
          ? `«${tx.description}» — банківська транзакція не редагується напряму.`
          : undefined
      }
    >
      <View className="px-2 pb-2" testID={`${testID}-bank-edit-sheet`}>
        <Pressable
          onPress={() => {
            if (tx) onCategorize(tx);
          }}
          accessibilityRole="button"
          testID={`${testID}-bank-edit-categorize`}
          className="px-3 py-3 rounded-xl active:opacity-70"
        >
          <Text className="text-sm text-fg">🏷 Змінити категорію</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (tx) onHide(tx);
          }}
          accessibilityRole="button"
          testID={`${testID}-bank-edit-hide`}
          className="px-3 py-3 rounded-xl active:opacity-70"
        >
          <Text className="text-sm text-fg">🙈 Приховати</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
