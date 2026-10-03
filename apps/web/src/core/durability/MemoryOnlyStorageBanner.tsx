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
    <div
      role="alert"
      className="mx-3 mt-2 shrink-0 rounded-2xl border border-danger bg-danger/10 p-3"
    >
      <p className="text-style-label text-text">{m.title}</p>
      <p className="mt-1 text-style-caption text-subtle leading-relaxed">
        {otherTab ? m.bodyOtherTab : m.body}
      </p>
      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          {m.reload}
        </Button>
      </div>
    </div>
  );
}
