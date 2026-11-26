/**
 * Спільна верстка листів: обгортка й кнопка дії. Лише inline-стилі, бо
 * більшість поштових клієнтів вирізає `<style>`. Нею користуються і листи
 * першого тижня (`ftuxDripCopy.ts`), і службові листи входу
 * (`auth/verificationMail.ts`), щоб усі листи Sergeant виглядали однаково.
 *
 * Status: Active
 */

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapMailHtml(bodyHtml: string): string {
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">` +
    bodyHtml +
    `</div>`
  );
}

export function mailButton(href: string, label: string): string {
  return (
    `<p style="margin:20px 0"><a href="${escapeAttr(href)}" ` +
    `style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;` +
    `text-decoration:none;border-radius:8px;font-weight:600">${escapeText(label)}</a></p>`
  );
}

/** Дрібний сірий рядок під основним текстом: строк дії, «якщо це не ти». */
export function mailNote(html: string): string {
  return `<p style="margin-top:24px;color:#64748b;font-size:13px;line-height:1.5">${html}</p>`;
}
