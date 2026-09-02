# 90 · Work — активні tracker-и

> **Last validated:** 2026-07-20 by @cursoragent (post fast-forward archive). **Next review:** 2027-02-15.
> **Status:** Active

> **Update 2026-07-10:** pricing canon — [ADR-0068](../04-governance/adr/0068-pricing-v4-uah-reverse-trial.md). Billing scaffold shipped; `tools/openclaw` removed (ADR-0055 external gateway). Product/governance doc passes: #220, #221.

Жива робота: ініціативи, плани, аудити, технічний борг. Жанр — **trackers**
(lifecycle-managed `Active → Closed → Archived`). Читай, коли плануєш PR;
онови, коли шипиш. Зведений дашборд усього відкритого — [`open-work.md`](../open-work.md).

Починай оцінку обсягу й готовності з
[`product-readiness-2026-07-18.md`](./product-readiness-2026-07-18.md). Він відділяє
ready-now роботу від зовнішніх блокерів, owner-рішень і reference-матеріалів.

| Розділ                                                              | Що тут                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`initiatives/`](./initiatives/README.md)                           | Нумеровані multi-PR ініціативи з acceptance-критеріями і вікном стабілізації.                                                                                                                           |
| [`planning/`](./planning/README.md)                                 | Активні роадмапи, infra-плани, staged improvements.                                                                                                                                                     |
| [`audits/`](./audits/README.md)                                     | Індекс аудитів; завершена історія доступна через Git history/permalinks.                                                                                                                                |
| [`tech-debt/`](./tech-debt/README.md)                               | Реєстри боргу й cleanup-плани (per-platform, з freshness-гейтом).                                                                                                                                       |
| [`superpowers/`](./superpowers/README.md)                           | High-leverage one-page гайди; завершені плани під `plans/archive/`.                                                                                                                                     |
| [`research/`](./research/2026-06-28-audience-discovery-trackers.md) | Discovery-дослідження аудиторії та джерел даних + kit для інтервʼю; конкурентний зріз по модулях — [`2026-09-01-competitor-research-modules.md`](./research/2026-09-01-competitor-research-modules.md). |
| [`beta-launch/`](./beta-launch/README.md)                           | Плейбук хвилі закритої бети: гейти, ENV, видача Pro, згортання.                                                                                                                                         |

> **Завершення:** `Closed` / `Done` / `Reference` tracker спершу фіксує Outcome і merge evidence, після чого frozen-файл можна прибрати окремим cleanup-комітом. Історія доступна через Git; локальні archive-дерева для audits/initiatives/planning retired за ADR-0081. Withdrawn ініціативи лишаються у живому списку для аудит-сліду.

Зведена матриця hardening-карток (stack-pulse-2026-05 + \_0008 + \_0009): [`initiatives/hardening-matrix.md`](./initiatives/hardening-matrix.md).

Назад до кореня: [`docs/README.md`](../README.md).
