/**
 * Востаннє перевірено: 2026-08-10
 * Статус: Активний
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

/**
 * Компактне поле вводу токена Monobank для Налаштувань.
 *
 * Витягнуте з `FinykWebhookServiceSection`, бо після появи стану
 * `invalid` (перевірка живості токена, міграція 120) та сама форма
 * потрібна у ДВОХ гілках рендера: «ще не підключено» і «підключення
 * втратило звʼязок, встав новий токен». Дубль двох однакових полів із
 * власним `useState` для показу/приховування — рівно той спосіб, яким
 * розʼїжджаються тексти помилок і поведінка Enter.
 *
 * AI-NOTE: це НЕ спільний компонент із `FinykLoginScreen`. Той —
 * повноекранний онбординг із власною версткою, вставкою з буфера і
 * RHF-валідацією; злиття означало б або втягнути онбординг-картку в
 * рядок Налаштувань, або вихолостити онбординг. Спільною має бути
 * ПОВЕДІНКА підключення (Pro-гейт, нормалізація помилок), а не розмітка.
 */
/**
 * Рядки тримаємо в константі, а не інлайном у JSX: `sergeant-design/
 * no-cyrillic-jsx-literal` вимагає саме цього, і при виносі форми з
 * `FinykWebhookServiceSection` вони приїхали разом із нею з тамтешнього
 * `COPY`.
 */
const COPY = {
  tokenPlaceholder: "Токен Monobank API",
  hideToken: "Приховати токен",
  showToken: "Показати токен",
} as const;

export interface MonoTokenInlineFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** Підпис кнопки. Різний для першого підключення і перепідключення. */
  submitLabel: string;
  /** Підказка над полем. `null` — не показувати (коли контекст уже дав її). */
  help?: string | null;
}

export function MonoTokenInlineForm({
  value,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  help,
}: MonoTokenInlineFormProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-3">
      {help != null && (
        <p className="text-style-caption text-subtle leading-snug">{help}</p>
      )}
      <div className="relative">
        <input
          type={showToken ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={COPY.tokenPlaceholder}
          autoComplete="off"
          className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-style-body text-text"
          onKeyDown={(event) => event.key === "Enter" && onSubmit()}
        />
        <button
          type="button"
          onClick={() => setShowToken((visible) => !visible)}
          className="focus-ring touch-target absolute right-0 top-1/2 -translate-y-1/2 rounded-xl text-subtle hover:text-text"
          aria-label={showToken ? COPY.hideToken : COPY.showToken}
        >
          <Icon name={showToken ? "eye-off" : "eye"} size={16} aria-hidden />
        </button>
      </div>
      <Button className="w-full h-11" onClick={onSubmit} disabled={submitting}>
        {submitting ? messages.loadingActions.connecting : submitLabel}
      </Button>
    </div>
  );
}
