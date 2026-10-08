/**
 * Last validated: 2026-10-05
 * Status: Active
 */
import { useState } from "react";
import { messages } from "@shared/i18n/uk";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

const copy = messages.dataDisclosure.photoNotice;

/**
 * Читає одноразове підтвердження «попередження про фото прочитано».
 *
 * Пара read/write мусить бути узгоджена: `safeWriteLS` кладе JSON, тому й
 * читаємо через `safeReadLS`. Рядковий читач повернув би `"true"` з
 * лапками, і банер не зникав би ніколи.
 */
export function readPhotoPrivacyAck(ackKey: string): boolean {
  return safeReadLS<boolean>(ackKey, false) === true;
}

const TONE_BUTTON_CLASS = {
  nutrition: "text-nutrition-strong dark:text-nutrition",
  finyk: "text-finyk-strong dark:text-finyk",
} as const;

export interface PhotoPrivacyNoticeProps {
  /** Ключ підтвердження. Свій у кожного модуля: текст нотіса різний, тож
   * підтвердження одного не покриває інший (рішення власника 2026-10-05). */
  ackKey: string;
  /** Що саме їде за периметр і чому це не приховати. */
  text: string;
  /** Акцент кнопки підтвердження. */
  tone: keyof typeof TONE_BUTTON_CLASS;
  onAck?: (() => void) | undefined;
  /**
   * Кадр уже обраний, тариф дозволяє аналіз — і єдине, що його стримує,
   * це непідтверджений нотіс. Тоді нотіс мусить сам сказати, що він і є
   * та кнопка, якої людина шукає.
   */
  blockingAnalysis?: boolean | undefined;
}

/**
 * Одноразове попередження «Куди їде фото» (рішення власника 2026-07-26:
 * «фото: попередження», `docs/governance/security/llm-subprocessors.md`
 * § «Чого маскування не робить»).
 *
 * AI-CONTEXT: фото єдиний шлях за периметр, який **неможливо**
 * замаскувати: у кадр разом із предметом потрапляє адреса, цифри картки,
 * чужа рука, екран телефона. Технічного рішення тут немає, є лише
 * чесність або мовчання. Попередження одноразове навмисно: постійний банер
 * над кожним фото перестають читати за тиждень, і тоді він захищає не
 * людину, а нас.
 *
 * Ack — це ще й гейт аналізу (рішення 2026-08-13): до підтвердження
 * аналіз стартує лише явним тапом. Споживач читає той самий ключ через
 * {@link readPhotoPrivacyAck} і слухає `onAck`.
 */
export function PhotoPrivacyNotice({
  ackKey,
  text,
  tone,
  onAck,
  blockingAnalysis,
}: PhotoPrivacyNoticeProps) {
  const [acked, setAcked] = useState(() => readPhotoPrivacyAck(ackKey));
  if (acked) return null;
  return (
    <div className="mb-3 rounded-2xl border border-line bg-panelHi p-3">
      <div className="text-style-label text-text">{copy.title}</div>
      {/* AI-NOTE: caption тут навмисний: це дисклеймер приватності під
          заголовком нотіса, а не текст, який читають потоком. Підняти до
          `text-style-body` означало б зрівняти його з основним контентом
          картки і посилити те, що людина має прочитати один раз. */}
      <p className="mt-1 text-style-caption text-muted leading-relaxed">
        {text}
      </p>
      {blockingAnalysis && (
        // AI-NOTE: та сама роль, що й дисклеймер вище, рядок пояснює стан
        // кнопки в цьому ж нотісі, тож кегль тримаємо спільний.
        <p className="mt-2 text-style-caption text-text leading-relaxed">
          {copy.blocking}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          safeWriteLS(ackKey, true);
          setAcked(true);
          onAck?.();
        }}
        className={`mt-2 min-h-11 px-3 text-style-caption ${TONE_BUTTON_CLASS[tone]} hover:underline`}
      >
        {blockingAnalysis ? copy.ackAnalyze : copy.ack}
      </button>
    </div>
  );
}
