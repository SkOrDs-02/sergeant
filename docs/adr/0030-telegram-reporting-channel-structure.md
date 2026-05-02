# ADR-0030: Структура Telegram-каналів для n8n reporting

- **Status:** Accepted
- **Date:** 2026-05-02
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) — workflow → topic routing matrix.
  - [`docs/observability/telegram-control-plane.md`](../observability/telegram-control-plane.md) — architectural review.
  - [ADR-0026 — n8n workflow source of truth](./0026-n8n-workflow-source-of-truth.md) — Git-as-truth для workflow JSON.
  - [`docs/playbooks/modify-n8n-workflow.md`](../playbooks/modify-n8n-workflow.md) — playbook оновлення matrix-у разом з workflow.

---

## Context

n8n воркфлови Sergeant Ops станом на 2026-05-02 шлють повідомлення в один
Telegram chat через `Sergeant_alert_bot`. До цього PR layout каналів був
**не задокументований** — операційно існував "один великий потік", де
revenue-події, deploy-нотифікації, growth-метрики, security-аудит та
n8n-side errors змішувалися. Як наслідок:

- Founder не міг швидко відрізнити "у нас break" від "розкат пройшов"
  без читання payload-а.
- При додаванні нового workflow-у не було очевидного правила, в який
  chat/топік його роутити.
- Escalation policy (P0 vs P2 alert) існувала тільки в `manifest.json` —
  з нульовим overlay-ем на UX.

Одночасно з цим, кількість workflow-ів виросла з 8 (Q1 2026) до 19
(Q2 2026), у тому числі активувались:

- Growth pipeline: WF-16/60/63 (PostHog).
- Push pipeline до end users: WF-07/09/10.
- Meta-control plane: WF-98 (error fan-out) + WF-99 (heartbeat).

Без формалізації ризик: новий workflow → ad-hoc chat ID → drift
між git і live n8n → втрачений alert.

## Decision

Прийнято **single supergroup + Forum mode (Topics)** як layer
маршрутизації reporting messages з n8n до операторів. Конкретно:

1. **Один Telegram supergroup** `Sergeant Ops` як target усіх
   monitoring/alerting workflow-ів.
2. **Forum mode** активований; топіки — **canonical 8** з фіксованим
   призначенням (див.
   [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md)):

   | Topic             | Tier | Owner area     |
   | ----------------- | ---- | -------------- |
   | `#incidents`      | P0   | ops + security |
   | `#revenue`        | P0   | ops + finyk    |
   | `#meta`           | P0   | ops            |
   | `#ops`            | P1   | ops            |
   | `#engineering`    | P1   | devex          |
   | `#growth`         | P2   | growth         |
   | `#digest`         | P2   | finyk          |
   | _(DM, not topic)_ | P2   | product        |

3. **User-facing push** (`#DM`) — окремий канал доставки через
   `/api/push/send`, **не** в supergroup. Workflow-и WF-07/09/10
   шлють лише в DM до конкретних юзерів; агрегати/health від цих
   workflows — у `#ops`.

4. **Escalation hierarchy**: P0 → topic + WF-98 → email; P1 → topic +
   WF-98 (no email); P2 → topic only. Anti-loop інваріант WF-98 (не має
   `errorWorkflow` посилання) залишається.

5. **Source of truth для маппінгу workflow→topic** — файл
   [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md).
   `manifest.json` лишається source of truth для технічних параметрів
   (env, credentials, riskTier).

6. **Hard-rule оновлення matrix при змінах workflow** — порушує Hard
   Rule #15 (docs alongside code) і блокує merge.

## Consequences

### Позитив

- Одна inbox-нитка — founder бачить усе на одному екрані телефону, але
  з топік-розшаруванням бачить пріоритет миттєво.
- Telegram Forum-mode notifications per-topic: P0 топіки лишаються з
  default sound, P2 — silent.
- Migration cost мінімальний: bot-токен той же, нові топіки — admin
  меню за 30 секунд.
- Workflow → topic mapping тепер декларативний у matrix, не "в голові".
- Нові workflow-и матимуть однозначне правило routing.

### Негатив / debt

- **Нема machine validation** matrix vs `manifest.json` (поки):
  розсинхрон ловиться людиною на ревью. Roadmap — додати
  `telegramTopic` поле у `manifest.schema.json` + `pnpm
ops:n8n:validate`.
- **Telegram RBAC** — будь-який member supergroup-у бачить усі топіки.
  Для PII-sensitive payload-ів (поки таких нема) — обмеження.
