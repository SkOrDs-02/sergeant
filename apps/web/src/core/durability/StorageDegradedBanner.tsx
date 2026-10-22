/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * «Частина записів не збереглась»: SQL відхилив запис посеред сесії.
 *
 * Постійний банер, не тост: нестача місця сама не минеться, а 7 с тосту
 * людина проґавить. Тосту успіху тут немає навмисно (див. `storageDegradedState`).
 */
import { useSyncExternalStore } from "react";

import { Notice } from "@shared/components/ui/Notice";
import { useLocale } from "@shared/i18n/useLocale";

import {
  dismissStorageDegraded,
  readStorageDegraded,
  subscribeStorageDegraded,
} from "./storageDegradedState";

export function StorageDegradedBanner() {
  const { messages } = useLocale();
  const m = messages.durability.storageDegraded;
  // Закрито саме цей збій; наступний (більший `seq`) покаже банер знову.
  // `dismissedSeq` у сторі, тож переживає розмонтування `ModuleShell`.
  const { active, seq, dismissedSeq } = useSyncExternalStore(
    subscribeStorageDegraded,
    readStorageDegraded,
    readStorageDegraded,
  );
  if (!active || seq <= dismissedSeq) return null;

  return (
    <Notice
      tone="danger"
      role="alert"
      className="mx-4 mt-2 flex shrink-0 items-start justify-between gap-3"
    >
      <div>
        <p>{m.title}</p>
        <p className="mt-0.5 font-normal text-muted">{m.body}</p>
      </div>
      <button
        type="button"
        onClick={() => dismissStorageDegraded(seq)}
        className="shrink-0 text-style-caption font-semibold text-danger-strong dark:text-danger hover:text-danger-strong dark:hover:text-danger pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
        aria-label={m.dismissLabel}
      >
        {messages.actions.close}
      </button>
    </Notice>
  );
}
