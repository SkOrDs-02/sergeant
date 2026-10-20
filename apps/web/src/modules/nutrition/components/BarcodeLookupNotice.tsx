/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * AI-CONTEXT: закриває аудит nutrition E-6 (barcode 404 ≠ 503 empty-state).
 * `useBarcodeProductLookup` (useBarcodeProduct.ts) уже розрізняє 404
 * ("продукту немає") від 503 ("джерела не відповіли") — цей компонент
 * рендерить ці два стани як різні картки замість спільного текстового
 * рядка, щоб різниця доходила до людини, а не губилась у catch-блоці.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

export type BarcodeLookupNoticeKind = "not-found" | "unavailable";

export interface BarcodeLookupNoticeProps {
  kind: BarcodeLookupNoticeKind;
  /** "Продукт не знайдено" пропонує фото-розпізнавання — лише там, де воно є (meal-sheet). */
  onUsePhoto?: (() => void) | undefined;
  /** "Джерела не відповіли" — можна повторити той самий код без нового скану. */
  onRetry?: (() => void) | undefined;
  /** Закриває картку. Без `onManualEntry` це і є дія кнопки «Ввести вручну». */
  onDismiss: () => void;
  /**
   * Перехід на ручний ввід — там, де його НЕ видно поруч із карткою.
   *
   * AI-CONTEXT: колись кнопка «Ввести вручну» лише закривала картку, і це
   * було чесно: крок джерела був вертикальним стосом, ручний ввід лежав
   * одразу під нею. Вкладки цю передумову скасували — на «Скані» лишилась
   * сама кнопка сканування, і закриття картки кидало людину в порожній
   * екран (звіт власника 2026-08-24). Там, де ручний ввід поруч (комора),
   * проп не передають, і кнопка й далі просто закриває.
   */
  onManualEntry?: (() => void) | undefined;
}

const COPY: Record<BarcodeLookupNoticeKind, { title: string; body: string }> = {
  "not-found": {
    title: "Продукт не знайдено",
    body: "Цього штрихкоду немає в базі, введи КБЖВ вручну.",
  },
  unavailable: {
    title: "Джерела тимчасово не відповідають",
    body: "Це не означає, що продукту немає, бази лежать, а не порожні. Спробуй ще раз за хвилину.",
  },
};

export function BarcodeLookupNotice({
  kind,
  onUsePhoto,
  onRetry,
  onDismiss,
  onManualEntry,
}: BarcodeLookupNoticeProps) {
  const copy = COPY[kind];
  return (
    <div role="status" className="mt-2 border-t border-line pt-3 grid gap-2">
      <div className="min-w-0">
        <div className="text-style-body font-semibold text-text">
          {copy.title}
        </div>
        <p className="text-style-caption text-muted mt-0.5">{copy.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "unavailable" && onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {messages.nutrition.barcodeNoticeRetry}
          </Button>
        )}
        {kind === "not-found" && onUsePhoto && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUsePhoto}
          >
            {messages.nutrition.barcodeNoticeUsePhoto}
          </Button>
        )}
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={onManualEntry ?? onDismiss}
        >
          {messages.nutrition.barcodeNoticeManual}
        </Button>
      </div>
    </div>
  );
}
