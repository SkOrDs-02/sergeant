/**
 * Секція «Відкладення» в аркуші банківської операції (спека
 * `docs/work/specs/finyk-savings-assets.md`): списання можна привʼязати як
 * внесок в актив, надходження — як повернення з активу чи дохід з нього.
 * Логіку запису тримає `useAssetLinks.ts`, тут лише вибір і підтвердження.
 */
import { useState } from "react";
import { messages } from "@shared/i18n";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { Input } from "@shared/components/ui/Input";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { parseAmountToMinor } from "@shared/lib/format/amount";
import type { AssetEventType } from "@sergeant/finyk-domain/domain/assets";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { AssetLinkApi } from "../pages/transactions/useAssetLinks";
import { txAmountInAsset } from "../pages/transactions/useAssetLinks";

const t = messages.finyk.assetLink;

/** Що можна привʼязати з аркуша: оцінка вводиться лише в журналі активу. */
type LinkType = Exclude<AssetEventType, "valuation">;

export function AssetLinkSection({
  transaction,
  api,
}: {
  transaction: Transaction;
  api: AssetLinkApi;
}) {
  const isIncome = Number(transaction.amount) > 0;
  const types: LinkType[] = isIncome
    ? ["withdrawal", "income"]
    : ["contribution"];
  const [type, setType] = useState<LinkType | null>(null);
  const [assetId, setAssetId] = useState<string>(api.assets[0]?.id ?? "");
  const asset = api.assets.find((a) => a.id === assetId);
  const prefill = asset ? txAmountInAsset(transaction, asset) : null;
  const [amount, setAmount] = useState<string>("");
  const [count, setCount] = useState("");
  const shownAmount = amount || (prefill ? String(prefill / 100) : "");
  const parsed = parseAmountToMinor(shownAmount);
  const isOvdpMove =
    asset?.["kind"] === "ovdp" &&
    (type === "contribution" || type === "withdrawal");

  if (api.current) {
    const name =
      api.assets.find((a) => a.id === api.current?.assetId)?.name ?? "";
    return (
      <section
        data-testid="finyk-asset-link"
        className="space-y-2 rounded-panel border border-line bg-panel p-3"
      >
        <p className="text-style-label text-text">
          {t.linked[api.current.type].replace("{name}", name)}
        </p>
        <Button size="sm" variant="outline" onClick={api.onUnlink}>
          {t.unlink}
        </Button>
      </section>
    );
  }

  return (
    <section
      data-testid="finyk-asset-link"
      className="space-y-2 rounded-panel border border-line bg-panel p-3"
    >
      <p className="text-style-label text-text">{t.title}</p>
      {type === null ? (
        <>
          <div className="flex flex-wrap gap-2">
            {types.map((k) => (
              <Button
                key={k}
                size="sm"
                variant="outline"
                onClick={() => setType(k)}
              >
                {t.actions[k]}
              </Button>
            ))}
          </div>
          <p className="text-style-caption text-muted">{t.hint}</p>
        </>
      ) : (
        <>
          <ChoiceGroup<string>
            items={api.assets.map((a) => ({
              value: a.id,
              label: `${a.name ?? ""} · ${a.currency ?? "UAH"}`,
            }))}
            value={assetId}
            onChange={(id) => {
              setAssetId(id);
              setAmount("");
            }}
            ariaLabel={t.pickAsset}
            variant="rows"
            size="sm"
          />
          <MoneyInput
            aria-label={t.amountIn.replace(
              "{currency}",
              asset?.currency ?? "UAH",
            )}
            placeholder={t.amountIn.replace(
              "{currency}",
              asset?.currency ?? "UAH",
            )}
            value={shownAmount}
            onValueChange={(next) =>
              setAmount(next == null ? "" : String(next))
            }
          />
          {isOvdpMove && (
            <Input
              id={`asset-link-count-${transaction.id}`}
              label={t.count}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              tone="ink"
              variant="solid"
              disabled={!asset || !parsed.ok}
              onClick={() => {
                if (!asset || !parsed.ok) return;
                const n = Number(count);
                api.onLink(
                  asset.id,
                  type,
                  parsed.minor,
                  isOvdpMove && Number.isInteger(n) && n > 0 ? n : undefined,
                );
                setType(null);
              }}
            >
              {t.confirm}
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="outline"
              onClick={() => setType(null)}
            >
              {t.cancel}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
