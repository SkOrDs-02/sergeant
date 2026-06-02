/**
 * Report export for the mobile Hub-Reports surface.
 *
 * The web `exportToPDF` builds an HTML document and prints it to PDF in the
 * browser. Mobile has no `expo-print` dependency yet, so this writes a
 * self-contained HTML report to the cache directory and hands it to the
 * native share sheet via `expo-sharing` (both `expo-file-system` and
 * `expo-sharing` are already app dependencies — see `src/lib/fileDownload.ts`).
 *
 * TODO(export): once `expo-print` is added, render this HTML to a real PDF
 * via `Print.printToFileAsync({ html })` and share the resulting `.pdf`,
 * to fully match the web PDF output.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

export interface ExportReportOptions {
  title: string;
  subtitle: string;
}

function buildHtml({ title, subtitle }: ExportReportOptions): string {
  return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #1c1917; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .subtitle { color: #78716c; font-size: 13px; margin-bottom: 16px; }
      .section { margin-top: 16px; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div class="subtitle">${subtitle}</div>
    <div class="section">
      <strong>Період</strong>
      <p>${subtitle}</p>
    </div>
  </body>
</html>`;
}

export async function exportReport(
  options: ExportReportOptions,
): Promise<void> {
  const html = buildHtml(options);
  const fileUri = `${FileSystem.cacheDirectory}sergeant-report.html`;

  await FileSystem.writeAsStringAsync(fileUri, html, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    console.warn(
      `[hub-reports] Sharing unavailable. Report written to ${fileUri}.`,
    );
    return;
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "text/html",
    dialogTitle: options.title,
    UTI: "public.html",
  });
}
