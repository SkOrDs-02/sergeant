/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Камерний QR-сканер чек-скану v1 (спека § Флоу v1: "камера getUserMedia +
 * zxing (QR-режим)"). Патерн лінивого завантаження і feature-detection
 * ПЕРЕВИКОРИСТАНО з `modules/nutrition/hooks/useBarcodeScanner.ts::useWebScanner`
 * (native `BarcodeDetector` спершу, zxing — динамічний `import()` конкретного
 * reader-класу, fallback) — та ж архітектура, власна копія замість
 * крос-модульного імпорту (finyk не залежить від nutrition; nutrition-хук
 * і так жорстко заточений під 1D product-штрихкоди, не QR).
 *
 * ЖОДНОГО eager-імпорту `@zxing/*` — обидва шляхи (`useReceiptQrScanner`,
 * `decodeQrFromImageFile`) імпортують `BrowserQRCodeReader` лише в момент
 * реального сканування, з того самого `vendor-zxing` chunk, що вже existing
 * (`apps/web/vite.config.js` `manualChunks`), тож eager-бандл (280 kB gate)
 * цей файл не зачіпає.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

/** Структурний тип experimental Web API `BarcodeDetector` — не в
 * `lib.dom.d.ts`. Той самий `declare global` augmentation, що
 * `nutrition/hooks/useBarcodeScanner.ts` (звідти й патерн): дві незалежні
 * augmentation-и `Window.BarcodeDetector` зі структурно ІДЕНТИЧНОЮ формою
 * зливаються TypeScript-ом без конфлікту (declaration merging), а пряме
 * читання `window.BarcodeDetector` без касту — саме те, що lint
 * `no-strict-bypass` вимагає замість `as unknown as X`. */
interface NativeBarcodeDetectorInstance {
  detect(
    source: HTMLVideoElement,
  ): Promise<Array<{ rawValue?: string; format?: string }>>;
}
interface NativeBarcodeDetectorCtor {
  new (opts: { formats: string[] }): NativeBarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetectorCtor;
  }
}

function getNativeBarcodeDetectorCtor(): NativeBarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = window.BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

const QR_FORMAT = ["qr_code"];

export interface UseReceiptQrScannerOptions {
  /** Fires with the raw QR text once decoded. The hook stops the camera
   * after this fires — caller re-activates (`active: true`) to scan again. */
  onDetected: (rawText: string) => void;
  /** Whether the camera session should be running. */
  active: boolean;
}

export interface UseReceiptQrScannerState {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  status: string;
}

