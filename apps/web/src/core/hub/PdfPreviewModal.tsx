/**
 * PdfPreviewModal
 *
 * In-app PDF preview. Renders the generated report HTML inside a
 * same-origin `<iframe srcDoc>` and overlays a real React toolbar with
 * "Назад" (close) and "Зберегти / друк" (trigger the iframe's system print
 * dialog) actions.
 *
 * Replaces the previous `window.open("", "_blank")` flow: on iOS Safari
 * and installed PWAs a script-opened tab often has a null `window.opener`
 * and a single-entry history, so the in-report "Назад" button could
 * neither `window.close()` nor `history.back()` — it did nothing and the
 * user was stranded on the report. An in-app overlay closes reliably
 * because "Назад" is just React state, and printing stays within the app.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";

// UA copy is kept local rather than in the shared `uk.ts` catalog: that
// file is already at its 600-line `max-lines` ceiling (Hard Rule #18), so
// new keys can't land there until it's split. Hoisting the strings out of
// JSX also keeps `sergeant-design/no-cyrillic-jsx-literal` satisfied.
const COPY = {
  dialogAria: "Перегляд PDF-звіту",
  iframeTitle: "PDF-звіт",
  back: "Назад",
  title: "Перегляд PDF",
  save: "Зберегти / друк",
} as const;

export interface PdfPreviewModalProps {
  /** Full HTML document produced by `generatePDFReport`. */
  html: string;
  onClose: () => void;
}

export function PdfPreviewModal({ html, onClose }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus into the dialog for AT users, then restore it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={COPY.dialogAria}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex flex-col bg-bg text-text safe-area-pt-pb outline-none motion-safe:animate-fade-in"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {COPY.back}
        </Button>
        <span className="text-style-label text-text truncate">
          {COPY.title}
        </span>
        <Button variant="primary" size="sm" onClick={handlePrint}>
          <Icon name="download" size={16} aria-hidden />
          {COPY.save}
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        title={COPY.iframeTitle}
        srcDoc={html}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>,
    document.body,
  );
}
