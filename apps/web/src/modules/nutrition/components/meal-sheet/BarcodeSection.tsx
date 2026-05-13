import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";

interface BarcodeSectionProps {
  barcode: string;
  setBarcode: Dispatch<SetStateAction<string>>;
  barcodeStatus: string;
  setBarcodeStatus: Dispatch<SetStateAction<string>>;
  handleBarcodeLookup: (barcode: string) => void | Promise<void>;
  handleBarcodeBind: (barcode: string) => void | Promise<void>;
  setScannerOpen: Dispatch<SetStateAction<boolean>>;
}

export function BarcodeSection({
  barcode,
  setBarcode,
  barcodeStatus,
  setBarcodeStatus,
  handleBarcodeLookup,
  handleBarcodeBind,
  setScannerOpen,
}: BarcodeSectionProps) {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-panel/40 px-3 py-3">
      <SectionHeading as="div" size="xs" className="mb-2">
        Штрихкод
      </SectionHeading>
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={barcode}
          onChange={(e) => {
            setBarcode(e.target.value.replace(/\s+/g, ""));
            setBarcodeStatus("");
          }}
          inputMode="numeric"
          placeholder="EAN/UPC…"
          aria-label="Штрихкод"
          className="w-[160px]"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handleBarcodeLookup(barcode)}
        >
          Знайти
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handleBarcodeBind(barcode)}
        >
          Прив{"'"}язати
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9 text-xs"
          onClick={() => {
            setBarcodeStatus("");
            setScannerOpen(true);
          }}
        >
          📷 Сканувати
        </Button>
      </div>
      {barcodeStatus && (
        <div className="text-xs text-subtle mt-1">{barcodeStatus}</div>
      )}
    </div>
  );
}
