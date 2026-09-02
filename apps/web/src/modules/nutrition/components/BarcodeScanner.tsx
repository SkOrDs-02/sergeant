/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import {
  scanBarcodeNative,
  useBarcodeScanner,
  useWebScanner,
  type BarcodeResult,
} from "../hooks/useBarcodeScanner";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";

interface BarcodeScannerProps {
  /**
   * Fires with the raw barcode string (digits for EAN/UPC etc.). The
   * existing nutrition flows only care about the code — format and raw
   * bytes are available on the internal `BarcodeResult` but not exposed
   * here to keep the component's public surface backwards compatible.
   */
  onDetected: (raw: string) => void;
  onClose: () => void;
  /**
   * Вихід для випадку «камера код не бере». Коли переданий, сканер через
   * `NO_READ_HINT_MS` мовчання пропонує піти вводити руками; коли ні —
   * лишає саму підказку без кнопки (у комори свій маршрут).
   */
  onManualEntry?: (() => void) | undefined;
}

/**
 * Скільки чекати, доки визнати, що код не читається.
 *
 * AI-CONTEXT: сканер не має стану «не вдалося» — zxing просто крутить
 * кадри вічно. Доти єдиною порадою був підпис «введи код вручну», який
 * вів у нікуди: поля для коду в аркуші немає й ніколи не було, сканування
 * лише камерою (звіт тестера 2026-08-23). 15 с — приблизно вдвічі більше
 * за типовий успішний скан, тож підказка не вискакує тим, хто просто
 * наводить камеру повільно.
 */
const NO_READ_HINT_MS = 15_000;

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
  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
    toastRef.current = toast;
  }, [onDetected, onClose, toast]);

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
          toastRef.current.error("Сканер недоступний. Додай страву вручну.");
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

function WebBarcodeScanner({
  onDetected,
  onClose,
  onManualEntry,
}: BarcodeScannerProps) {
  const [active, setActive] = useState(true);
  const [noRead, setNoRead] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { videoRef, status } = useWebScanner({
    active,
    onDetected: (result) => {
      setActive(false);
      onDetected(result.code);
    },
  });

  const handleClose = useCallback(() => {
    setActive(false);
    onClose();
  }, [onClose]);

  // AI-DANGER: без цієї реєстрації сканер живий лише на вигляд.
  //
  // `Sheet` вмикає `inertBackground`, і background-inert manager ставить
  // `inert` + `aria-hidden` на все, що не веде до відкритого діалогу.
  // Аркуш іде порталом у `<body>`, а сканер — ні: `AddMealSheet` рендерить
  // його там, де стоїть сам, тобто всередині `#root`. Тож аркуш робив
  // інертним `#root` РАЗОМ зі сканером у ньому: сканер малювався зверху
  // (`z-130` проти `z-120`), але хрестик і затемнення не отримували подій,
  // а тапи провалювались на кнопки аркуша під ним (звіт тестера
  // 2026-08-23, підтверджено `elementsFromPoint` на превʼю-білді).
  //
  // Реєстрація як діалогу — і є лікування: менеджер знімає `inert` з
  // гілки, що веде сюди, і переносить його на аркуш. Це той самий випадок
  // «ConfirmDialog поверх Sheet», який описано в `useDialogFocusTrap`.
  // Не заміняй це на підняття `z-index` чи `pointer-events` — стек тут
  // ніколи не був проблемою.
  useDialogFocusTrap(true, panelRef, {
    onEscape: handleClose,
    inertBackground: true,
  });

  // Таймер лише зводить прапорець угору; «опустити» його не треба —
  // помилка камери має пріоритет у розмітці нижче. Скидати стан прямо в
  // тілі ефекту не можна (`react-hooks/set-state-in-effect`), та й нема
  // за чим: `status` перекриває підказку сам.
  useEffect(() => {
    // Помилка камери має власний текст і власний сенс — не перекривай її
    // підказкою «не читається»: причина там інша (немає дозволу / немає
    // камери), і порада «піднеси ближче» була б брехнею.
    if (!active || status) return;
    const timer = setTimeout(() => setNoRead(true), NO_READ_HINT_MS);
    return () => clearTimeout(timer);
  }, [active, status]);

  return (
    <div className="fixed inset-0 z-130 flex items-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Закрити сканер"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="relative w-full bg-panel rounded-t-3xl border-t border-line shadow-soft"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-line rounded-full" aria-hidden />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <div
            id="barcode-scanner-title"
            className="text-sm font-extrabold text-text"
          >
            Сканер штрих-коду
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Закрити сканер"
          >
            <Icon name="close" size={18} aria-hidden />
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
            <p className="text-style-caption text-danger-strong dark:text-danger">
              {status}
            </p>
          ) : noRead ? (
            <div role="status" className="space-y-2">
              <p className="text-style-body text-muted text-center">
                Не зчитується? Помʼятий або затертий код камера не візьме.
                Знайди продукт за назвою або введи КБЖВ сам.
              </p>
              {onManualEntry && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full min-h-[44px]"
                  onClick={() => {
                    setActive(false);
                    onManualEntry();
                  }}
                >
                  Ввести вручну
                </Button>
              )}
            </div>
          ) : (
            <p className="text-style-caption text-subtle text-center">
              Наведи камеру на штрихкод, зчитається сам.
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
