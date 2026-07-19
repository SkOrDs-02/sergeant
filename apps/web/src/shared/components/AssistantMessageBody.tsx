import { memo, useMemo, type ReactNode } from "react";

/**
 * Renders an assistant chat reply as React nodes.
 *
 * Covers the subset Claude actually emits in chat:
 *   - paragraphs (separated by blank lines, hard line-breaks preserved)
 *   - `### h3`, `#### h4` headings
 *   - bullet (`-`, `*`, `+`) and ordered (`1.`) lists (single level)
 *   - blockquotes (`>`)
 *   - inline `**bold**`, `*italic*` / `_italic_`, `` `code` ``,
 *     and `[text](url)` links (links are sandboxed via `isSafeHref`).
 *
 * Anything outside this grammar renders as plain text.
 *
 * Usage: assistant (AI-generated) text only. User-supplied text must be
 * rendered as plain text to prevent markdown injection — use a plain
 * `<span>` or `<p>` with the text content directly.
 */

const PROSE_CLASS_NAME =
  "text-sm leading-relaxed [&_strong]:font-semibold [&_em]:italic " +
  "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 " +
  "[&_p]:my-1 [&_li]:my-0.5 [&_a]:text-primary [&_a]:underline " +
  "[&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 " +
  "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 " +
  "[&_h4]:text-text " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary " +
  "[&_blockquote]:pl-3 [&_blockquote]:mt-3 [&_blockquote]:text-subtle " +
  "[&_blockquote]:italic " +
  "[&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded " +
  "[&_code]:text-xs";

export interface AssistantMessageBodyProps {
  text: string;
}

/** Allow only safe URL schemes — blocks `javascript:`, `data:`, etc. */
function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  return HREF_SAFE_RE.test(href);
}

const INLINE_TOKEN_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const HREF_SAFE_RE = /^(https?:\/\/|\/|#)/i;
const LINK_TOKEN_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;
const H4_RE = /^####\s+(.*)$/;
const H3_RE = /^###\s+(.*)$/;
const ULIST_RE = /^\s*[-*+]\s+/;
const ULIST_STRIP_RE = /^\s*[-*+]\s+/;
const OLIST_RE = /^\s*\d+\.\s+/;
const OLIST_STRIP_RE = /^\s*\d+\.\s+/;
const QUOTE_RE = /^\s*>\s?/;
const QUOTE_STRIP_RE = /^\s*>\s?/;
const BLOCK_START_RE = /^(#{3,4})\s+|^\s*[-*+]\s+|^\s*\d+\.\s+|^\s*>\s?/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((m = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const tok = m[0];
    const k = `${keyPrefix}-${m.index}`;
    if (tok.startsWith("**") && tok.endsWith("**")) {
      parts.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (
      (tok.startsWith("*") && tok.endsWith("*")) ||
      (tok.startsWith("_") && tok.endsWith("_"))
    ) {
      parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      parts.push(<code key={k}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const linkMatch = LINK_TOKEN_RE.exec(tok);
      const label = linkMatch?.[1];
      const href = linkMatch?.[2];
      if (linkMatch && label !== undefined && href !== undefined) {
        if (isSafeHref(href)) {
          parts.push(
            <a
              key={k}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {label}
            </a>,
          );
        } else {
          parts.push(
            <span key={k} className="text-primary underline">
              {label}
            </span>,
          );
        }
      } else {
        parts.push(tok);
      }
    } else {
      parts.push(tok);
    }
    lastIndex = m.index + tok.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function withSoftBreaks(lines: string[], keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push(<br key={`${keyPrefix}-br-${idx}`} />);
    out.push(...renderInline(line, `${keyPrefix}-i-${idx}`));
  });
  return out;
}

interface ParsedBlock {
  type:
    "paragraph" | "heading-3" | "heading-4" | "ulist" | "olist" | "blockquote";
  lines: string[];
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const h4 = H4_RE.exec(line);
    if (h4) {
      blocks.push({ type: "heading-4", lines: [h4[1] ?? ""] });
      i += 1;
      continue;
    }
    const h3 = H3_RE.exec(line);
    if (h3) {
      blocks.push({ type: "heading-3", lines: [h3[1] ?? ""] });
      i += 1;
      continue;
    }
    if (ULIST_RE.test(line)) {
      const items: string[] = [];
      while (i < rawLines.length && ULIST_RE.test(rawLines[i] ?? "")) {
        items.push((rawLines[i] ?? "").replace(ULIST_STRIP_RE, ""));
        i += 1;
      }
      blocks.push({ type: "ulist", lines: items });
      continue;
    }
    if (OLIST_RE.test(line)) {
      const items: string[] = [];
      while (i < rawLines.length && OLIST_RE.test(rawLines[i] ?? "")) {
        items.push((rawLines[i] ?? "").replace(OLIST_STRIP_RE, ""));
        i += 1;
      }
      blocks.push({ type: "olist", lines: items });
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < rawLines.length && QUOTE_RE.test(rawLines[i] ?? "")) {
        quoted.push((rawLines[i] ?? "").replace(QUOTE_STRIP_RE, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", lines: quoted });
      continue;
    }
    // Paragraph: collect until blank line or block-starter.
    const para: string[] = [line];
    i += 1;
    while (i < rawLines.length) {
      const next = rawLines[i] ?? "";
      if (!next.trim()) break;
      if (BLOCK_START_RE.test(next)) break;
      para.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: para });
  }
  return blocks;
}

function AssistantMessageBodyImpl({ text }: AssistantMessageBodyProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={PROSE_CLASS_NAME}>
      {blocks.map((block, idx) => {
        const key = `b-${idx}`;
        switch (block.type) {
          case "heading-3":
            return <h3 key={key}>{renderInline(block.lines[0] ?? "", key)}</h3>;
          case "heading-4":
            return <h4 key={key}>{renderInline(block.lines[0] ?? "", key)}</h4>;
          case "ulist":
            return (
              <ul key={key}>
                {block.lines.map((line, j) => (
                  <li key={`${key}-li-${j}`}>
                    {renderInline(line, `${key}-li-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case "olist":
            return (
              <ol key={key}>
                {block.lines.map((line, j) => (
                  <li key={`${key}-li-${j}`}>
                    {renderInline(line, `${key}-li-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case "blockquote":
            return (
              <blockquote key={key}>
                {withSoftBreaks(block.lines, key)}
              </blockquote>
            );
          case "paragraph":
          default:
            return <p key={key}>{withSoftBreaks(block.lines, key)}</p>;
        }
      })}
    </div>
  );
}

export const AssistantMessageBody = memo(AssistantMessageBodyImpl);
