# ADR-0076: «Готівка на руках» як окрема сутність finyk

- **Status:** Accepted
- **Date:** 2026-07-25
- **Last validated:** 2026-09-04 against the codebase graph. **Next review:** 2026-12-03.
- **Supersedes:** —
- **Related:** [`finyk.md`](../../01-product/model/finyk.md), [`product-knowledge-finyk.md`](../../90-work/audits/product-knowledge-finyk.md).

## Контекст

Зняття в банкоматі та подальша ручна готівкова витрата можуть обліковувати ту
саму гривню двічі. Generic manual asset не створює окремого готівкового
рахунку, тому не є реалізацією цього рішення.

## Цільове рішення

Після окремої поставки MCC 6011 withdrawal має створювати transfer «картка →
Готівка на руках», а готівкова витрата — дебетувати цей рахунок зі своєю
категорією. Автоматична класифікація є видимою overrideable підказкою. Rollout
лише forward-only: історичні операції та вже показані aggregates не
перераховуються.

## Поточна межа

Фіча не поставлена. У коді немає окремої cash сутності, ledger, withdrawal
matcher, server persistence, API contract або end-to-end web/mobile flow.
Initial balance, reconciliation, multi-currency, migration, matching rules і
дата релізу — pending. До цього подвійний облік лишається відомим боргом, а не
закритою проблемою.

## Наслідки

Поставка потребує узгодженої зміни schema, serializer/API client, web, mobile,
sync і фінансових агрегатів. Частковий inline patch не дозволений: він створить
різні цифри між поверхнями.
