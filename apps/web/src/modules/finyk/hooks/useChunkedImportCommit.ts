/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Commit масового імпорту частинами по ≤ `IMPORT_COMMIT_MAX_ROWS` (аудит
 * 2026-10-01, ux-07; нарізка – `components/bulkImport/commitChunks.ts`).
 *
 * Кожна частина – окремий `commitImport` і окремий батч (`batchId`) у
 * журналі `import_batches`. Для людини це один імпорт: підсумок складає
 * лічильники всіх частин, а «Скасувати імпорт» скасовує кожен батч.
 *
 * **Збій посередині.** Частини йдуть послідовно; якщо частина k падає,
 * частини 0..k-1 уже на сервері. Їх не відкочуємо: рядки валідні, а
 * повторний commit тих самих рядків ідемпотентний (детермінований id,
 * `duplicate`). `run` повертає id рядків, що вже пішли, і помилку; аркуш
 * прибирає ці рядки з таблиці, тож друге «Імпортувати» досилає лише решту, а
 * підсумок і undo накопичуються через обидві спроби (`totals`). Аркуш, закритий
 * після часткового збою, лишає вже імпортовані частини імпортованими (так само,
 * як закритий підсумок без «Скасувати»).
 *
 * **Undo посередині.** Батчі скасовуються по одному; скасований зникає з
 * `totals.parts` разом зі своїм `created`, тож повторне «Скасувати імпорт»
 * після збою добиває лише решту.
 */
import { useCallback, useRef, useState } from "react";
import type { ImportCommitProfile, ImportSource } from "@sergeant/api-client";
import {
  useImportBatchUndo,
  useImportCommit,
  type ImportCommitResult,
} from "./useBulkImport";
import type { ManualExpenseWriteThroughStorage } from "./manualExpenseWriteThrough";
import { planCommitChunks } from "../components/bulkImport/commitChunks";
import {
  toCommitRows,
  type BulkReviewRow,
} from "../components/bulkImport/bulkImportRows";

export interface CommittedImportPart {
  batchId: number;
  created: number;
  locallyWrittenIds: readonly string[];
}

export interface ChunkedImportTotals {
  created: number;
  skipped: { monoMatched: number; duplicate: number };
  parts: readonly CommittedImportPart[];
}

export interface ChunkedCommitParams {
  source: ImportSource;
  profile: ImportCommitProfile | null;
  rows: readonly BulkReviewRow[];
}

export interface ChunkedCommitOutcome {
  totals: ChunkedImportTotals;
  /** Id рядків review, що вже на сервері (у цій спробі). */
  committedRowIds: ReadonlySet<string>;
  /** `null` – усі частини пройшли. */
  failure: { error: unknown; committedRows: number; totalRows: number } | null;
}

const EMPTY_TOTALS: ChunkedImportTotals = {
  created: 0,
  skipped: { monoMatched: 0, duplicate: 0 },
  parts: [],
};

function addPart(
  totals: ChunkedImportTotals,
  result: ImportCommitResult,
): ChunkedImportTotals {
  return {
    created: totals.created + result.created,
    skipped: {
      monoMatched: totals.skipped.monoMatched + result.skipped.monoMatched,
      duplicate: totals.skipped.duplicate + result.skipped.duplicate,
    },
    parts: [
      ...totals.parts,
      {
        batchId: result.batchId,
        created: result.created,
        locallyWrittenIds: result.locallyWrittenIds,
      },
    ],
  };
}

export interface UseChunkedImportCommitOptions {
  storage: ManualExpenseWriteThroughStorage;
}

export function useChunkedImportCommit({
  storage,
}: UseChunkedImportCommitOptions) {
  const commit = useImportCommit({ storage });
  const batchUndo = useImportBatchUndo({ storage });
  // Ref – джерело правди між await-ами (стан React у замиканні застаріває),
  // state – для рендеру.
  const totalsRef = useRef<ChunkedImportTotals | null>(null);
  const [totals, setTotalsState] = useState<ChunkedImportTotals | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  const setTotals = (next: ChunkedImportTotals | null) => {
    totalsRef.current = next;
    setTotalsState(next);
  };

  const run = async ({
    source,
    profile,
    rows,
  }: ChunkedCommitParams): Promise<ChunkedCommitOutcome> => {
    const chunks = planCommitChunks(rows);
    const totalRows = chunks.reduce((n, c) => n + c.length, 0);
    const committedRowIds = new Set<string>();
    setIsPending(true);
    try {
      for (const [i, chunk] of chunks.entries()) {
        setProgress({ current: i + 1, total: chunks.length });
        try {
          const result = await commit.mutateAsync({
            source,
            ...(profile ? { profile } : {}),
            rows: toCommitRows(chunk),
          });
          setTotals(addPart(totalsRef.current ?? EMPTY_TOTALS, result));
          for (const row of chunk) committedRowIds.add(row.id);
        } catch (error) {
          return {
            totals: totalsRef.current ?? EMPTY_TOTALS,
            committedRowIds,
            failure: {
              error,
              committedRows: committedRowIds.size,
              totalRows,
            },
          };
        }
      }
      return {
        totals: totalsRef.current ?? EMPTY_TOTALS,
        committedRowIds,
        failure: null,
      };
    } finally {
      setIsPending(false);
      setProgress(null);
    }
  };

  /** Скасовує всі батчі по одному. Кидає помилку першого невдалого;
   * скасовані до нього вже прибрані з `totals`. */
  const undoAll = async (): Promise<void> => {
    setIsUndoing(true);
    try {
      for (;;) {
        const current = totalsRef.current;
        const part = current?.parts[0];
        if (!current || !part) return;
        await batchUndo.mutateAsync({
          batchId: part.batchId,
          localIds: part.locallyWrittenIds,
        });
        setTotals({
          ...current,
          created: current.created - part.created,
          parts: current.parts.slice(1),
        });
      }
    } finally {
      setIsUndoing(false);
    }
  };

  // Стабільний: аркуш викликає його в ефекті закриття.
  const reset = useCallback(() => {
    totalsRef.current = null;
    setTotalsState(null);
    setProgress(null);
  }, []);

  return { run, undoAll, reset, totals, progress, isPending, isUndoing };
}