async function startZxingQrScanner(
  videoEl: HTMLVideoElement | null,
  stream: MediaStream | null,
  onDetected: (rawText: string) => void,
  cancelRef: MutableRefObject<boolean>,
  zxingStopRef: MutableRefObject<(() => void) | null>,
) {
  // Deep import — same "avoid the @zxing/browser root barrel" rationale
  // as nutrition's `BrowserMultiFormatOneDReader` import: the root barrel
  // `export *`s every reader (1D/QR/DataMatrix/PDF417/…) and Rollup can't
  // reliably tree-shake across it.
  const { BrowserQRCodeReader } =
    await import("@zxing/browser/esm/readers/BrowserQRCodeReader.js");
  // Callers only invoke this once both are attached (camera-session
  // effect below); bail defensively instead of asserting non-null.
  if (cancelRef.current || !stream || !videoEl) return;

  const reader = new BrowserQRCodeReader();

  const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
    if (cancelRef.current) return;
    if (result) {
      const raw = result.getText();
      if (raw) onDetected(raw);
    }
  });

  zxingStopRef.current = () => {
    try {
      controls?.stop?.();
    } catch {
      /* ignore */
    }
    try {
      (reader as { reset?: () => void }).reset?.();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Камерна сесія: `getUserMedia`, native `BarcodeDetector` (QR-формат) якщо
 * доступний, інакше zxing. Повертає `videoRef` для `<video>` і `status`
 * для inline error-повідомлення.
 */
export function useReceiptQrScanner({
  onDetected,
  active,
}: UseReceiptQrScannerOptions): UseReceiptQrScannerState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRef = useRef(false);
  const zxingStopRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const [status, setStatus] = useState("");

  const stopAll = useCallback(() => {
    cancelRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (typeof zxingStopRef.current === "function") {
      zxingStopRef.current();
      zxingStopRef.current = null;
    }
    try {
      const s = streamRef.current;
      if (s) for (const t of s.getTracks()) t.stop();
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Same ref-indirection as nutrition's hook: keeps the camera-session
  // effect stable across parent re-renders that pass a fresh inline
  // `onDetected` callback.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const handleDetected = useCallback(
    (rawText: string) => {
      stopAll();
      onDetectedRef.current(rawText);
    },
    [stopAll],
  );

  useEffect(() => {
    if (!active) return;
    cancelRef.current = false;

    const run = async () => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setStatus("Камера недоступна в цьому браузері.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        setStatus("Не вдалося відкрити камеру. Перевір дозволи.");
        return;
      }

      if (cancelRef.current) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      if (cancelRef.current) return;

      const BarcodeDetectorCtor = getNativeBarcodeDetectorCtor();
      let detector: NativeBarcodeDetectorInstance | null = null;
      if (BarcodeDetectorCtor) {
        try {
          const supported: string[] =
            await (BarcodeDetectorCtor.getSupportedFormats?.() ??
              Promise.resolve([]));
          const hasQr =
            !Array.isArray(supported) ||
            supported.length === 0 ||
            supported.includes("qr_code");
          if (hasQr) {
            detector = new BarcodeDetectorCtor({ formats: QR_FORMAT });
          }
        } catch {
          detector = null;
        }
      }

      if (detector) {
        // Re-bind to a fresh `const` right after the null-check: TS narrows
        // `detector` to non-null in THIS scope, but the narrowing doesn't
        // survive capture by the nested `tick` closure defined below (a
        // known TS control-flow limitation) — `activeDetector` carries the
        // narrowed type into the closure without a non-null assertion.
        const activeDetector = detector;
        let consecutiveErrors = 0;
        let lastTickTime = 0;
        const tick = async () => {
          if (cancelRef.current) return;
          const now = performance.now();
          if (now - lastTickTime < 150) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          lastTickTime = now;
          try {
            const v = videoRef.current;
            if (v && v.readyState >= 2 && v.videoWidth > 0) {
              const codes = await activeDetector.detect(v);
              consecutiveErrors = 0;
              const raw = codes?.[0]?.rawValue;
              if (raw) {
                handleDetected(String(raw));
                return;
              }
            }
          } catch {
            consecutiveErrors++;
            if (consecutiveErrors >= 5) {
              if (!cancelRef.current) {
                startZxingQrScanner(
                  videoRef.current,
                  streamRef.current,
                  handleDetected,
                  cancelRef,
                  zxingStopRef,
                ).catch(() =>
                  setStatus(
                    "Сканер не підтримується. Спробуй сфотографувати чек.",
                  ),
                );
              }
              return;
            }
          }
          if (!cancelRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      try {
        await startZxingQrScanner(
          videoRef.current,
          streamRef.current,
          handleDetected,
          cancelRef,
          zxingStopRef,
        );
      } catch {
        setStatus(
          "Сканер не підтримується в цьому браузері. Спробуй сфотографувати чек.",
        );
      }
    };

    void run();

    return () => {
      stopAll();
    };
  }, [active, handleDetected, stopAll]);

  return { videoRef, status };
}

/**
 * Одноразовий QR-декод зі статичного зображення (шлях "фото чека" —
 * спека § Флоу v1 і § Фаза 2а: "клієнт спершу пробує zxing-decode QR
 * прямо з фото"). Повертає сирий текст QR, або `null`, якщо QR не
 * знайдено/не прочитано — виклик тоді переходить у vision-шлях
 * (`analyzeReceipt`).
 */
export async function decodeQrFromImageFile(
  file: Blob,
): Promise<string | null> {
  const { BrowserQRCodeReader } =
    await import("@zxing/browser/esm/readers/BrowserQRCodeReader.js");
  const reader = new BrowserQRCodeReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    const raw = result.getText();
    return raw || null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
