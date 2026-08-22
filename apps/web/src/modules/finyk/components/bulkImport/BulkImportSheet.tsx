/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * "Додати документи" (спека § Фаза 2 — Масове ведення). Два шляхи з
 * однієї точки входу — банківські документи:
 *   (а) скрін банкінгу  → `analyzeImportScreenshot` → bulk-review
 *   (б) CSV-виписка     → `previewImportStatement` → (мапер?) → bulk-review
 *
 * Обидва сходяться на спільному `BulkReviewTable` + `commitImport`.
 * «Кілька фото чеків» (Фаза 2а) переїхали у `ReceiptScanSheet` — фото
 * чеків це про чеки, не про документи (бета-фідбек №2, 2026-08-18); там
 * пікер `multiple`, 2+ фото → стадія `batch`.
 *
 * Стадія `processing` (бета-фідбек №5, 2026-08-18) вмикається СИНХРОННО
 * з вибором файлу — до стиснення фото, не після. До неї аркуш лишався на
 * кнопках усі 5–20 секунд vision-виклику, і тестерка читала це як
 * завислий екран. Кожна реальна фаза міняє `label` (`ScanStatus` § шар
 * 2), тож рух видно ще до відповіді сервера.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { useResetPinchZoomAfterCameraCapture } from "@shared/hooks/useResetPinchZoomOnResume";
import type { ImportSkippedRow, ImportSource } from "@sergeant/api-client";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { DEFAULT_CATEGORY } from "../manualExpenseCategories";
import { DEFAULT_INCOME_CATEGORY } from "../manualIncomeCategories";
import { formatReceiptError } from "../../lib/receiptErrors";
import { readReceiptImageFile } from "../../lib/receiptImage";
import { readCsvTextFile } from "../../lib/importCsv";
import {
  useImportBatchUndo,
  useImportCommit,
  useImportScreenshotAnalyze,
  useImportStatementPreview,
  type ImportCommitResult,
} from "../../hooks/useBulkImport";
import type { ManualExpenseWriteThroughStorage } from "../../hooks/manualExpenseWriteThrough";
import {
  screenshotRowsToBulkReviewRows,
  statementRowsToBulkReviewRows,
  toCommitRows,
  toggleRowSelected,
  setAllSelected,
  applyBulkCategory,
  updateRowField,
  type BulkReviewRow,
} from "./bulkImportRows";
import { ScanStatus, type ScanStatusState } from "../ScanStatus";
import { ColumnMapper } from "./ColumnMapper";
import { BulkReviewTable } from "./BulkReviewTable";

type Stage =
  "choose" | "processing" | "csv-mapper" | "bulk-review" | "commit-summary";

const SCREENSHOT_SLOW_HINT =
  "Ще працюю. Що більше рядків на скріні, то довше розпізнавання.";
const CSV_SLOW_HINT = "Ще працюю. Велика виписка читається довше.";

const SKIP_REASON_LABEL: Record<string, string> = {
  not_uah: "не гривня",
  unparsed_date: "нерозпізнана дата",
  unparsed_amount: "нерозпізнана сума",
  empty: "порожній рядок",
};

function defaultCategoryFor(direction: "expense" | "income"): string {
  return direction === "income" ? DEFAULT_INCOME_CATEGORY : DEFAULT_CATEGORY;
}

function summarizeSkipped(skipped: ImportSkippedRow[]): string | null {
  if (skipped.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of skipped)
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(
    ([reason, n]) => `${n}: ${SKIP_REASON_LABEL[reason] ?? reason}`,
  );
  return `Пропущено з файлу: ${parts.join(", ")}.`;
}

export interface BulkImportSheetProps {
  open: boolean;
  onClose: () => void;
  storage: ManualExpenseWriteThroughStorage;
  customCategories?: readonly CustomCategoryInput[] | undefined;
}

