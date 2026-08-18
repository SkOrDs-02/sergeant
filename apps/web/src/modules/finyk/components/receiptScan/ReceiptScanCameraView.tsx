/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Камерний QR-view усередині `ReceiptScanSheet` — макет мірить
 * `nutrition/components/BarcodeScanner.tsx::WebBarcodeScanner`
 * (rounded video + quadrant overlay + inline status), адаптований під
 * `finyk`-акцент і вбудований у Sheet-body замість власного full-screen
 * оверлею (сканер тут — ОДНА зі сторінок review-флоу, а не окрема шторка).
 */
import { useReceiptQrScanner } from "../../hooks/useReceiptQrScanner";

export interface ReceiptScanCameraViewProps {
  active: boolean;
  onDetected: (rawText: string) => void;
}

export function ReceiptScanCameraView({
  active,
  onDetected,
}: ReceiptScanCameraViewProps) {
  const { videoRef, status } = useReceiptQrScanner({ active, onDetected });

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
        <video
          ref={videoRef}
          className="aspect-square w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aspect-square w-2/3 rounded-xl border-2 border-finyk/80" />
        </div>
      </div>
      {status ? (
        <p className="text-center text-style-caption text-danger-strong dark:text-danger">
          {status}
        </p>
      ) : (
        <p className="text-center text-style-caption text-subtle">
          Наведи камеру на QR-код чека.
        </p>
      )}
    </div>
  );
}
