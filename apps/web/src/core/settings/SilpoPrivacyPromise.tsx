/**
 * Last validated: 2026-10-13
 * Status: Active — Silpo MCP integration, гейт №2 приватності (спека
 * `docs/work/specs/silpo-mcp-integration.md` § Відкриті
 * гейти). Текст обіцянки затверджений founder-ом дослівно — редагувати
 * можна лише розбиття на абзаци, не саму суть чи формулювання. Змінюй
 * текст лише в `SilpoIntegrationSection.tsx` (`COPY.privacyPromise*`) —
 * цей файл лише рендерить те, що йому передали, тож існує рівно одне
 * джерело рядків для обох станів картки.
 *
 * Два місця показу одного тексту:
 * - `variant="inline"` — disconnected-стан картки, обіцянка стоїть ПЕРЕД
 *   кнопкою «Звʼязати Сільпо» (рішення до підключення, не після).
 * - `variant="details"` — connected-стан, згорнутий `<details>`, щоб не
 *   муляв щодня, але лишався доступний в один тап. У батьківській групі
 *   інтеграції це рядок із нативним маркером розкриття, а не вкладена
 *   картка; touch-ціль та клавіатурний фокус зберігаються.
 */

export interface SilpoPrivacyPromiseCopy {
  privacyPromiseParagraph1: string;
  privacyPromiseParagraph2: string;
  privacyPromiseDetailsSummary: string;
}

export interface SilpoPrivacyPromiseProps {
  copy: SilpoPrivacyPromiseCopy;
  variant: "inline" | "details";
}

export function SilpoPrivacyPromise({
  copy,
  variant,
}: SilpoPrivacyPromiseProps) {
  const text = (
    <div className="space-y-2 text-style-caption text-subtle leading-snug">
      <p>{copy.privacyPromiseParagraph1}</p>
      <p>{copy.privacyPromiseParagraph2}</p>
    </div>
  );

  if (variant === "inline") return text;

  return (
    <details className="border-t border-line pt-3">
      <summary className="touch-target list-inside cursor-pointer py-3 text-style-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk">
        {copy.privacyPromiseDetailsSummary}
      </summary>
      <div className="mt-2">{text}</div>
    </details>
  );
}
