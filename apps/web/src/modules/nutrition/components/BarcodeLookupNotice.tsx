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
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

export type BarcodeLookupNoticeKind = "not-found" | "unavailable";

export interface BarcodeLookupNoticeProps {
  kind: BarcodeLookupNoticeKind;
  /** "Продукт не знайдено" пропонує фото-розпізнавання — лише там, де воно є (meal-sheet). */
  onUsePhoto?: (() => void) | undefined;
  /** "Джерела не відповіли" — можна повторити той самий код без нового скану. */
  onRetry?: (() => void) | undefined;
  /** Закриває картку й лишає людину на ручному введенні, яке вже видно нижче. */
  onDismiss: () => void;
}

const COPY: Record<
  BarcodeLookupNoticeKind,
  { title: string; body: string; icon: "search" | "wifi-off" }
> = {
  "not-found": {
    title: "Продукт не знайдено",
    body: "Цього штрихкоду немає в базі — введи КБЖВ вручну.",
    icon: "search",
  },
  unavailable: {
    title: "Джерела тимчасово не відповідають",
    body: "Це не означає, що продукту немає — бази лежать, а не порожні. Спробуй ще раз за хвилину.",
    icon: "wifi-off",
  },
};

export function BarcodeLookupNotice({
  kind,
  onUsePhoto,
  onRetry,
  onDismiss,
}: BarcodeLookupNoticeProps) {
  const copy = COPY[kind];
  return (
    <div
      role="status"
      className="mt-2 rounded-2xl border border-line bg-panelHi p-3 grid gap-2"
    >
      <div className="flex items-start gap-2">
        <Icon
          name={copy.icon}
          size="sm"
          className="mt-0.5 text-muted shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <div className="text-style-label text-text">{copy.title}</div>
          <p className="text-style-caption text-subtle mt-0.5">{copy.body}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "unavailable" && onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {messages.nutrition.barcodeNoticeRetry}
          </Button>
        )}
        {kind === "not-found" && onUsePhoto && (
          <Button
            type="button"
            variant="nutrition-soft"
            size="sm"
            onClick={onUsePhoto}
          >
            <Icon name="camera" size="sm" aria-hidden />
            <span>{messages.nutrition.barcodeNoticeUsePhoto}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          {messages.nutrition.barcodeNoticeManual}
        </Button>
      </div>
    </div>
  );
}
