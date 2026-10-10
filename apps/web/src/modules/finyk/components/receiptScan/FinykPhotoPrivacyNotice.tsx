/**
 * Last validated: 2026-10-05
 * Status: Active
 */
import {
  PhotoPrivacyNotice,
  readPhotoPrivacyAck,
} from "@shared/components/ui/PhotoPrivacyNotice";

/**
 * Ключ підтвердження попередження про фото чека й скріна банку.
 *
 * AI-CONTEXT: окремий від `sergeant.nutrition.photoPrivacyAck.v1`
 * навмисно (рішення власника 2026-10-05). Нутриційний ack покривав текст
 * про КБЖВ; на чеку й скріні банку їде інше: адреса магазину, цифри
 * картки, баланс, імена контрагентів. Глобального спільного ack немає.
 * Гейтить усі vision-шляхи Фініка: чек (`ReceiptScanSheet`), чеки пачкою
 * і скрін банкінгу (`BulkImportSheet`) — доти аналіз стартує лише явним
 * тапом у нотісі.
 */
export const FINYK_PHOTO_PRIVACY_ACK_KEY = "sergeant.finyk.photoPrivacyAck.v1";

const FINYK_PHOTO_NOTICE_TEXT =
  "Щоб розпізнати чек чи скрін банку, фото відправляється до зовнішнього AI-сервісу. Їде весь кадр: адреса магазину, цифри картки, баланс, імена. Частину приховати не вийде. Перевір, що в кадрі немає зайвого.";

export function readFinykPhotoPrivacyAck(): boolean {
  return readPhotoPrivacyAck(FINYK_PHOTO_PRIVACY_ACK_KEY);
}

export function FinykPhotoPrivacyNotice({
  onAck,
  blockingAnalysis,
}: {
  onAck?: (() => void) | undefined;
  blockingAnalysis?: boolean | undefined;
}) {
  return (
    <div className="[&>div]:rounded-xl [&>div]:border-0 [&>div]:bg-panel [&_button]:text-text">
      <PhotoPrivacyNotice
        ackKey={FINYK_PHOTO_PRIVACY_ACK_KEY}
        text={FINYK_PHOTO_NOTICE_TEXT}
        tone="finyk"
        onAck={onAck}
        blockingAnalysis={blockingAnalysis}
      />
    </div>
  );
}
