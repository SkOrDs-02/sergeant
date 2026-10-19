/**
 * Теги операцій (спека finyk-analytics-v3, Р6). Тонка обгортка над чистими
 * функціями `@sergeant/finyk-domain/domain/tags`: хук тримає слот, а запис
 * іде тим самим шляхом, що нотатки: слот → діф (`useFinykDualWriteSync`) →
 * `finyk_tx_tags` → op-log. Окремого persist тут немає навмисно.
 */
import { useCallback, useMemo } from "react";
import {
  addTxTag,
  listTags,
  removeTagEverywhere,
  renameTagEverywhere,
  setTxTags as setTxTagsInMap,
  type TagSummary,
} from "@sergeant/finyk-domain/domain/tags";
import type { FinykStorageSlots } from "./useFinykStorageSlots";
import type { TxTagsMap } from "./useStorage.types";

export interface FinykTxTagsApi {
  txTags: TxTagsMap;
  /** Усі вжиті теги від частіших до рідших. */
  tagList: readonly TagSummary[];
  setTxTags: (txId: string, tags: readonly string[]) => void;
  /** Додає тег до кожної з операцій (пакетна дія в checkbox-режимі). */
  addTagToTxs: (txIds: readonly string[], raw: string) => void;
  renameTag: (key: string, newLabel: string) => void;
  removeTag: (key: string) => void;
}

export function useFinykTxTags(
  slots: Pick<FinykStorageSlots, "txTags" | "setTxTags">,
): FinykTxTagsApi {
  const { txTags, setTxTags: setSlot } = slots;
  const tagList = useMemo(() => listTags(txTags), [txTags]);

  const setTxTags = useCallback(
    (txId: string, tags: readonly string[]) =>
      setSlot((prev) => setTxTagsInMap(prev, txId, tags) as TxTagsMap),
    [setSlot],
  );
  const addTagToTxs = useCallback(
    (txIds: readonly string[], raw: string) =>
      setSlot((prev) => {
        const known = listTags(prev);
        let next = prev;
        for (const id of txIds) {
          next = setTxTagsInMap(
            next,
            id,
            addTxTag(next[id] ?? [], raw, known),
          ) as TxTagsMap;
        }
        return next;
      }),
    [setSlot],
  );
  const renameTag = useCallback(
    (key: string, newLabel: string) =>
      setSlot((prev) => renameTagEverywhere(prev, key, newLabel) as TxTagsMap),
    [setSlot],
  );
  const removeTag = useCallback(
    (key: string) =>
      setSlot((prev) => removeTagEverywhere(prev, key) as TxTagsMap),
    [setSlot],
  );

  return { txTags, tagList, setTxTags, addTagToTxs, renameTag, removeTag };
}
