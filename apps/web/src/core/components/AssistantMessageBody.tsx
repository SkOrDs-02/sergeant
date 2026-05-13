import { memo, type ReactNode } from "react";

/**
 * Renders an assistant chat reply as React nodes.
 *
 * Replaces a previous `react-markdown` + remark/rehype/mdast/hast pipeline
 * (~30 KB brotli in `vendor-markdown`) with a tiny block + inline parser
 * covering the subset Claude actually emits in chat:
 *   - paragraphs (separated by blank lines, hard line-breaks preserved)
 *   - `### h3`, `#### h4` headings
 *   - bullet (`-`, `*`, `+`) and ordered (`1.`) lists (single level)
 *   - blockquotes (`>`)
 *   - inline `**bold**`, `*italic*` / `_italic_`, `` `code` ``,
 *     and `[text](url)` links (links are sandboxed via `isSafeHref`).
 *
 * Anything outside this grammar (tables, nested lists, raw HTML, code
 * fences, images) renders as plain text — matches how Hubchat actually
 * uses the assistant today and avoids the heavy markdown stack. Tests in
 * `AssistantMessageBody.test.tsx` pin the grammar so future tweaks stay
 * additive. See PR `perf(web,..): T4-B aggressive bundle cuts`.
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

interface AssistantMessageBodyProps {
  text: string;
}

/** Allow only safe URL schemes — blocks `javascript:`, `data:`, etc. */
function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  return /^(https?:\/\/|\/|#)/i.test(href);
}

// Tokens are escaped before splitting so e.g. `**a*b**` parses as bold
// containing `a*b` instead of bold-italic chimera. We match GREEDILY on
// `**…**`, then `*…*` / `_…_`, then `` `…` ``, then `[…](…)`. Inline
// regex captures live at module scope so React-render is allocation-free.
const INLINE_TOKEN_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

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
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
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

// `withSoftBreaks` preserves `\n` inside a paragraph as `<br>`-equivalents
// so multi-line assistant replies keep their visual line structure
// (matches `remark-breaks`-style behaviour, which is what HubChat used to
// rely on with `react-markdown`).
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
    | "paragraph"
    | "heading-3"
    | "heading-4"
    | "ulist"
    | "olist"
    | "blockquote";
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
    const h4 = /^####\s+(.*)$/.exec(line);
    if (h4) {
      blocks.push({ type: "heading-4", lines: [h4[1] ?? ""] });
      i += 1;
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      blocks.push({ type: "heading-3", lines: [h3[1] ?? ""] });
      i += 1;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < rawLines.length && /^\s*[-*+]\s+/.test(rawLines[i] ?? "")) {
        items.push((rawLines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ulist", lines: items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < rawLines.length && /^\s*\d+\.\s+/.test(rawLines[i] ?? "")) {
        items.push((rawLines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "olist", lines: items });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < rawLines.length && /^\s*>\s?/.test(rawLines[i] ?? "")) {
        quoted.push((rawLines[i] ?? "").replace(/^\s*>\s?/, ""));
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
      if (
        /^(#{3,4})\s+/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^\s*>\s?/.test(next)
      )
        break;
      para.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: para });
  }
  return blocks;
}

function AssistantMessageBodyImpl({ text }: AssistantMessageBodyProps) {
  const blocks = parseBlocks(text);
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
