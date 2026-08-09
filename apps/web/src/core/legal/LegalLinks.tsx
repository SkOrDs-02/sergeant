import { Link } from "react-router-dom";
import { messages } from "@shared/i18n/uk";
import { LEGAL_SURFACES_ENABLED } from "../lib/betaSurfaces";
import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
} from "../app/appPaths";

interface LegalLinksProps {
  readonly className?: string;
  readonly compact?: boolean;
}

const links = [
  { href: LEGAL_PRIVACY_PATH, label: "Приватність" },
  { href: LEGAL_TERMS_PATH, label: "Умови" },
  { href: LEGAL_COOKIES_PATH, label: "Cookies" },
  { href: LEGAL_OFFER_PATH, label: "Оферта" },
] as const;

export function LegalLinks({
  className = "",
  compact = false,
}: LegalLinksProps) {
  // Single choke point for every legal-links consumer (sign-in screen,
  // Settings → Конфіденційність, pricing footer, the legal pages themselves).
  // With `/legal/*` 404-ing during the beta these would all be dead links.
  if (!LEGAL_SURFACES_ENABLED) return null;

  return (
    <nav
      aria-label={messages.legal.linksNavAria}
      className={[
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-2",
        compact ? "text-style-caption" : "text-style-label",
        className,
      ].join(" ")}
    >
      {links.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-muted underline-offset-4 transition-colors hover:text-text focus-visible:outline-none focus-visible:underline"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
