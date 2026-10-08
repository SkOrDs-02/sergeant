/**
 * Last validated: 2026-10-05
 * Status: Active
 */
import { PhotoPrivacyNotice as SharedPhotoPrivacyNotice } from "@shared/components/ui/PhotoPrivacyNotice";

/**
 * Ключ підтвердження, що людина прочитала попередження про фото.
 *
 * AI-CONTEXT: рішення founder-а 2026-07-26 — на питання «що робимо з
 * фото» обрано «попередження» (деталі й чому одноразове — у спільному
 * `shared/components/ui/PhotoPrivacyNotice.tsx`). Ack — це ще й гейт
 * автоаналізу (рішення founder-а 2026-08-13): `PhotoStep` читає той самий
 * ключ і слухає `onPrivacyAck`. Ключ Харчування НЕ спільний з Фініком:
 * цей текст говорить про КБЖВ, а не про чеки й скріни банку.
 */
export const PHOTO_PRIVACY_ACK_KEY = "sergeant.nutrition.photoPrivacyAck.v1";

const NUTRITION_PHOTO_NOTICE_TEXT =
  "Щоб визначити КБЖВ, фото відправляється на розпізнавання до зовнішнього AI-сервісу. На відміну від тексту, фото приховати частково не вийде: їде весь кадр. Перевір, що в нього не потрапило зайве.";

export function PhotoPrivacyNotice({
  onAck,
  blockingAnalysis,
}: {
  onAck?: (() => void) | undefined;
  blockingAnalysis?: boolean | undefined;
}) {
  return (
    <SharedPhotoPrivacyNotice
      ackKey={PHOTO_PRIVACY_ACK_KEY}
      text={NUTRITION_PHOTO_NOTICE_TEXT}
      tone="nutrition"
      onAck={onAck}
      blockingAnalysis={blockingAnalysis}
    />
  );
}
