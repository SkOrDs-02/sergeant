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
import { Spinner } from "@shared/components/ui/Spinner";
import { useResetPinchZoomAfterCameraCapture } from "@shared/hooks/useResetPinchZoomOnResume";
import type {
  ReceiptAnalyzeRequest,
  ReceiptDraft,
  ReceiptLookupRequest,
} from "@sergeant/api-client";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { DEFAULT_CATEGORY } from "../manualExpenseCategories";
import { formatReceiptError } from "../../lib/receiptErrors";
import { readReceiptImageFile } from "../../lib/receiptImage";
import { parseDpsReceiptQrUrl } from "../../lib/receiptQr";
import { decodeQrFromImageFile } from "../../hooks/useReceiptQrScanner";
import {
  useReceiptSave,
  type ReceiptSaveStorageSlice,
} from "../../hooks/useReceiptSave";
import { ReceiptScanCameraView } from "./ReceiptScanCameraView";
import { ReceiptReviewForm } from "./ReceiptReviewForm";

type Stage = "choose" | "camera" | "processing" | "review";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const armPinchZoomReset = useResetPinchZoomAfterCameraCapture();

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
      resetSave();
    });
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
    setStage("processing");

    const qrText = await decodeQrFromImageFile(file).catch(() => null);
    const lookupReq = qrText ? parseDpsReceiptQrUrl(qrText) : null;
    if (lookupReq) {
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

    const imageResult = await readReceiptImageFile(file);
    if (!imageResult.ok) {
      setFlowError(imageResult.error);
      setStage("choose");
      return;
    }
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
      title={stage === "review" ? "Перевір чек" : "Сканувати чек"}
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
                Скасуй
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
        ) : undefined
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onClick={armPinchZoomReset}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFileSelected(file);
        }}
        className="sr-only"
        aria-label="Завантажити фото чека"
      />

      {stage === "choose" && (
        <div className="space-y-3">
          {flowError && (
            <p className="text-style-caption text-danger-strong dark:text-danger">
              {flowError}
            </p>
          )}
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
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="camera" size={16} aria-hidden />
            Завантажити фото
          </Button>
        </div>
      )}

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
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-2 py-10"
        >
          <Spinner size="md" />
          <p className="text-style-caption text-muted">Шукаю чек…</p>
        </div>
      )}

      {stage === "review" && draft && (
        <ReceiptReviewForm
          draft={draft}
          setDraft={setDraft as Dispatch<SetStateAction<ReceiptDraft>>}
          category={category}
          setCategory={setCategory}
          customCategories={customCategories}
          disabled={isSaving}
        />
      )}
    </Sheet>
  );
}
