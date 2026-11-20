/**
 * Вебовий запис `finyk_assets` (`hooks/useStorage.types.ts`: відкритий
 * обʼєкт із `[extra: string]: unknown`) ↔ доменний `ManualAsset`
 * (`@sergeant/finyk-domain`). Поля рахунку-активу (спека
 * `finyk-savings-assets.md`) живуть у `extra`, тож тут вони беруться явно,
 * а не подвійним кастом.
 */
import type {
  AssetEvent,
  AssetFxRate,
  AssetKind,
  DepositParams,
  ManualAsset as DomainAsset,
  OvdpParams,
} from "@sergeant/finyk-domain/domain/assets";
import type { ManualAsset } from "../hooks/useStorage";

export function toDomainAsset(a: ManualAsset): DomainAsset {
  return {
    id: a.id,
    name: a.name ?? "",
    amount: Number(a.amount) || 0,
    currency: a.currency ?? "UAH",
    ...(a.emoji !== undefined ? { emoji: a.emoji } : {}),
    kind: a["kind"] as AssetKind | undefined,
    events: a["events"] as AssetEvent[] | undefined,
    deposit: a["deposit"] as DepositParams | undefined,
    ovdp: a["ovdp"] as OvdpParams | undefined,
    fxRate: a["fxRate"] as AssetFxRate | null | undefined,
    status: a["status"] as DomainAsset["status"],
    closedAt: a["closedAt"] as string | null | undefined,
  };
}

/**
 * Доменний актив назад у вебовий запис. Поля, яких домен не знає (напр.
 * `linkedTxIds`), беруться з `base`, щоб правка їх не губила.
 */
export function fromDomainAsset(
  next: DomainAsset,
  base?: ManualAsset,
): ManualAsset {
  return { ...base, ...next };
}
