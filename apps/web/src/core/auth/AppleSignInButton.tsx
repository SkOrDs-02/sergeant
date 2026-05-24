import { Button } from "@shared/components/ui/Button";

interface AppleSignInButtonProps {
  loading: boolean;
  onClick: () => void;
}

/**
 * Sign in with Apple — initiative 0010 Phase 4.3. Mirrors the Google button
 * shape (same `<Button variant="secondary" size="lg" className="w-full">`)
 * so the auth stack renders a consistent two-button column. The black
 * Apple logo is rendered via an inline SVG so the bundle stays icon-pack
 * free; `aria-hidden` because the surrounding button text already conveys
 * the action to AT.
 */
export function AppleSignInButton({
  loading,
  onClick,
}: AppleSignInButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      loading={loading}
      disabled={loading}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden
        fill="currentColor"
      >
        <path d="M17.05 12.04c-.03-2.81 2.3-4.16 2.41-4.22-1.32-1.93-3.37-2.19-4.09-2.22-1.74-.18-3.4 1.03-4.28 1.03-.9 0-2.25-1.01-3.71-.98-1.9.03-3.66 1.11-4.64 2.81-1.98 3.43-.5 8.5 1.42 11.28.94 1.36 2.06 2.89 3.52 2.83 1.41-.06 1.95-.91 3.66-.91 1.7 0 2.18.91 3.68.88 1.52-.03 2.48-1.38 3.41-2.75 1.07-1.58 1.52-3.11 1.54-3.19-.03-.01-2.95-1.13-2.98-4.48zM14.3 3.76c.78-.94 1.31-2.25 1.17-3.55-1.13.05-2.5.75-3.31 1.69-.72.83-1.36 2.16-1.19 3.44 1.26.1 2.55-.64 3.33-1.58z" />
      </svg>
      Увійти через Apple
    </Button>
  );
}
