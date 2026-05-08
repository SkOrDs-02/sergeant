import { memo } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

interface AssistantMessageBodyProps {
  text: string;
}

/** Allow only safe URL schemes — blocks javascript:, data:, vbscript:, etc. */
function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  return /^(https?:\/\/|\/|#)/i.test(href);
}

function AssistantMessageBodyImpl({ text }: AssistantMessageBodyProps) {
  return (
    <ReactMarkdown
      className="text-sm leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_li]:my-0.5 [&_a]:text-primary [&_a]:underline [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-text [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:mt-3 [&_blockquote]:text-subtle [&_blockquote]:italic [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs"
      components={{
        a: ({ href, children }: { href?: string; children?: ReactNode }) =>
          isSafeHref(href) ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {children}
            </a>
          ) : (
            <span className="text-primary underline">{children}</span>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export const AssistantMessageBody = memo(AssistantMessageBodyImpl);
