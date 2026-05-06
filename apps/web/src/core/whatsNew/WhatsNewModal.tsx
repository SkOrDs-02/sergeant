import { useNavigate } from "react-router-dom";
import { Modal } from "@shared/components/ui/Modal";
import { Button } from "@shared/components/ui/Button";
import { Badge } from "@shared/components/ui/Badge";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import type {
  WhatsNewItem,
  WhatsNewItemKind,
  WhatsNewRelease,
} from "./releases";

/**
 * `<WhatsNewModal />` — in-product release notes overlay (PR-18 у
 * [FTUX master tracker](docs/launch/product-os/ftux-master-tracker.md) §3.3).
 *
 * Render-only — стан / persist / analytics керуються `useWhatsNew()`.
 * Викликач передає `release` і два callback-и:
 *   - `onClose(via)` для close-button / overlay / Esc;
 *   - `onCtaClick()` для primary CTA (опціональний; якщо `release.cta`
 *     undefined, footer показує тільки «Зрозуміло»).
 *
 * Layout навмисно мінімальний — Modal (`@shared/components/ui/Modal`)
 * вже володіє focus-trap-ом, body-scroll-lock, 44×44 close-button-ом і
 * coarse-pointer hand-off у `<Sheet>` (мобільне auto-bottom-sheet).
 */

const KIND_LABELS: Record<WhatsNewItemKind, string> = {
  feature: "Нове",
  improvement: "Покращення",
  fix: "Фікс",
};

const KIND_VARIANTS: Record<WhatsNewItemKind, "success" | "info" | "warning"> =
  {
    feature: "success",
    improvement: "info",
    fix: "warning",
  };

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("mailto:");
}

function ItemRow({ item }: { item: WhatsNewItem }) {
  return (
    <li className="flex gap-3 items-start">
      <Badge
        size="sm"
        variant={KIND_VARIANTS[item.kind]}
        className="shrink-0 mt-0.5"
      >
        {KIND_LABELS[item.kind]}
      </Badge>
      <span className="text-sm text-fg leading-relaxed">{item.text}</span>
    </li>
  );
}

export interface WhatsNewModalProps {
  open: boolean;
  release: WhatsNewRelease | null;
  onClose: (via: "close" | "overlay" | "esc") => void;
  onCtaClick: () => void;
}

export function WhatsNewModal({
  open,
  release,
  onClose,
  onCtaClick,
}: WhatsNewModalProps) {
  const navigate = useNavigate();

  if (!release) return null;

  const handleCtaClick = () => {
    if (!release.cta) return;
    onCtaClick();
    if (isExternalHref(release.cta.href)) {
      window.open(release.cta.href, "_blank", "noopener,noreferrer");
    } else {
      navigate(release.cta.href);
    }
  };

  const formattedDate = (() => {
    try {
      return new Intl.DateTimeFormat("uk-UA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(release.date));
    } catch {
      return release.date;
    }
  })();

  return (
    <Modal
      open={open}
      onClose={() => onClose("close")}
      title={release.title}
      description={
        <span className="flex items-center gap-2 flex-wrap">
          <Badge variant="info" size="sm">
            {messages.whatsNew.badge}
          </Badge>
          <span>{formattedDate}</span>
        </span>
      }
      size="lg"
      panelClassName="data-[whats-new]"
      footer={
        <div
          className={cn(
            "flex flex-wrap gap-2",
            release.cta ? "justify-end" : "justify-end",
          )}
        >
          <Button variant="ghost" onClick={() => onClose("close")}>
            {messages.whatsNew.dismiss}
          </Button>
          {release.cta && (
            <Button variant="primary" onClick={handleCtaClick}>
              {release.cta.label}
            </Button>
          )}
        </div>
      }
    >
      <p className="text-sm text-fg-muted leading-relaxed mb-4">
        {release.summary}
      </p>
      <ul className="flex flex-col gap-3">
        {release.items.map((item, idx) => (
          <ItemRow key={idx} item={item} />
        ))}
      </ul>
    </Modal>
  );
}
