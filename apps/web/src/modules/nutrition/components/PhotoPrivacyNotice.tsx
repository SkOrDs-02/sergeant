/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

/**
 * Ключ підтвердження, що людина прочитала попередження про фото.
 *
 * AI-CONTEXT: рішення founder-а 2026-07-26 — на питання «що робимо з
 * фото» обрано «попередження». Фото єдиний шлях за периметр, який
 * **неможливо** замаскувати: у кадр разом із тарілкою потрапляє чек із
 * адресою, чужа рука, екран телефона. Технічного рішення тут немає, є
 * лише чесність або мовчання.
 *
 * Попередження одноразове навмисно: постійний банер над кожним фото
 * перестають читати за тиждень, і тоді він захищає не людину, а нас.
 *
 * Ack — це ще й гейт автоаналізу (рішення founder-а 2026-08-13):
 * до підтвердження аналіз стартує лише явним тапом, після — сам при
 * виборі/заміні фото. Тому `PhotoStep` читає той самий ключ і слухає
 * `onPrivacyAck`.
 */
export const PHOTO_PRIVACY_ACK_KEY = "sergeant.nutrition.photoPrivacyAck.v1";

export function PhotoPrivacyNotice({
  onAck,
  blockingAnalysis,
}: {
  onAck?: (() => void) | undefined;
  /**
   * Кадр уже обраний, тариф дозволяє аналіз — і єдине, що його стримує,
   * це непідтверджений нотіс. Тоді нотіс мусить сам сказати, що він і є
   * та кнопка, якої людина шукає.
   */
  blockingAnalysis?: boolean | undefined;
}) {
  const [acked, setAcked] = useState(
    // Пара read/write мусить бути узгоджена: `safeWriteLS` кладе JSON,
    // тому й читаємо через `safeReadLS`. Рядковий читач повернув би
    // `"true"` з лапками і банер не зникав би ніколи.
    () => safeReadLS<boolean>(PHOTO_PRIVACY_ACK_KEY, false) === true,
  );
  if (acked) return null;
  return (
    <div className="mb-3 rounded-2xl border border-line bg-panelHi p-3">
      <div className="text-style-label text-text">Куди їде фото</div>
      {/* AI-NOTE: caption тут навмисний: це дисклеймер приватності під
          заголовком нотіса, а не текст, який читають потоком. Підняти до
          `text-style-body` означало б зрівняти його з основним контентом
          картки і посилити те, що людина має прочитати один раз. */}
      <p className="mt-1 text-style-caption text-muted leading-relaxed">
        Щоб визначити КБЖВ, фото відправляється на розпізнавання до зовнішнього
        AI-сервісу. На відміну від тексту, фото приховати частково не вийде: їде
        весь кадр. Перевір, що в нього не потрапило зайве.
      </p>
      {blockingAnalysis && (
        // AI-NOTE: та сама роль, що й дисклеймер вище, рядок пояснює стан
        // кнопки в цьому ж нотісі, тож кегль тримаємо спільний.
        <p className="mt-2 text-style-caption text-text leading-relaxed">
          Аналіз почнеться, щойно підтвердиш це. Доти кадр нікуди не їде.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          safeWriteLS(PHOTO_PRIVACY_ACK_KEY, true);
          setAcked(true);
          onAck?.();
        }}
        className="mt-2 min-h-11 px-3 text-style-caption text-nutrition-strong dark:text-nutrition hover:underline"
      >
        {blockingAnalysis ? "Зрозуміло, аналізувати" : "Зрозуміло"}
      </button>
    </div>
  );
}
