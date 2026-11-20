/**
 * Картки «Схоже на внесок у …» над списком операцій (спека
 * `docs/work/specs/finyk-savings-assets.md`): списання тому ж отримувачу,
 * що й попередній внесок в актив. «Так, внесок» привʼязує операцію, «Ні»
 * більше її не пропонує. Нічого не привʼязується без підтвердження.
 */
import { messages } from "@shared/i18n";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { formatNumberUk } from "@sergeant/shared";
import type { AssetLinkSuggestion } from "./useAssetLinks";

const t = messages.finyk.assetSuggestion;

export function AssetLinkSuggestions({
  suggestions,
  accept,
  reject,
}: {
  suggestions: readonly AssetLinkSuggestion[];
  accept: (s: AssetLinkSuggestion) => void;
  reject: (s: AssetLinkSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="finyk-asset-link-suggestions">
      {suggestions.map((s) => {
        const name = s.asset.name ?? "";
        const desc = String(s.tx.description ?? "");
        return (
          <Card key={s.tx.id} className="space-y-2">
            <p className="text-style-label text-text">
              {t.title.replace("{name}", name)}
            </p>
            <p className="text-style-caption text-muted">
              {desc} ·{" "}
              {formatNumberUk(Math.abs(Number(s.tx.amount)) / 100, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              ₴
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                tone="ink"
                variant="solid"
                onClick={() => accept(s)}
              >
                {t.accept}
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                aria-label={t.rejectAria
                  .replace("{tx}", desc)
                  .replace("{name}", name)}
                onClick={() => reject(s)}
              >
                {t.reject}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
