import { useState, type FormEvent } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { useToast } from "@shared/hooks/useToast";
import { waitlistApi } from "@shared/api";
import { isApiError } from "@sergeant/api-client";
import {
  type WaitlistSource,
  type WaitlistTier,
  WaitlistSubmitSchema,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

const TIER_OPTIONS: ReadonlyArray<{
  value: WaitlistTier;
  label: string;
  hint: string;
}> = [
  { value: "pro", label: "Pro", hint: "AI-чат, авто-Mono, повні звіти" },
  { value: "plus", label: "Plus", hint: "Базовий AI + cloud sync" },
  {
    value: "free",
    label: "Залишусь на Free",
    hint: "Просто слідкувати за новинами",
  },
  { value: "unsure", label: "Ще не знаю", hint: "Розкажіть мені більше" },
];

/**
 * Phase 0 monetization rails: форма для збору waitlist-ів на майбутній
 * Pro-тір. Анонімна (не вимагає логіну) — основний траффік сюди йтиме з
 * `/pricing`, де неавторизовані відвідувачі мають мати змогу залишити email.
 *
 * Аналітика: `WAITLIST_SUBMITTED` шлемо тільки після успішної відповіді
 * сервера (включно з ідемпотентним `created=false`), щоб дашборд не
 * рахував перерване подання як справжній sign-up.
 */
export interface WaitlistFormProps {
  /**
   * Звідки прийшла submission. Використовується для PostHog-сегментації
   * ("waitlist з paywall vs. з pricing-сторінки конвертять по-різному").
   */
  source: WaitlistSource;
  /**
   * Опційний preset tier (наприклад, якщо юзер натиснув CTA на конкретній
   * картці тіра). Якщо не передано — селектор стартує з `unsure`.
   */
  defaultTier?: WaitlistTier;
  /** Викликається після успішної (або ідемпотентної) відповіді сервера. */
  onSuccess?: (created: boolean) => void;
  /** Опційний className для контейнера-обгортки. */
  className?: string;
}

export function WaitlistForm({
  source,
  defaultTier,
  onSuccess,
  className,
}: WaitlistFormProps) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<WaitlistTier>(defaultTier ?? "unsure");
  const [pending, setPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setEmailError(null);

    // Локальна валідація перед мережевим викликом — даємо швидкий
    // feedback. Сервер усе одно валідує знову (rate-limit + Zod).
    const parsed = WaitlistSubmitSchema.safeParse({
      email,
      tier_interest: tier,
      source,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "email");
      setEmailError(issue?.message ?? "Перевір email");
      return;
    }

    setPending(true);
    try {
      const res = await waitlistApi.submit(parsed.data);
      trackEvent(ANALYTICS_EVENTS.WAITLIST_SUBMITTED, {
        tier_interest: parsed.data.tier_interest,
        source,
        created: res.created,
      });
      if (res.created) {
        toast.success("Дякуємо! Повідомимо щойно Pro буде готовий.");
      } else {
        toast.info("Ми вже памʼятаємо твій інтерес — жодних дублікатів.");
      }
      setEmail("");
      onSuccess?.(res.created);
    } catch (err) {
      if (isApiError(err) && err.status === 429) {
        toast.error("Забагато запитів. Спробуй за годину.");
      } else if (isApiError(err) && err.status === 400) {
        setEmailError("Перевір email-адресу");
      } else {
        toast.error("Не вдалося зберегти. Спробуй ще раз.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      noValidate
      aria-label="Підписатись на waitlist Pro-тіру"
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="waitlist-email">Email</Label>
          <Input
            id="waitlist-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoComplete="email"
            required
            disabled={pending}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "waitlist-email-error" : undefined}
          />
          {emailError && (
            <p
              id="waitlist-email-error"
              className="mt-1 text-xs text-danger-strong"
            >
              {emailError}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-text mb-2">
            Який тариф цікавить найбільше?
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TIER_OPTIONS.map((opt) => {
              const checked = tier === opt.value;
              const inputId = `waitlist-tier-${opt.value}`;
              return (
                <label
                  key={opt.value}
                  htmlFor={inputId}
                  aria-label={`${opt.label} — ${opt.hint}`}
                  className={
                    "flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition-colors " +
                    (checked
                      ? "border-brand-500 bg-brand/10 dark:bg-brand/15"
                      : "border-line bg-panel hover:bg-panelHi")
                  }
                >
                  <input
                    id={inputId}
                    type="radio"
                    name="waitlist-tier"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setTier(opt.value)}
                    className="mt-1 accent-brand-strong"
                    disabled={pending}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-text">
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted">{opt.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Button type="submit" variant="primary" size="lg" loading={pending}>
          Підписатись на waitlist
        </Button>

        <p className="text-xs text-muted">
          Без спаму. Один лист, коли Pro запуститься. Ціни теж покажемо
          фіналізовано — поки в `docs/launch/01-monetization-and-pricing.md`
          лише драфт.
        </p>
      </div>
    </form>
  );
}