export function BulkImportSheet({
  open,
  onClose,
  storage,
  customCategories,
}: BulkImportSheetProps) {
  const [stage, setStage] = useState<Stage>("choose");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [reviewRows, setReviewRows] = useState<BulkReviewRow[]>([]);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);
  const [pendingCsvText, setPendingCsvText] = useState<string | null>(null);
  const [mapperHeaders, setMapperHeaders] = useState<string[]>([]);
  const [mapperSampleRows, setMapperSampleRows] = useState<string[][]>([]);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(
    null,
  );
  const [processing, setProcessing] = useState<ScanStatusState | null>(null);

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const armPinchZoomReset = useResetPinchZoomAfterCameraCapture();

  const screenshotAnalyze = useImportScreenshotAnalyze();
  const statementPreview = useImportStatementPreview();
  const commit = useImportCommit({ storage });
  const batchUndo = useImportBatchUndo({ storage });

  useEffect(() => {
    if (open) return;
    // Deferred to a microtask — see `ReceiptScanSheet.tsx`'s identical
    // comment: a synchronous `setState` directly in the effect body trips
    // `react-hooks/set-state-in-effect`.
    void Promise.resolve().then(() => {
      setStage("choose");
      setFlowError(null);
      setImportSource(null);
      setReviewRows([]);
      setSkippedNote(null);
      setPendingCsvText(null);
      setMapperHeaders([]);
      setMapperSampleRows([]);
      setCommitResult(null);
      setProcessing(null);
    });
  }, [open]);

  /** Повертає з `processing` на вибір файлу з поясненням, що пішло не так.
   * Будь-який вихід із розпізнавання проходить через неї — інакше аркуш
   * лишався б зі спінером, який уже нічого не чекає. */
  const failBackToChoose = (message: string) => {
    setFlowError(message);
    setProcessing(null);
    setStage("choose");
  };

  const handleScreenshotSelected = async (file: File) => {
    setFlowError(null);
    // Спінер до `await`: стиснення великого фото саме по собі помітна
    // пауза, і саме вона першою читалась як зависання.
    setProcessing({ label: "Готую фото…", hint: SCREENSHOT_SLOW_HINT });
    setStage("processing");
    const imageResult = await readReceiptImageFile(file);
    if (!imageResult.ok) {
      failBackToChoose(imageResult.error);
      return;
    }
    setProcessing({
      label: "Розпізнаю транзакції…",
      hint: SCREENSHOT_SLOW_HINT,
    });
    try {
      const { draft } = await screenshotAnalyze.mutateAsync(
        imageResult.payload,
      );
      if (draft.docType === "receipt") {
        failBackToChoose(
          "Це схоже на чек, не скрін банкінгу. Використай «Сканувати чек», там можна і кілька фото одразу.",
        );
        return;
      }
      if (draft.docType === "other" || draft.rows.length === 0) {
        failBackToChoose("Не вдалось розпізнати транзакції на скріні.");
        return;
      }
      setImportSource("bank_screenshot");
      setReviewRows(
        screenshotRowsToBulkReviewRows(draft.rows, defaultCategoryFor),
      );
      setSkippedNote(null);
      setProcessing(null);
      setStage("bulk-review");
    } catch (err) {
      failBackToChoose(formatReceiptError(err, "Не вдалось розпізнати скрін."));
    }
  };

  const applyStatementPreview = (
    response: Awaited<ReturnType<typeof statementPreview.mutateAsync>>,
    csvText: string,
  ) => {
    setProcessing(null);
    if (response.needsMapping) {
      setPendingCsvText(csvText);
      setMapperHeaders(response.headers ?? []);
      setMapperSampleRows(response.sampleRows ?? []);
      setStage("csv-mapper");
      return;
    }
    setImportSource("bank_statement");
    setReviewRows(
      statementRowsToBulkReviewRows(response.rows, defaultCategoryFor),
    );
    setSkippedNote(summarizeSkipped(response.skipped));
    setStage("bulk-review");
  };

  const handleCsvSelected = async (file: File) => {
    setFlowError(null);
    setProcessing({ label: "Читаю виписку…", hint: CSV_SLOW_HINT });
    setStage("processing");
    const csvResult = await readCsvTextFile(file);
    if (!csvResult.ok) {
      failBackToChoose(csvResult.error);
      return;
    }
    try {
      const response = await statementPreview.mutateAsync({
        csv_text: csvResult.text,
      });
      applyStatementPreview(response, csvResult.text);
    } catch (err) {
      failBackToChoose(
        formatReceiptError(err, "Не вдалось прочитати виписку."),
      );
    }
  };

  const handleMapperSubmit = async (
    mapping: Parameters<typeof statementPreview.mutateAsync>[0]["mapping"],
  ) => {
    if (!pendingCsvText) return;
    setFlowError(null);
    // Тут стадію НЕ міняємо: мапер лишається змонтованим навмисно (його
    // власні колонки живуть у `useState`, і підміна на спінер губила б
    // вибір людини при невдалому re-preview — CodeRabbit round 5, #818).
    // Очікування показує кнопка самого `ColumnMapper` (`isSubmitting`).
    try {
      const response = await statementPreview.mutateAsync({
        csv_text: pendingCsvText,
        mapping,
      });
      applyStatementPreview(response, pendingCsvText);
    } catch (err) {
      setFlowError(formatReceiptError(err, "Не вдалось прочитати виписку."));
    }
  };

  const handleCommit = async () => {
    if (!importSource) return;
    setFlowError(null);
    try {
      const response = await commit.mutateAsync({
        source: importSource,
        rows: toCommitRows(reviewRows),
      });
      setCommitResult(response);
      setStage("commit-summary");
    } catch (err) {
      setFlowError(formatReceiptError(err, "Не вдалось імпортувати."));
    }
  };

  const handleUndo = async () => {
    if (!commitResult) return;
    try {
      await batchUndo.mutateAsync({
        batchId: commitResult.batchId,
        localIds: commitResult.locallyWrittenIds,
      });
      onClose();
    } catch (err) {
      setFlowError(formatReceiptError(err, "Не вдалось скасувати імпорт."));
    }
  };

  const stageTitle: Record<Stage, string> = {
    choose: "Додати документи",
    // Заголовок навмисно той самий, що на виборі файлу: миготіння шапки
    // на секунду-дві саме по собі читається як збій. Про роботу говорить
    // `ScanStatus` у тілі аркуша.
    processing: "Додати документи",
    "csv-mapper": "Налаштуй колонки",
    "bulk-review": "Перевір рядки",
    "commit-summary": "Готово",
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={stageTitle[stage]}
      panelClassName="finyk-sheet"
      bodyClassName="space-y-4"
      footer={
        stage === "bulk-review" ? (
          <Button
            className="w-full"
            module="finyk"
            loading={commit.isPending}
            disabled={reviewRows.every((r) => !r.selected)}
            onClick={() => void handleCommit()}
          >
            Імпортувати
          </Button>
        ) : stage === "commit-summary" &&
          commitResult &&
          commitResult.created > 0 ? (
          <Button
            variant="secondary"
            tone="danger"
            className="w-full"
            loading={batchUndo.isPending}
            onClick={() => void handleUndo()}
          >
            Скасувати імпорт
          </Button>
        ) : undefined
      }
    >
      <input
        ref={screenshotInputRef}
        type="file"
        accept="image/*"
        onClick={armPinchZoomReset}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleScreenshotSelected(file);
        }}
        className="sr-only"
        aria-label="Завантажити скрін банкінгу"
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleCsvSelected(file);
        }}
        className="sr-only"
        aria-label="Завантажити CSV-виписку"
      />

      {flowError && (
        <p className="text-style-caption text-danger-strong dark:text-danger">
          {flowError}
        </p>
      )}

      {stage === "choose" && (
        <div className="space-y-3">
          <Button
            className="w-full"
            module="finyk"
            onClick={() => screenshotInputRef.current?.click()}
          >
            <Icon name="upload" size={16} aria-hidden />
            Скрін банкінгу
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => csvInputRef.current?.click()}
          >
            <Icon name="file-text" size={16} aria-hidden />
            CSV-виписка
          </Button>
          <p className="text-style-caption text-subtle">
            Один файл за раз. Фото чеків — через «Сканувати чек», там можна
            кілька одразу.
          </p>
        </div>
      )}

      {stage === "processing" && processing && (
        <ScanStatus label={processing.label} slowHint={processing.hint} />
      )}

      {stage === "csv-mapper" && (
        // Stays mounted through a re-preview submit (CodeRabbit round 5,
        // PR #818): swapping it for a Spinner while `statementPreview` is
        // pending unmounted this component's own `useState` column picks,
        // so a FAILED re-preview remounted the mapper with default columns
        // instead of what the user actually chose — and `isSubmitting` was
        // dead code (never true at the only moment this branch rendered).
        // `ColumnMapper`'s own submit button now shows the pending state.
        <ColumnMapper
          headers={mapperHeaders}
          sampleRows={mapperSampleRows}
          onSubmit={(mapping) => void handleMapperSubmit(mapping)}
          isSubmitting={statementPreview.isPending}
        />
      )}

      {stage === "bulk-review" && (
        <div className="space-y-3">
          {skippedNote && (
            <p className="text-style-caption text-muted">{skippedNote}</p>
          )}
          <BulkReviewTable
            rows={reviewRows}
            onToggleRow={(id) => setReviewRows((r) => toggleRowSelected(r, id))}
            onToggleAll={(selected) =>
              setReviewRows((r) => setAllSelected(r, selected))
            }
            onBulkCategory={(category) =>
              setReviewRows((r) => applyBulkCategory(r, category))
            }
            onEditRow={(id, patch) =>
              setReviewRows((r) => updateRowField(r, id, patch))
            }
            customCategories={customCategories}
            disabled={commit.isPending}
          />
        </div>
      )}

      {stage === "commit-summary" && commitResult && (
        // Success-тон карткою (бета-фідбек №4: «Створено на зеленому
        // фоні, як Витрата») — той самий фінік-акцент, що й активний чип
        // «Витрата» у ManualExpenseSheet, а не сірий panelHi.
        <div className="space-y-1.5 rounded-2xl border border-finyk/30 bg-finyk/15 p-3 text-style-body text-text">
          <p className="font-semibold text-finyk-strong dark:text-finyk">
            Створено: {commitResult.created}
          </p>
          {commitResult.skipped.monoMatched > 0 && (
            <p className="text-style-caption text-muted">
              {commitResult.skipped.monoMatched} пропущено — вже є в mono.
            </p>
          )}
          {commitResult.skipped.duplicate > 0 && (
            <p className="text-style-caption text-muted">
              {commitResult.skipped.duplicate} пропущено — вже імпортовано
              раніше.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
