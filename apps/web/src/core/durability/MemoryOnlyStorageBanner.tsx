/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Записи зараз не зберігаються»: база відкрилась як `:memory:`.
 *
 * AI-CONTEXT: планшет 2026-09-29. Після очищення даних сайту воркер SQLite
 * мовчав 30 с, OPFS на головному потоці не піднявся, і база тихо пішла в
 * памʼять. Єдиним сигналом був рядок в аркуші «Синхронізація», який ніхто
 * не відкриває, тож вода й прийом зникали на reload непомітно. Джерело
 * стану те саме, що в аркуші (`storageBackendState`), лише з підпискою.
 *
 * PR-T1 (2026-11-18): пристрій без OPFS у воркері більше не живе на kvvfs у
 * `localStorage`, а потрапляє сюди ж. Для нього reload нічого не змінить,
 * тож кнопки немає, а текст каже, що робити насправді (оновити браузер) і
 * що старі записи на пристрої цілі, якщо вони там є.
 */
import { useSyncExternalStore } from "react";

import { Button } from "@shared/components/ui/Button";
import { Notice } from "@shared/components/ui/Notice";
import { useLocale } from "@shared/i18n/useLocale";

import {
  readActiveSqliteVfs,
  readSqliteLegacyStoreKept,
  readSqliteVfsFallbackReason,
  subscribeActiveSqliteVfs,
} from "../db/storageBackendState";

export function MemoryOnlyStorageBanner() {
  const { messages } = useLocale();
  const m = messages.durability.memoryOnly;
  const vfs = useSyncExternalStore(
    subscribeActiveSqliteVfs,
    readActiveSqliteVfs,
    readActiveSqliteVfs,
  );
  if (vfs !== "memory") return null;
  const reason = readSqliteVfsFallbackReason();
  if (reason === "unsupported") {
    return (
      <Notice tone="danger" role="alert" className="mx-4 mt-2 shrink-0">
        <p>{m.title}</p>
        <p className="mt-0.5 font-normal text-muted">
          {m.bodyUnsupported}
          {readSqliteLegacyStoreKept() ? ` ${m.legacyKept}` : null}
        </p>
      </Notice>
    );
  }
  const otherTab = reason === "pool-busy";

  return (
    <Notice
      tone="danger"
      role="alert"
      className="mx-4 mt-2 shrink-0"
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          {m.reload}
        </Button>
      }
    >
      <p>{m.title}</p>
      <p className="mt-0.5 font-normal text-muted">
        {otherTab ? m.bodyOtherTab : m.body}
      </p>
    </Notice>
  );
}
