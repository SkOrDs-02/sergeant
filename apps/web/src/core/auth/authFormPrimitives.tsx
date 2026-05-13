import { cn } from "@shared/lib/ui/cn";
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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Приховати пароль" : "Показати пароль"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
    >
      {visible ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

interface FieldErrorProps {
  message: string | undefined;
}

export function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-meta text-error" role="alert">
      {message}
    </p>
  );
}
