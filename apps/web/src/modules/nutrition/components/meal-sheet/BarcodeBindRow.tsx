/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Рядок-підтвердження на кроці «fill» (OD-27 Х-5 а, рішення власника
 * 2026-11-18): штрихкод, що в цьому аркуші не знайшовся, привʼяжеться до
 * обраного свого продукту під час збереження запису. «Скасувати» знімає
 * намір до збереження, тож хибну привʼязку є чим не допустити.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

export function BarcodeBindRow({
  code,
  onCancel,
}: {
  code: string;
  onCancel: () => void;
}) {
  const copy = messages.nutrition.repeat;
  return (
    <div className="mb-4 border-b border-line pb-3">
      <p className="text-style-label text-muted">
        {copy.bindBarcode.replace("{code}", code)}
      </p>
      <Button
        type="button"
        variant="text"
        size="sm"
        // `variant="text"` має `px-2`: від'ємне поле ставить підпис у лінію
        // з текстом рядка, зона дотику 44 px лишається.
        className="mt-1 -ml-2"
        onClick={onCancel}
        aria-label={copy.bindBarcodeCancelAria}
      >
        {copy.bindBarcodeCancel}
      </Button>
    </div>
  );
}
