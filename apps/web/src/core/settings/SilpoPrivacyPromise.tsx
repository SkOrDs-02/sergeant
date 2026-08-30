/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, гейт №2 приватності (спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Відкриті
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
 *   муляв щодня, але лишався доступний в один тап. Стилізація зумисно
 *   повторює `SilpoUnmatchedReceipts.tsx` (`touch-target` +
 *   `focus-visible:ring-finyk`) — той самий `<details>`-патерн у тому ж
 *   файловому сусідстві.
 */
import { Icon } from "@shared/components/ui/Icon";

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
    <details className="rounded-xl border border-line bg-panel p-3">
      <summary className="touch-target flex cursor-pointer items-center gap-2 text-style-label text-text marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk">
        <Icon
          name="shield"
          size={16}
          className="text-muted shrink-0"
          aria-hidden
        />
        {copy.privacyPromiseDetailsSummary}
      </summary>
      <div className="mt-2">{text}</div>
    </details>
  );
}
