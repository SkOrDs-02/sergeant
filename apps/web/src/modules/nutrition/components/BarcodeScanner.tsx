import { useEffect, useRef, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import {
  scanBarcodeNative,
  useBarcodeScanner,
  useWebScanner,
  type BarcodeResult,
} from "../hooks/useBarcodeScanner";

interface BarcodeScannerProps {
  /**
   * Fires with the raw barcode string (digits for EAN/UPC etc.). The
   * existing nutrition flows only care about the code — format and raw
   * bytes are available on the internal `BarcodeResult` but not exposed
   * here to keep the component's public surface backwards compatible.
   */
  onDetected: (raw: string) => void;
  onClose: () => void;
}

function NativeBarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const toast = useToast();

  // Stash the latest callbacks + toast API in refs so the native-scan
  // effect can read them without listing any of them in its dependency
  // array. The ML Kit modal is asynchronous; if we depended on
  // `onClose` / `onDetected` / `toast`, a transient re-render (for
  // example when an unrelated toast auto-dismisses and the `ToastContext`
  // value changes identity, or when the parent passes inline arrow
  // callbacks — `NutritionOverlays.tsx` does exactly that) would run the
  // effect's cleanup and flip `cancelled = true`, silently dropping the
  // scan result when `scanBarcodeNative()` later resolves.
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;
  toastRef.current = toast;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result: BarcodeResult | null = await scanBarcodeNative();
        if (cancelled) return;
        if (result?.code) {
          onDetectedRef.current(result.code);
        } else {
          onCloseRef.current();
        }
      } catch (err) {
        if (cancelled) return;
        const msg = (err as Error)?.message ?? "";
        if (msg === "camera-permission-denied") {
          toastRef.current.error(
            "Потрібен дозвіл на камеру. Увімкни його в налаштуваннях додатку.",
          );
        } else {
          toastRef.current.error("Сканер недоступний. Введи код вручну.");
        }
        onCloseRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ML Kit presents its own full-screen scanner UI; no DOM is required,
  // but we keep an accessible live region so screen-reader users know
  // what is happening while the modal loads.
  return (
    <div role="status" aria-live="polite" className="sr-only">
      Відкриваю нативний сканер штрих-коду…
    </div>
  );
}

function WebBarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const [active, setActive] = useState(true);

  const { videoRef, status } = useWebScanner({
    active,
    onDetected: (result) => {
      setActive(false);
      onDetected(result.code);
    },
  });

  const handleClose = () => {
    setActive(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-130 flex items-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Закрити сканер"
        onClick={handleClose}
      />
      <div className="relative w-full bg-panel rounded-t-3xl border-t border-line shadow-soft">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-line rounded-full" aria-hidden />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="text-sm font-extrabold text-text">
            Сканер штрих-коду
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text text-lg transition-colors"
            aria-label="Закрити сканер"
          >
            ✕
          </button>
        </div>
        <div className="px-4 pb-8 space-y-3">
          <div className="rounded-2xl overflow-hidden border border-line bg-black relative">
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover"
              muted
              playsInline
              autoPlay
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-1/2 border-2 border-nutrition/80 rounded-xl" />
            </div>
          </div>
          {status ? (
            <p className="text-xs text-danger">{status}</p>
          ) : (
            <p className="text-xs text-subtle text-center">
              Наведи камеру на штрих-код. Якщо не зчитує — введи код вручну.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Barcode scanner overlay.
 *
 * Inside a Capacitor WebView this delegates to the native ML Kit plugin
 * (loaded via a code-split dynamic import from `@sergeant/mobile-shell`)
 * and renders no UI of its own — ML Kit shows a full-screen modal. In a
 * browser it falls back to the existing `getUserMedia` + BarcodeDetector
 * / zxing flow, which is unchanged from before.
 */
export function BarcodeScanner(props: BarcodeScannerProps) {
  const { isNative } = useBarcodeScanner();
  return isNative ? (
    <NativeBarcodeScanner {...props} />
  ) : (
    <WebBarcodeScanner {...props} />
  );
}
