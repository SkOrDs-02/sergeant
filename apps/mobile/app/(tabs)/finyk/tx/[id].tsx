/**
 * Deep-link target for `sergeant://finance/tx/{id}`.
 *
 * Stub — the Fin
ік Transactions list already exists at
 * `/(tabs)/finyk/transactions`; a full single-transaction detail
 * screen is part of a later Finyk polish PR (see
 * `docs/mobile/react-native-migration.md` § 5.2). Until then this screen
 * prints the tx id and routes back to the Transactions list.
 */
import { useLocalSearchParams } from "expo-router";

import { DeepLinkPlaceholder } from "@/components/DeepLinkPlaceholder";

export default function FinykTransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DeepLinkPlaceholder
      title="Транзакція"
      detail={id ? `ID: ${id}` : undefined}
      followUp="Детальна карточка транзакції (bank-tx або manual expense): наступний PR фази Фінік."
      primaryAction={{
        label: "До Операцій",
        href: "/(tabs)/finyk/transactions",
      }}
    />
  );
}
