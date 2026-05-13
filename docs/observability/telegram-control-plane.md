# Telegram як control plane для Sergeant Ops

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Це architectural review: **чи достатньо Telegram-бота, щоб масштабувати
Sergeant Ops у повноцінний "console управління"?** Чи треба готуватись до
міграції на Slack / dashboard / on-call platform — і **коли саме**?

TL;DR — **так, достатньо, поки solo-founder + ≤1 team member + alert-volume
< 50/день**. Міграція стає виправданою тільки після одного з конкретних
тригерів у розділі "When to migrate". Поточний layout каналів і workflow
mapping живе у [`../../ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md);
формальне рішення — у [ADR-0030](../adr/0030-telegram-reporting-channel-structure.md).

## Що ми називаємо "control plane"

В Sergeant Ops control plane виконує три функції:

1. **Observation** — система каже людині, що відбувається у проді.
   Pulls + pushes + дайджести.
2. **Notification routing** — повідомлення доставляється потрібному
   власнику з потрібним рівнем urgency.
3. **Action surface** — людина може щось зробити у відповідь
   (acknowledge, mute, restart, dispatch, run a script).

Telegram + n8n + HubChat сьогодні закривають перші два пункти
повністю, а третій — частково (через HubChat slash-команди + Telegram
кнопки, де вони реалізовані).

## Що працює у поточному setup

### Сильні сторони

| Аспект                     | Чому працює зараз                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cost**                   | Telegram free, n8n self-hosted ~$3–5/міс на Railway, supergroup без квот.                                                                              |
| **Mobile-first**           | Founder reads alerts on phone у будь-якому контексті. Push notification робиться сам.                                                                  |
| **Setup latency**          | Від "треба новий канал alert-ів" до "канал є + бот пише" — < 5 хвилин.                                                                                 |
| **Forum mode (Topics)**    | Нативна сегментація без створення multi-chat zoo. До 100 топіків на supergroup.                                                                        |
| **Conversational replies** | Завдяки HubChat інтеграції, можна відповісти на алерт прямо в нитці. На відміну від email/SMS — двосторонній канал з нульовим контекстом-перемиканням. |
| **Backend authoring**      | n8n Telegram node — drop-in. Не треба webhook-server поруч з n8n.                                                                                      |
| **Audit trail**            | Telegram зберігає історію вічно; для compliance use cases — додатково WF-98 пише у Postgres `n8n_errors`. Тобто є dual-store з безкоштовним side.      |
| **Search**                 | Telegram має full-text search by chat / topic — для current alert-volume цього достатньо.                                                              |

### Поточні структурні обмеження

| Обмеження                          | Який use-case ламається                                                                                                                                                                             | Що ми робимо зараз                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Немає first-class acknowledge**  | P0 alert треба вручну позначати "прочитано/в обробці". Ризик "розчинення" в потоці.                                                                                                                 | WF-98 пише в Postgres → майбутній dashboard покаже unacked. Roadmap — inline-button у меседжі, що пише `acknowledged_at`.                                               |
| **Немає on-call rotation**         | Зараз on-call = founder. Якщо нас стане 2+, питання "чий зараз pager" не вирішується через Telegram.                                                                                                | Тригер міграції — див. нижче.                                                                                                                                           |
| **RBAC грубий**                    | Любий member supergroup-у бачить усі топіки. Можна заборонити post (admin-only), але не read.                                                                                                       | Для P0/sensitive (e.g. payment failures) — використовуємо рівень agentу (LLMs), не supergroup. Раз чутливий список grow-not — переходити на Slack private channels.     |
| **Rate-limit Telegram Bot API**    | 30 msg/sec по бота, 20 msg/min на чат. На сьогодні ми ~0.5 msg/min на supergroup, але DDoS-pattern alert-storm (наприклад, Sentry викидає 1000 алертів за хвилину) уперся б у quota → втрата подій. | WF-98 з PR-15 робить 30-хв cooldown по `(workflow_id, error_signature)` → repeating-failure pattern одна alert замість лавини. Audit-log повний у `n8n_failure_events`. |
| **No structured payload in topic** | Telegram message — text + inline buttons, але не structured object. Не можеш emit "alert object" і потім фільтрувати чи jq-ом.                                                                      | Дублюємо в Postgres (WF-98) для structured queries.                                                                                                                     |
| **No SLA/SLO surface in chat**     | "Чи горить error budget?" — треба окремий dashboard. Telegram як alert hub не показує health, тільки точкові події.                                                                                 | Grafana покриває, посилання на дашборд є в `#ops` стрічці. Для phase 2 — Grafana Cloud, див. [`hosting-evolution.md`](../architecture/hosting-evolution.md).            |
| **Bot повна довіра**               | Якщо Telegram bot token компромет — атакер може писати від імені бота куди-завгодно у supergroup. На відміну від email — bot tokens в одному secrets-store.                                         | Rotate via [`docs/playbooks/rotate-secrets.md`](../playbooks/rotate-secrets.md) → Telegram revoke + new BotFather token.                                                |

## Telegram vs альтернативи

| Критерій                       | Telegram bot + Forum mode                | Slack                                  | Custom dashboard         | PagerDuty/Opsgenie |
| ------------------------------ | ---------------------------------------- | -------------------------------------- | ------------------------ | ------------------ |
| **Setup cost (mins to value)** | ✅ ~5 хв                                 | 🟡 ~30 хв (workspace + apps)           | ❌ дні-тижні             | 🟡 ~1 день         |
| **$/міс при solo-founder**     | ✅ ~$0                                   | 🟡 free → \$\$ при > 90 day history    | ❌ infra cost + dev time | ❌ \$15+/seat      |
| **Mobile push native**         | ✅                                       | ✅                                     | 🟡 (PWA / окремий app)   | ✅                 |
| **Two-way replies**            | ✅ (HubChat)                             | ✅                                     | ❌ (треба свій chatbot)  | 🟡 (email-only)    |
| **On-call rotations**          | ❌                                       | 🟡 (через Slack apps або зовнішній PD) | 🟡 (свій код)            | ✅                 |
| **Acknowledge mechanism**      | 🟡 (через bot inline button — у roadmap) | 🟡 (через apps)                        | ✅                       | ✅                 |
| **Audit trail**                | 🟡 (chat history + Postgres dual-store)  | ✅                                     | ✅                       | ✅                 |
| **RBAC granular**              | ❌                                       | ✅                                     | ✅                       | ✅                 |
| **SOC-2 ready out-of-box**     | ❌                                       | ✅                                     | 🟡 (треба інженерія)     | ✅                 |
| **Сценарій Sergeant 2026**     | ✅ optimal                               | overkill                               | premature                | premature          |

Підсумок: Telegram **домінує** на крос-перетині "цінність на годину
налаштування × cost × mobile UX" поки команда ≤2 і compliance не питає
SOC-2. Як тільки одна з координат зрушується — переоцінювати.

## When to migrate

Кожен пункт — **самостійний тригер** (OR), не конь'юнкція. Якщо хоча б один
true → відкривати ADR-0031 та ставити migration в roadmap.

1. **Команда виросла до 2+ active operators** з потребою on-call rotation.
   Telegram не вміє "цей тиждень — Іра, наступний — Влад" без зовнішнього
   tooling. Slack + PagerDuty / Opsgenie integration закриває це
   first-class.

2. **Alert volume у `#incidents` сталий > 50 повідомлень/день > 7 днів
   поспіль**. На цьому рівні Telegram стрічка стає шумною — губиться
   priority signal. Рішення: alert routing з deduplication у Grafana
   OnCall / PagerDuty, Telegram → digest only.

3. **SOC-2 / ISO-27001 кваліфікація розпочалась**. Тоді треба audit trail
   з cryptographic signatures, SSO/RBAC, retention policies — Slack
   Enterprise Grid або dedicated incident management tool.

4. **Sensitive PII у P0 alerts** (наприклад, support escalations з
   копіями user data). Telegram supergroup має широкий read scope; для
   PII треба private channels per role або повний переїзд на Slack
   private channels з SAML.

5. **Понад 5 одночасно активних бот-команд** для action-surface (`/restart`,
   `/scale`, `/deploy`, `/rollback`, `/freeze`). HubChat поки потужний на
   conversational, але як тільки інтерфейс стає "command pad" — окремий
   web console (admin panel) дешевший за costly Telegram bot UX.

6. **Workflow-and-canal mapping ≥ 30 workflows × ≥ 8 топіків** і
   matrix-управління вручну стає errorprone. Тоді — переходити на
   schema-driven config (`telegramTopic` у `manifest.json` +
   автогенератор) як прелюдія міграції.

## Pre-migration ще не блокери

Поки тригер не fired — **не ламати роботу**:

- WF-98 Postgres dual-store — вже є.
- `riskTier` у `manifest.json` — формалізує priority.
- Structured matrix у [`REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) — формалізує routing.

Це 80% переробки, яка все одно знадобилась би при міграції. Тобто Telegram
**не мертвий шлях**: те, що зараз вкладається в формалізацію, прозоро
переноситься на новий control plane.

## Decision criteria framework для розширень

Коли користувач (founder / contributor) питає "**чи додати ще канал X?**":

- **Pro** — використати топіки existing supergroup (легко, нативно).
- **Pro** — створити окремий supergroup (для зовнішніх stakeholder-ів,
  e.g. fully-DM-owners-only "investor digest").
- **Con / триггер міграції** — створити > 8 топіків і помітити, що
  поведінка топік-перемикання губиться. Це сигнал, що supergroup не
  скейлиться → готувати ADR-0031.

## Operational FAQ

**Q. Чому ми не зробили окремий Telegram chat для `#engineering`, `#growth`
та інших, а поклали все в один supergroup з топіками?**
A. Forum mode дає сегментацію + одна inbox-нитка для founder. У нас одна
людина читає все, але хоче візуально бачити, "це бекап чи growth-метрика".
Multiple chats — multiple unread bubbles, гірший UX.

**Q. Як гарантувати, що P0 не загубиться у потоці?**
A. WF-98 пише дублі у Postgres → майбутній SQL view `unacked_p0` або bot
команда `/n8n unacked`. Поки workflow alert volume низький — вистачає
візуального контролю.

**Q. Що, якщо Telegram впаде або bot заблокований?**
A. WF-98 + WF-99 мають Resend email fallback. Email-only режим деградований
але functional. Якщо Telegram стабільно недоступний > 48 год — це
триггер міграції на Slack/dashboard.

**Q. Чому DM (push до user) — окремий канал, не топік?**
A. Push до end users — це бізнес-feature, не моніторинг. Sergeant Ops
supergroup — operator surface; user push — окрема система через
`/api/push/send`. Змішати — порушити separation of concerns.

## Related

- [ADR-0030: Telegram reporting channel structure](../adr/0030-telegram-reporting-channel-structure.md)
- [ADR-0026: n8n workflow source of truth](../adr/0026-n8n-workflow-source-of-truth.md)
- [Reporting Matrix](../../ops/n8n-workflows/REPORTING-MATRIX.md)
- [Observability runbook](runbook.md)
- [Hosting evolution (when to scale infra)](../architecture/hosting-evolution.md)
- [HubChat orchestration playbook (бот-команди)](../playbooks/add-hubchat-tool.md)
