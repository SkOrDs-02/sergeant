import { useEffect } from "react";
import { useLockDraft } from "@shared/hooks/useLockDraft";
import { FORM_DRAFT_IDS, peekFormDraft } from "@shared/lib/storage/formDrafts";

/**
 * Поле вводу HubChat з чернеткою, що переживає замок застосунку (sec-13,
 * priv-15). `initialChatInput` читає чернетку на маунті, `useChatInputDraft`
 * стирає її після відновлення й зберігає знову, коли текст недописаний при
 * замиканні.
 */
export const initialChatInput = (): string =>
  peekFormDraft<string>(FORM_DRAFT_IDS.hubChatInput) ?? "";

export function useChatInputDraft(input: string): void {
  const { take } = useLockDraft<string>(
    FORM_DRAFT_IDS.hubChatInput,
    input.trim() !== "" ? input : null,
  );
  useEffect(() => {
    take();
  }, [take]);
}