- **One bot per supergroup** — якщо знадобиться окремий персональний
  bot (наприклад, для founder DM), треба буде керувати кількома bot
  tokens у secrets.

### Тригери ре-evaluation

ADR ре-розглядається коли спрацює один з тригерів з
[`docs/observability/telegram-control-plane.md`](../observability/telegram-control-plane.md#when-to-migrate):
team > 2 active operators, alert volume > 50/день, SOC-2 розпочався,
PII у P0 alerts, > 5 одночасних bot commands, > 30 workflow × > 8
топіків.

Якщо тригер fired → відкривати ADR-0031 з конкретним fork-ом
(Slack/PagerDuty/dashboard).

## Alternatives considered

### A. Один chat без топіків (status quo до цього PR)

- ❌ Pri-priority signal губиться в потоці.
- ❌ Routing нове-workflow → chat ID — ad hoc.
- ❌ Топіки — нативна Telegram-функція, безкоштовна. Її ігнорувати = self-imposed limitation.

### B. Окремий supergroup на кожну категорію (revenue / incidents / growth / …)

- ❌ Multiple unread bubbles на mobile — погіршує UX.
- ❌ Bot config per supergroup — multiplied operational burden.
- ❌ Cross-topic search неможливий (Telegram search per chat).
- ✅ Гранулярніший RBAC (можна виставити різні admin sets) — але це
  не actual need поки команда = founder.

### C. Перейти одразу на Slack

- ❌ Premature: solo-founder, free tier обмежує history до 90 днів —
  втрачаємо audit-friendly chat log.
- ❌ Mobile experience у Slack гірший за Telegram (за нашими тестами
  Q1 2026 — більше latency push, менш надійно за межами WiFi).
- ❌ Setup cost (workspace + apps + integrations) > поточних 5 хв на
  топік.
- ✅ Якщо тригери міграції спрацюють — Slack залишається #1 кандидат
  (див. ADR-0031 коли він буде).

### D. Власний admin dashboard замість chat alerts

- ❌ Premature: dev cost у тиждень+ без incremental value поки solo.
- ❌ Mobile: PWA push працює гірше за Telegram native push.
- ✅ Колись потрібен буде — але не як заміна, а як complement
  (dashboard для health/SLO + chat для events).

## Implementation checklist

- [x] Створити Telegram supergroup `Sergeant Ops` у Forum mode
      (chat id `-1003924852082`, _live since 2026-05-02_).
- [x] Додати `Sergeant_alert_bot` як admin (post + manage topics + pin).
- [x] Створити 7 канонічних топіків + закріпити в кожному pinned-message
      з описом області відповідальності (Ukrainian UI labels:
      `🔴 Інциденти`, `💰 Виторг`, `⚙️ Контрол-план`, `🟡 Опс`,
      `🛠️ Інженерія`, `🚀 Зростання`, `📊 Дайджести`).
- [x] Прокинути 7 `TELEGRAM_TOPIC_*` env vars на Railway n8n service +
      оновити `ops/.env.ops.example` + `ops/README.md`.
- [x] Оновити всі 17 workflow JSON-ів — додати
      `additionalFields.message_thread_id =
"={{ $env.TELEGRAM_TOPIC_<NAME> }}"` per
      [`REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md).
      WF-15 використовує тернарне routing на `$json.ok`.
- [x] Розширити `manifest.json` полями `telegramTopic` + `audienceTier`
      (machine-readable mapping). Schema cross-check у
      `pnpm ops:n8n:validate` — наступний крок.
- [x] Документувати layout у `REPORTING-MATRIX.md`.
- [x] Документувати архітектурне обґрунтування у
      `docs/observability/telegram-control-plane.md`.
- [x] Прийняти цей ADR.
- [ ] (Roadmap) Розширити `manifest.schema.json` schema for
      `telegramTopic` + `audienceTier` (поки valid as additional fields,
      але без явного enum-у).
- [ ] (Roadmap) Розширити `pnpm ops:n8n:validate` cross-check
      matrix vs manifest vs JSON expressions.
- [ ] (Roadmap) Inline-button "Acknowledge" у WF-98 dead-letter
      повідомленнях → bot endpoint → `n8n_errors.acknowledged_at`.

## Related

- [ADR-0026: n8n workflow source of truth](0026-n8n-workflow-source-of-truth.md)
- [Reporting matrix](../../ops/n8n-workflows/REPORTING-MATRIX.md)
- [Telegram-as-control-plane analysis](../observability/telegram-control-plane.md)
- [Modify n8n workflow playbook](../playbooks/modify-n8n-workflow.md)
