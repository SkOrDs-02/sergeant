import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";

import { TransactionsPage } from "@/modules/finyk/pages/Transactions/TransactionsPage";
import { consumePresetPrefill } from "@/core/onboarding/presetPrefill";

export default function FinykTransactionsScreen() {
  // FTUX deep-link (PresetStep): the hero routes here with
  // `?action=add_expense` after staging the picked tile's
  // description / category via `presetPrefill`. Consume it once (the
  // module is the prefill's sole reader) and hand it to the page so the
  // add-expense sheet opens pre-seeded. `useMemo` keeps the consume a
  // one-shot per screen mount.
  const { action } = useLocalSearchParams<{ action?: string }>();
  const openAdd = action === "add_expense";
  const prefill = useMemo(
    () => (openAdd ? consumePresetPrefill("finyk") : null),
    [openAdd],
  );

  return (
    <TransactionsPage
      testID="finyk-transactions"
      openAddOnMount={openAdd}
      addPrefill={
        prefill
          ? {
              description:
                typeof prefill.description === "string"
                  ? prefill.description
                  : undefined,
              category:
                typeof prefill.category === "string"
                  ? prefill.category
                  : undefined,
            }
          : undefined
      }
    />
  );
}
