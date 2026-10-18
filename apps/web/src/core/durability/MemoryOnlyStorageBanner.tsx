/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * «Записи зараз не зберігаються»: база відкрилась як `:memory:`.
 *
 * AI-CONTEXT: планшет 2026-09-29. Після очищення даних сайту воркер SQLite
 * мовчав 30 с, OPFS на головному потоці не піднявся, і база тихо пішла в
 * памʼять. Єдиним сигналом був рядок в аркуші «Синхронізація», який ніхто
 * не відкриває, тож вода й прийом зникали на reload непомітно. Джерело
 * стану те саме, що в аркуші (`storageBackendState`), лише з підпискою.
 */
import { useSyncExternalStore } from "react";

import { Button } from "@shared/components/ui/Button";
import { Notice } from "@shared/components/ui/Notice";
import { messages } from "@shared/i18n/uk";

import {
  readActiveSqliteVfs,
  readSqliteVfsFallbackReason,
  subscribeActiveSqliteVfs,
} from "../db/storageBackendState";

const m = messages.durability.memoryOnly;

export function MemoryOnlyStorageBanner() {
  const vfs = useSyncExternalStore(
    subscribeActiveSqliteVfs,
    readActiveSqliteVfs,
    readActiveSqliteVfs,
  );
  if (vfs !== "memory") return null;
  const otherTab = readSqliteVfsFallbackReason() === "pool-busy";

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
