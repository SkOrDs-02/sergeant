import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { estimatePasswordStrength } from "@shared/lib/auth/passwordStrength";

export function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  // PR-15 / §C8 — entropy-aware ladder. Замінює naive довжина-only оцінку,
  // що однаково вважала надійним і `aaaaaaaaaa`, і `Aa1!Aa1!Aa`. Лейбли —
  // bare-string (rule scope: тільки JSX-літерали), окремий i18n-namespace
  // не виправдано для трьох коротких токенів.
  const { level } = estimatePasswordStrength(password);
  const widths = ["w-1/3", "w-2/3", "w-full"];
  const colors = ["bg-error", "bg-amber-400", "bg-brand-500"];
  const labels = ["Слабкий", "Середній", "Надійний"];
  const labelColors = [
    "text-error",
    "text-amber-500",
    "text-brand-strong dark:text-brand",
  ];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1 rounded-full bg-line overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            widths[level],
            colors[level],
          )}
        />
      </div>
      <p className={cn("text-meta font-medium", labelColors[level])}>
        {labels[level]}
      </p>
    </div>
  );
}

interface PasswordVisibilityToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordVisibilityToggle({
  visible,
  onToggle,
}: PasswordVisibilityToggleProps) {
  // ≥44×44 hit-area (WCAG 2.5.5 / Apple HIG): icon 20px + p-3 (12px) на
  // кожен бік → 44×44 інтерактивна площа. Сусідній Input має мати
  // `pr-12` (48 px) — рівно ширина кнопки + 4 px відступу від краю.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Сховати пароль" : "Показати пароль"}
      aria-pressed={visible}
      className="absolute inset-y-0 right-1 inline-flex items-center justify-center p-3 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-xl"
    >
      <Icon name={visible ? "eye-off" : "eye"} size="lg" />
    </button>
  );
}

interface FieldErrorProps {
  id?: string;
  message: string | undefined;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-meta text-error" role="alert">
      {message}
    </p>
  );
}
