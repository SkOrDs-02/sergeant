/**
 * Картки «Схоже на внесок у …», «Схоже на повернення з …», «Схоже на дохід
 * з …» і «Схоже на купівлю ОВДП / відкриття депозиту» над списком операцій
 * (спеки `finyk-savings-assets.md` і `finyk-investment-suggestions.md`).
 * Нічого не привʼязується без підтвердження; «Ні» більше не пропонує
 * операцію. Без активу потрібного типу картка відкриває форму активу з
 * підставленими з операції типом, валютою, датою й сумою.
 */
import { useState } from "react";
import { messages } from "@shared/i18n";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Sheet } from "@shared/components/ui/Sheet";
import { formatNumberUk } from "@sergeant/shared";
import { localTodayKey } from "@sergeant/finyk-domain/domain/assets";
import type { ManualAsset } from "../../hooks/useStorage";
import { SavingsAssetForm } from "../SavingsAssetForm";
import type {
  SavingsAssetDraft,
  SavingsCurrency,
} from "../../lib/savingsAssetDraft";
import { txAccountCurrency, type AssetLinkSuggestion } from "./useAssetLinks";

const t = messages.finyk.assetSuggestion;

function titleOf(s: AssetLinkSuggestion): string {
  const name = s.assets[0]?.name ?? "";
  if (s.assets.length === 0 && s.kind) return t.titleNew[s.kind];
  if (s.type === "withdrawal") return t.titleWithdrawal.replace("{name}", name);
  if (s.type === "income") return t.titleIncome.replace("{name}", name);
  return t.title.replace("{name}", name);
}

function acceptLabel(s: AssetLinkSuggestion): string {
  if (s.type === "withdrawal") return t.acceptWithdrawal;
  if (s.type === "income") return t.acceptIncome;
  return t.accept;
}

/** Чернетка активу з операції: валюта рахунку, курс НБУ, сума, дата, назва. */
function draftFromTx(s: AssetLinkSuggestion): Partial<SavingsAssetDraft> {
  const ms = Number(s.tx.time) * 1000;
  const date =
    Number.isFinite(ms) && ms > 0 ? localTodayKey(new Date(ms)) : undefined;
  const account = txAccountCurrency(s.tx);
  const minor = account
    ? account.amountMinor
    : Math.abs(Math.round(Number(s.tx.amount) || 0));
  return {
    name: String(s.tx.description ?? ""),
    // Кома, як у полях, які людина заповнює сама (`parseDecimal` її приймає).
    invested: (minor / 100).toFixed(2).replace(".", ","),
    ...(date ? { date } : {}),
    ...(account
      ? {
          currency: account.currency as SavingsCurrency,
          fxRate: account.uahPerUnit
            ? String(account.uahPerUnit).replace(".", ",")
            : "",
        }
      : {}),
  };
}

export function AssetLinkSuggestions({
  suggestions,
  accept,
  reject,
  createFrom,
}: {
  suggestions: readonly AssetLinkSuggestion[];
  accept: (s: AssetLinkSuggestion, assetId?: string) => void;
  reject: (s: AssetLinkSuggestion) => void;
  createFrom: (s: AssetLinkSuggestion, asset: ManualAsset) => void;
}) {
  const [creating, setCreating] = useState<AssetLinkSuggestion | null>(null);
  if (suggestions.length === 0 && !creating) return null;
  return (
    <div className="space-y-2" data-testid="finyk-asset-link-suggestions">
      {suggestions.map((s) => {
        const desc = String(s.tx.description ?? "");
        const name = s.assets[0]?.name ?? "";
        const isNew = s.assets.length === 0;
        return (
          <Card key={s.tx.id} className="space-y-2">
            <p className="text-style-label text-text">{titleOf(s)}</p>
            <p className="text-style-caption text-muted">
              {desc} ·{" "}
              {formatNumberUk(Math.abs(Number(s.tx.amount)) / 100, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              ₴
            </p>
            {s.assets.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {s.assets.map((a) => (
                  <Button
                    key={a.id}
                    size="sm"
                    variant="outline"
                    onClick={() => accept(s, a.id)}
                  >
                    {t.acceptInto.replace("{name}", a.name ?? "")}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              {s.assets.length <= 1 && (
                <Button
                  className="flex-1"
                  size="sm"
                  tone="ink"
                  variant="solid"
                  onClick={() => (isNew ? setCreating(s) : accept(s))}
                >
                  {isNew ? t.create : acceptLabel(s)}
                </Button>
              )}
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                aria-label={
                  s.assets.length === 1
                    ? t.rejectAria.replace("{tx}", desc).replace("{name}", name)
                    : t.rejectNewAria.replace("{tx}", desc)
                }
                onClick={() => reject(s)}
              >
                {t.reject}
              </Button>
            </div>
          </Card>
        );
      })}
      {creating?.kind && (
        <Sheet
          open
          onClose={() => setCreating(null)}
          title={t.createTitle}
          description={t.createHint}
        >
          <SavingsAssetForm
            kind={creating.kind}
            today={localTodayKey()}
            initial={draftFromTx(creating)}
            onAdd={(asset) => {
              createFrom(creating, asset);
              setCreating(null);
            }}
            onCancel={() => setCreating(null)}
          />
        </Sheet>
      )}
    </div>
  );
}
