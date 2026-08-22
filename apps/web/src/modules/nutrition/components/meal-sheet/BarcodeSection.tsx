/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { BarcodeLookupNotice } from "../BarcodeLookupNotice";
import type { BarcodeLookupNotice as BarcodeLookupNoticeState } from "./useBarcodeLookup";

interface BarcodeSectionProps {
  barcodeStatus: string;
  setBarcodeStatus: Dispatch<SetStateAction<string>>;
  barcodeNotice?: BarcodeLookupNoticeState | null | undefined;
  onDismissBarcodeNotice?: (() => void) | undefined;
  onRetryBarcodeLookup?: (() => void) | undefined;
  onUsePhotoForBarcode?: (() => void) | undefined;
  setScannerOpen: Dispatch<SetStateAction<boolean>>;
  /**
   * Підпис кнопки. Під вкладкою «Скан» сканер відкривається сам, тож там
   * кнопка — це повтор, а не основна дія, і підпис має казати саме це.
   * Пропонувати «Сканувати» людині, яка вже обрала «Скан» і дивиться в
   * відкритий сканер, — та сама зайва дія, що й «Аналізувати» під уже
   * запущеним автоаналізом фото.
   */
  actionLabel?: string;
}

export function BarcodeSection({
  barcodeStatus,
  setBarcodeStatus,
  barcodeNotice,
  onDismissBarcodeNotice,
  onRetryBarcodeLookup,
  onUsePhotoForBarcode,
  setScannerOpen,
  actionLabel = "Сканувати",
}: BarcodeSectionProps) {
  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="secondary"
        className="w-full h-12 min-h-[44px] flex items-center justify-center gap-2"
        onClick={() => {
          setBarcodeStatus("");
          onDismissBarcodeNotice?.();
          setScannerOpen(true);
        }}
        aria-label="Сканувати штрихкод"
      >
        <Icon
          name="barcode"
          size="sm"
          aria-hidden
          data-testid="barcode-action-icon"
        />
        <span>{actionLabel}</span>
      </Button>
      {barcodeStatus && !barcodeNotice && (
        <div className="text-style-caption text-subtle mt-1">
          {barcodeStatus}
        </div>
      )}
      {barcodeNotice && onDismissBarcodeNotice && (
        <BarcodeLookupNotice
          kind={barcodeNotice.kind}
          onDismiss={onDismissBarcodeNotice}
          onRetry={onRetryBarcodeLookup}
          onUsePhoto={onUsePhotoForBarcode}
        />
      )}
    </div>
  );
}
