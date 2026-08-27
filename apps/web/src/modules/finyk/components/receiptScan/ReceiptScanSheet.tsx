/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Чек-скан v1 (спека `docs/90-work/planning/specs/receipt-scan.md` §
 * Флоу v1 / § Web UI). Стани: `choose` (камера АБО фото) → `camera`
 * (живий QR-скан) / `processing` (lookup чи analyze у польоті) →
 * `review` (редагована чернетка, `ReceiptReviewForm`) → «Зберегти».
 *
 * Обидва вхідні шляхи (камера, фото) намагаються ЛОКАЛЬНИЙ QR-декод
 * ПЕРШИМ (лук — $0, точний); vision (`analyzeReceipt`) — фолбек, коли QR
 * нема/не читається/ДПС не знайшла чек. Це той самий "chекі пачкою"
 * порядок, що описаний у спеці § Фаза 2а — тут застосований до
 * одиничного скану.
 *
 * ПОКИ `DPS_QR_SCAN_ENABLED === false` (реєстр ДПС закритий на воєнний
 * стан — `dpsQrGate.ts`): кнопки QR-скану нема, фото йде ОДРАЗУ у vision
 * без спроби QR-lookup (вона гарантовано впиралась би у відмову і лише
 * додавала латентність). Камера-стейдж і QR-обробники лишаються в коді —
 * оживуть фліпом гейта.
 *
 * «Чеки пачкою» (спека § Фаза 2а) живуть ТУТ, а не в «Додати документи»
 * (бета-фідбек №2, 2026-08-18): фото чеків — це про чеки, тож пікер
 * приймає кілька фото одразу (`multiple`); 1 файл → одиничний review-флоу,
 * 2+ → стадія `batch` (`useBulkReceiptsImport` + `BulkReceiptsProgress`).
 * `BulkImportSheet` лишився банківським докам (скрін/CSV).
 *
 * Глибина пачки (бета-фідбек №3, 2026-08-18): «Редагувати» на рядку
 * відкриває ПОВНИЙ `ReceiptReviewForm` того чека (позиції включно) —
 * `editingItemId` + `bulkReceipts.updateItemDraft`; «Готово» повертає
 * в список. Порожній драфт («схоже, не чек») приходить авто-виключеним
 * і повертається у вибрані сам, щойно людина заповнила поля.
 */
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { useResetPinchZoomAfterCameraCapture } from "@shared/hooks/useResetPinchZoomOnResume";
import type {
  ReceiptAnalyzeRequest,
  ReceiptDraft,
  ReceiptLookupRequest,
} from "@sergeant/api-client";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { DEFAULT_CATEGORY } from "../manualExpenseCategories";
import { draftLooksUnrecognized } from "../receiptDraftEdit";
import { formatReceiptError } from "../../lib/receiptErrors";
import { readReceiptImageFile } from "../../lib/receiptImage";
import { parseDpsReceiptQrUrl } from "../../lib/receiptQr";
import { decodeQrFromImageFile } from "../../hooks/useReceiptQrScanner";
import {
  useReceiptSave,
  type ReceiptSaveStorageSlice,
} from "../../hooks/useReceiptSave";
import {
  useBulkReceiptsImport,
  BATCH_RECEIPTS_MAX_FILES,
} from "../../hooks/useBulkReceiptsImport";
import { BulkReceiptsProgress } from "../bulkImport/BulkReceiptsProgress";
import { ScanStatus, type ScanStatusState } from "../ScanStatus";
import { DPS_QR_SCAN_ENABLED } from "./dpsQrGate";
import { ReceiptScanCameraView } from "./ReceiptScanCameraView";
import { ReceiptReviewForm } from "./ReceiptReviewForm";

type Stage = "choose" | "camera" | "processing" | "review" | "batch";

/** Стадія `processing` тривала до 20 секунд під одним незмінним «Шукаю
 * чек…» — рівно те, що тестерка описала як «фрозен скрін» (бета-фідбек
 * №5, 2026-08-18). Тепер кожна реальна фаза має свій рядок. */
