# 90 · Work — активні tracker-и

> **Last validated:** 2026-07-20 by @cursoragent (post fast-forward archive). **Next review:** 2026-10-18.
> **Status:** Active

> **Update 2026-07-10:** pricing canon — [ADR-0068](../04-governance/adr/0068-pricing-v4-uah-reverse-trial.md). Billing scaffold shipped; `tools/openclaw` removed (ADR-0055 external gateway). Product/governance doc passes: #220, #221.

Жива робота: ініціативи, плани, аудити, технічний борг. Жанр — **trackers**
(lifecycle-managed `Active → Closed → Archived`). Читай, коли плануєш PR;
онови, коли шипиш. Зведений дашборд усього відкритого — [`open-work.md`](../open-work.md).

Починай оцінку обсягу й готовності з
[`product-readiness-2026-07-18.md`](./product-readiness-2026-07-18.md). Він відділяє
ready-now роботу від зовнішніх блокерів, owner-рішень і reference-матеріалів.

| Розділ                                    | Що тут                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| [`initiatives/`](./initiatives/README.md) | Нумеровані multi-PR ініціативи з acceptance-критеріями і вікном стабілізації. |
| [`planning/`](./planning/README.md)       | Активні роадмапи, infra-плани, staged improvements.                           |
| [`audits/`](./audits/README.md)           | Індекс аудитів; живих tracker-ів 0 — історія в `audits/archive/`.             |
| [`tech-debt/`](./tech-debt/README.md)     | Реєстри боргу й cleanup-плани (per-platform, з freshness-гейтом).             |
| [`superpowers/`](./superpowers/README.md) | High-leverage one-page гайди; завершені плани під `plans/archive/`.           |

> **Архівація:** `Closed` / `Done` / `Reference` / `Deprecated` tracker-и переносяться у
> сусідній `archive/` (див. README кожного розділу). Default gate — ≥90 днів після
> `Closed`; **fast-forward** (skip 90d) дозволено за явним рішенням founder-а
> (Batch 2026-07-20 на цій гілці). Withdrawn ініціативи лишаються в активному списку.

Зведена матриця hardening-карток (stack-pulse-2026-05 + \_0008 + \_0009): [`initiatives/hardening-matrix.md`](./initiatives/hardening-matrix.md).

Назад до кореня: [`docs/README.md`](../README.md).
