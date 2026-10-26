# Work — активні спеки та докази

> **Last touched:** 2026-10-26 by @claude (точки входу трекінгу: `roadmap.md` і `owner-decisions.md` поруч з `open-work.md`). **Next review:** 2026-12-16.
> **Status:** Active

> **Update 2026-07-10:** pricing canon — [ADR-0068](../governance/adr/0068-pricing-v4-uah-reverse-trial.md). Billing scaffold shipped; `tools/openclaw` removed (ADR-0055 external gateway). Product/governance doc passes: #220, #221.

Жива робота має одну фізичну точку входу — [`specs/`](./specs/). Підкаталоги
зберігають жанр і предметну область, але не є окремими tracker-ами. Жанр —
**work** (`Active → Closed`), а завершена історія живе в Git або ADR. Зведений
дашборд усього відкритого — [`open-work.md`](../open-work.md).

Трекінг прогресу тримається на трьох файлах:

- [`roadmap.md`](./roadmap.md) — що робимо першим: «Зараз / Далі / Колись», один рядок на роботу з наступною дією і блокером. Ведеться руками.
- [`owner-decisions.md`](./owner-decisions.md) — усі відкриті рішення власника в одному місці (раніше губились у тілах аудитів).
- [`open-work.md`](../open-work.md) — автоматичний список усього, що має відкритий статус.

Аудит після виконаних хвиль одразу стає `Reference`, залишки йдуть в один живий документ.

Починай оцінку обсягу й готовності з [`roadmap.md`](./roadmap.md) і [`open-work.md`](../open-work.md)
(усе відкрите одним списком), а для історії продуктових рішень — із синтезу продуктового аудиту
[`audits/2026-09-01-product-audit/report.md`](./specs/audits/2026-09-01-product-audit/report.md)
(блокери, хвилі фіксів, рішення власника).
[`product-readiness-2026-07-18.md`](./product-readiness-2026-07-18.md) — Reference-зріз
липня, що сам переадресовує туди ж.

| Розділ                                                              | Що тут                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`initiatives/`](./specs/initiatives/README.md)                     | Multi-PR спеки та їхні acceptance criteria.                                                                                                                                                             |
| [`planning/`](./specs/planning/README.md)                           | Активні роадмапи й підготовчі рішення.                                                                                                                                                                  |
| [`audits/`](./specs/audits/README.md)                               | Індекс аудитів; завершена історія доступна через Git history/permalinks.                                                                                                                                |
| [`tech-debt/`](./specs/tech-debt/README.md)                         | Legacy реєстри боргу; нові cleanup-зміни оформлюються як спеки.                                                                                                                                         |
| [`superpowers/`](./specs/superpowers/README.md)                     | Legacy high-leverage плани; нові матеріали не створюються окремим жанром.                                                                                                                               |
| [`research/`](./research/2026-06-28-audience-discovery-trackers.md) | Discovery-дослідження аудиторії та джерел даних + kit для інтервʼю; конкурентний зріз по модулях — [`2026-09-01-competitor-research-modules.md`](./research/2026-09-01-competitor-research-modules.md). |
| [`beta-launch/`](./specs/beta-launch/README.md)                     | Плейбук хвилі закритої бети: гейти, ENV, видача Pro, згортання.                                                                                                                                         |

> **Завершення:** активна спека спершу фіксує Outcome і merge evidence, після чого її прибирають з active checkout. Історія доступна через Git; локальні archive-дерева для audits/initiatives/planning не розширюються (ADR-0081).

Зведена матриця hardening-карток (stack-pulse-2026-05 + \_0008 + \_0009): [`initiatives/hardening-matrix.md`](./specs/initiatives/hardening-matrix.md).

Назад до кореня: [`docs/README.md`](../README.md).