const PREPARING: ScanStatusState = {
  label: "Готую фото…",
  hint: "Ще працюю. Що більше позицій у чеку, то довше розпізнавання.",
};
const RECOGNIZING: ScanStatusState = {
  label: "Розпізнаю чек…",
  hint: PREPARING.hint,
};
const DPS_LOOKUP: ScanStatusState = {
  label: "Шукаю чек у ДПС…",
  hint: "Ще чекаю на відповідь ДПС.",
};

export interface ReceiptScanSheetProps {
  open: boolean;
  onClose: () => void;
  storage: ReceiptSaveStorageSlice;
  onReceiptLinked: (txRef: string, receiptId: number) => void;
  /** Fired after a successful save so the parent can toast — kept
   * copy-agnostic here (mirrors how `ManualExpenseSheet.onSave` defers
   * toast text to `FinykApp`). */
  onSaved: (alreadyExists: boolean) => void;
  customCategories?: readonly CustomCategoryInput[] | undefined;
}

export function ReceiptScanSheet({
  open,
  onClose,
  storage,
  onReceiptLinked,
  onSaved,
  customCategories,
}: ReceiptScanSheetProps) {
  const [stage, setStage] = useState<Stage>("choose");
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [flowError, setFlowError] = useState<string | null>(null);
  // Bumping this key fully remounts `ReceiptScanCameraView` — the
  // cleanest way to "resume scanning" after an invalid (non-DPS) QR hit,
  // since `useReceiptQrScanner` always stops the camera on ANY detection.
  const [cameraKey, setCameraKey] = useState(0);
  const [batchCapNote, setBatchCapNote] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ScanStatusState>(RECOGNIZING);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const armPinchZoomReset = useResetPinchZoomAfterCameraCapture();
  const bulkReceipts = useBulkReceiptsImport({ storage, onReceiptLinked });

  const lookupMutation = useMutation({
    mutationFn: (req: ReceiptLookupRequest) =>
      apiClient.finyk.lookupReceipt(req),
  });
  const analyzeMutation = useMutation({
    mutationFn: (payload: ReceiptAnalyzeRequest) =>
      apiClient.finyk.analyzeReceipt(payload),
  });
  const {
    saveReceipt,
    isSaving,
    error: saveError,
    reset: resetSave,
  } = useReceiptSave({ storage, onReceiptLinked });

  useEffect(() => {
    if (open) return;
    // Deferred to a microtask — a synchronous `setState` directly in the
    // effect body trips `react-hooks/set-state-in-effect` (same pattern as
    // `ManualExpenseSheet.tsx`'s own reset-on-close effect).
    void Promise.resolve().then(() => {
      setStage("choose");
      setDraft(null);
      setCategory(DEFAULT_CATEGORY);
      setFlowError(null);
      setBatchCapNote(null);
      setEditingItemId(null);
      resetSave();
      bulkReceipts.reset();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset-on-close only; `bulkReceipts` — новий обʼєкт щорендера (той самий патерн, що в BulkImportSheet до переносу).
  }, [open, resetSave]);

  const openReview = (nextDraft: ReceiptDraft) => {
    setDraft(nextDraft);
    setCategory(DEFAULT_CATEGORY);
    setFlowError(null);
    setStage("review");
  };

  const handleQrDetected = async (rawText: string) => {
    const req = parseDpsReceiptQrUrl(rawText);
    if (!req) {
      setFlowError(
        "QR не схожий на чек ДПС. Спробуй ще раз або сфотографуй чек.",
      );
      setCameraKey((k) => k + 1);
      return;
    }
    setFlowError(null);
    setProcessing(DPS_LOOKUP);
    setStage("processing");
    try {
      const { draft: nextDraft } = await lookupMutation.mutateAsync(req);
      openReview(nextDraft);
    } catch (err) {
      setFlowError(formatReceiptError(err, "Не вдалось знайти чек."));
      setStage("camera");
      setCameraKey((k) => k + 1);
    }
  };

  const handleFileSelected = async (file: File) => {
    setFlowError(null);
    // Спінер до першого `await`: QR-декод і стиснення фото самі по собі
    // помітна пауза, і саме вона першою читається як зависання.
    setProcessing(PREPARING);
    setStage("processing");

    // QR-lookup лише коли ДПС-гілка жива (`dpsQrGate.ts`) — інакше це
    // гарантована відмова + зайва латентність перед vision.
    if (DPS_QR_SCAN_ENABLED) {
      const qrText = await decodeQrFromImageFile(file).catch(() => null);
      const lookupReq = qrText ? parseDpsReceiptQrUrl(qrText) : null;
      if (lookupReq) {
        setProcessing(DPS_LOOKUP);
        try {
          const { draft: nextDraft } =
            await lookupMutation.mutateAsync(lookupReq);
          openReview(nextDraft);
          return;
        } catch {
          // ДПС не відповіла навіть з QR у фото — пробуємо vision на ТОМУ Ж
          // фото замість повторного запиту дії від користувача (§ докстрінг).
        }
      }
    }

    const imageResult = await readReceiptImageFile(file);
    if (!imageResult.ok) {
      setFlowError(imageResult.error);
      setStage("choose");
      return;
    }
    setProcessing(RECOGNIZING);
    try {
      const { draft: nextDraft } = await analyzeMutation.mutateAsync(
        imageResult.payload,
      );
      openReview(nextDraft);
    } catch (err) {
      setFlowError(formatReceiptError(err, "Не вдалось розпізнати чек."));
      setStage("choose");
    }
  };

  const handleBatchSelected = (files: File[]) => {
    setFlowError(null);
    // Кап застосовує `startFiles` (slice до BATCH_RECEIPTS_MAX_FILES) — але
    // МОВЧКИ: без примітки людина, що вибрала 15 фото, дізналась би про
    // відкинуті 5 лише перерахувавши список (бета-фідбек 2026-08-18).
    setBatchCapNote(
      files.length > BATCH_RECEIPTS_MAX_FILES
        ? `Взято перші ${BATCH_RECEIPTS_MAX_FILES} фото з ${files.length}, решту докинь наступною пачкою після збереження цієї.`
        : null,
    );
    setEditingItemId(null);
    setStage("batch");
    void bulkReceipts.startFiles(files);
  };

  // Повний review одного чека пачки: живий лише поки item існує і ще
  // редагований (drafted) — після save/помилки повертаємось у список.
  const editingItem =
    stage === "batch" && editingItemId
      ? (bulkReceipts.items.find(
          (i) => i.id === editingItemId && i.status === "drafted" && i.draft,
        ) ?? null)
      : null;

  const handleSave = async () => {
    if (!draft) return;
    try {
      const result = await saveReceipt(draft, category || DEFAULT_CATEGORY);
      onSaved(result.alreadyExists);
      onClose();
    } catch {
      // Error surfaces below the form via `saveError` — stay on review.
    }
  };

  const saveErrorText = saveError
    ? formatReceiptError(saveError, "Не вдалось зберегти чек.")
    : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        stage === "review" || editingItem
          ? "Перевір чек"
          : stage === "batch"
            ? "Чеки пачкою"
            : "Сканувати чек"
      }
      panelClassName="finyk-sheet"
      bodyClassName="space-y-4"
      footer={
        stage === "review" ? (
          <div className="space-y-2">
            {saveErrorText && (
              <p className="text-style-caption text-danger-strong dark:text-danger">
                {saveErrorText}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={onClose}
                disabled={isSaving}
              >
                Скасувати
              </Button>
              <Button
                className="flex-1"
                module="finyk"
                onClick={() => void handleSave()}
                loading={isSaving}
              >
                Зберегти
              </Button>
            </div>
          </div>
        ) : editingItem ? (
          <Button
            className="w-full"
            module="finyk"
            onClick={() => setEditingItemId(null)}
          >
            Готово
          </Button>
        ) : undefined
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onClick={armPinchZoomReset}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          const first = files[0];
          if (!first) return;
          if (files.length === 1) void handleFileSelected(first);
          else handleBatchSelected(files);
        }}
        className="sr-only"
        aria-label="Завантажити фото чеків"
      />

      {stage === "choose" && (
        <div className="space-y-3">
          {flowError && (
            <p className="text-style-caption text-danger-strong dark:text-danger">
              {flowError}
            </p>
          )}
          {DPS_QR_SCAN_ENABLED && (
            <Button
              className="w-full"
              module="finyk"
              onClick={() => {
                setFlowError(null);
                setStage("camera");
              }}
            >
              <Icon name="scanner" size={16} aria-hidden />
              Скан QR камерою
            </Button>
          )}
          <Button
            variant={DPS_QR_SCAN_ENABLED ? "secondary" : "primary"}
            module={DPS_QR_SCAN_ENABLED ? undefined : "finyk"}
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="camera" size={16} aria-hidden />
            Завантажити фото
          </Button>
          <p className="text-style-caption text-subtle">
            Можна вибрати одразу кілька фото, до {BATCH_RECEIPTS_MAX_FILES}{" "}
            чеків за раз, кожен збережеться окремою витратою.
          </p>
        </div>
      )}

      {stage === "batch" &&
        (editingItem && editingItem.draft ? (
          <>
            <Button
              type="button"
              variant="ghost"
              tone="finyk"
              size="xs"
              onClick={() => setEditingItemId(null)}
            >
              ← До списку чеків
            </Button>
            {draftLooksUnrecognized(editingItem.draft) && (
              <p
                role="status"
                className="rounded-xl border border-line bg-panelHi/60 p-2.5 text-style-caption text-text"
              >
                Схоже, на фото не чек: розпізнати нічого не вдалося. Заповни
                поля вручну, і чек повернеться у вибрані.
              </p>
            )}
            <ReceiptReviewForm
              draft={editingItem.draft}
              setDraft={(action) =>
                bulkReceipts.updateItemDraft(editingItem.id, action)
              }
              category={editingItem.category}
              setCategory={(c) =>
                bulkReceipts.setItemCategory(editingItem.id, c)
              }
              customCategories={customCategories}
              disabled={bulkReceipts.isSaving}
            />
          </>
        ) : (
          <>
            {batchCapNote && (
              <p
                role="status"
                className="rounded-xl border border-line bg-panelHi/60 p-2.5 text-style-caption text-text"
              >
                {batchCapNote}
              </p>
            )}
            <BulkReceiptsProgress
              items={bulkReceipts.items}
              isProcessing={bulkReceipts.isProcessing}
              isSaving={bulkReceipts.isSaving}
              onSetCategory={bulkReceipts.setItemCategory}
              onToggleIncluded={bulkReceipts.toggleItemIncluded}
              onEditItem={setEditingItemId}
              onSaveAll={() => void bulkReceipts.saveAll()}
              customCategories={customCategories}
            />
          </>
        ))}

      {stage === "camera" && (
        <div className="space-y-3">
          {flowError && (
            <p className="text-style-caption text-danger-strong dark:text-danger">
              {flowError}
            </p>
          )}
          <ReceiptScanCameraView
            key={cameraKey}
            active={stage === "camera"}
            onDetected={(rawText) => void handleQrDetected(rawText)}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            Немає QR? Сфотографуй чек
          </Button>
        </div>
      )}

      {stage === "processing" && (
        <ScanStatus label={processing.label} slowHint={processing.hint} />
      )}

      {stage === "review" && draft && (
        <>
          {draftLooksUnrecognized(draft) && (
            <p
              role="status"
              className="rounded-xl border border-line bg-panelHi/60 p-2.5 text-style-caption text-text"
            >
              Схоже, на фото не чек: розпізнати нічого не вдалося. Спробуй
              чіткіше фото чека або заповни поля вручну.
            </p>
          )}
          <ReceiptReviewForm
            draft={draft}
            setDraft={setDraft as Dispatch<SetStateAction<ReceiptDraft>>}
            category={category}
            setCategory={setCategory}
            customCategories={customCategories}
            disabled={isSaving}
          />
        </>
      )}
    </Sheet>
  );
}
