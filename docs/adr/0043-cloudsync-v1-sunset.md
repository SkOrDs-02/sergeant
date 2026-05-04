# ADR-0043: CloudSync v1 sunset — RFC 8594 deprecation headers + 6-phase rollout

- **Status:** Accepted
- **Date:** 2026-05-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0004 — CloudSync LWW conflict resolution](./0004-cloudsync-lww-conflict-resolution.md) — це v1, що ми збираємось sunset-нути.
  - [Initiative 0003 — Sync v2 rollout & v1 sunset](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md) — rationale-документ із 6-фазним планом.
  - [`apps/server/src/modules/sync/sync.ts`](../../apps/server/src/modules/sync/sync.ts) — v1 LWW-blob handlers (`syncPush` / `syncPull` / `syncPushAll`).
  - [`apps/server/src/modules/sync/syncV2.ts`](../../apps/server/src/modules/sync/syncV2.ts) — v2 op-log handlers (Stage 2 / PR #021).
  - [`apps/server/src/modules/sync/sunsetHeaders.ts`](../../apps/server/src/modules/sync/sunsetHeaders.ts) — middleware, що реалізує цей ADR.
  - [`apps/server/src/modules/sync/clientSurvey.ts`](../../apps/server/src/modules/sync/clientSurvey.ts) — Phase 1 measurement counter.
  - [RFC 8594 — The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594).
  - [RFC 8288 — Web Linking](https://datatracker.ietf.org/doc/html/rfc8288).

---

## Context and Problem Statement

CloudSync v1 (`/api/sync/*`) — last-write-wins blob-sync, що зберігає весь
module state у `module_data` колонці (див. [ADR-0004](./0004-cloudsync-lww-conflict-resolution.md)).
v1 живе у production з 2024 року і має фундаментальні обмеження:

1. **Нема per-row resolution**: будь-яка зміна одного запису перезаписує весь
   blob модуля → втрата concurrent edit-ів між девайсами.
2. **Payload зростає лінійно з історією**: типовий `routine` blob → 200kb на
   активного юзера за 6 місяців; ми б'ємось у `MAX_BLOB_SIZE = 5MB` ліміт.
3. **Нема per-op auditability**: `sync_audit_log` фіксує лише факт push/pull,
   а НЕ що саме змінилось всередині blob-у.

CloudSync v2 (`/api/v2/sync/*`, Stage 2 / PR #021) розв'язує це через
op-log: per-row insert/update/delete з idempotency-key. v1 і v2 живуть
паралельно у `sync_op_log` таблиці (migrations 023, 027) з 2026-Q1.

**Проблема, яку розв'язує цей ADR**: ми хочемо вивести v1 з production без
ламання застарілих клієнтів. Hard-cutoff (один день — 410 Gone) ламне всі
TestFlight-білди і outdated PWA-кеші → support-incident. Soft-cutoff без
deprecation-сигналів → клієнти не знають, що мають мігрувати.

## Considered Options

1. **One-shot 410 Gone на T₀ без warning-period** — мінімум інженерної
   роботи, максимум ризику breakage. Відкинуто.

2. **Soft-deprecation через release-notes без HTTP-sсигналів** — клієнти не
   моніторять GitHub releases; mobile-app з offline-кешем не побачить
   release notes. Відкинуто.

3. **RFC 8594 `Sunset:` + `Deprecation:` headers + RFC 8288 `Link:` з
   `successor-version` і `deprecation` rel-ами**, з 6-фазним rollout-ом,
   gated на survey-counter і feature-flag-ах — стандартний deprecation
   контракт для public-facing API. Це і обираємо.

4. **API versioning через query-param `?api=v1`** — не вирішує проблему
   sunset-у, тільки дублює namespace. Не applicable.

## Decision

**Прийнято Option 3.** CloudSync v1 sunset-имо за 6-фазним планом
(специфікація — [Initiative 0003](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md)):

| Phase | Тривалість          | Що робимо                                                                                    |
| ----- | ------------------- | -------------------------------------------------------------------------------------------- |
| 1     | T₀ − 4 тижні        | Survey-counter `sync_v1_legacy_clients_total` — хто ще ходить у v1.                          |
| 2     | T₀ − 4 тижні        | **Цей ADR.** RFC 8594 `Sunset:` + `Deprecation: true` + `Link:` rel headers на v1 routes.    |
| 3     | T₀ − 3 тижні        | `cloudSyncMode` feature-flag (`v1` / `dual` / `v2`); shadow-mode пише обидва канали.         |
| 4     | T₀ − 2 тижні        | Backfill `module_data` → `sync_op_log` idempotent script, run на active users (≤90 днів).    |
| 5     | T₀ − 1 тиждень → T₀ | Force-update PWA / mobile-app до `cloudSyncMode = "v2"`. Push notification.                  |
| 6     | T₀ → T₀ + 30 днів   | v1 PUT/POST → 410 Gone з JSON-успадкуванням; v1 GET → read-only 30 днів; потім DROP колонки. |

T₀ (specific calendar date) **не зафіксована в цьому ADR** і буде
amend-нута document-update-ом коли:

- Phase 1 survey-counter покаже `sli:sync_v1:rate5m` < 5% від total
  sync-traffic протягом 7 поспіль днів.
- Phase 4 backfill завершено для всіх active-users і dry-run діє ідемпотентно
  на 100 нових run-ах (CI regression).

**HTTP semantic specification (Phase 2 — це те, що тут):**

На всіх `/api/sync/*` routes (v1) middleware
[`v1SunsetHeadersMiddleware`](../../apps/server/src/modules/sync/sunsetHeaders.ts) додає:

- `Deprecation: true` — RFC 8594 §2 (always; не залежить від T₀).
- `Sunset: <RFC 7231 IMF-fixdate>` — RFC 8594 §3 (only when env var
  `CLOUDSYNC_V1_SUNSET_AT` set до valid ISO 8601 date).
- `Link: </api/v2/sync/push>; rel="successor-version", </docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md>; rel="deprecation"`
  — RFC 8288 §3 (always).

На `/api/v2/sync/*` (v2) — **жодного** з цих headers. v2 — successor.

**Rationale за окремі design-choices:**

- **`Deprecation: true` (string), не date** — RFC 8594 §2.1.2 дозволяє і "true",
  і HTTP-date. Ми обираємо "true" бо deprecation-effect-date = "now"
  (з моменту деплою цього PR), а `Sunset:` окремо несе T₀.

- **Origin-relative URI у `Link:` headers** — RFC 8288 §3.1 дозволяє і
  absolute-URI, і origin-relative. Ми обираємо relative бо `api.sergeant.app`
  vs `sergeant.vercel.app` vs internal Railway-host — multi-host environment.
  Клієнт сам розгорне відносно Origin response-у.

- **`CLOUDSYNC_V1_SUNSET_AT` як env var, а не code-constant** — дозволяє
  amend-ити T₀ без code-PR-у; rolling redeploy через Railway. Validation:
  malformed value → header не set + log.warn один раз (cached).

## Rationale

**Чому RFC 8594 + RFC 8288, а не просто `X-Deprecation` custom-header**:
RFC-стандарти підтримуються тулзами (Postman, curl-based monitoring,
Datadog API analytics). Custom-header потребує клієнтського коду на
detection. RFC 8594 RFC-status — Standards Track (March 2019).

**Чому 6-фазний rollout, а не 3-фазний**: на v1 сидять **mobile-shell** клієнти
(Capacitor PWA wrapper), які мають offline-кеш. Без push-update (Phase 5)
вони побачать 410 Gone тільки після наступного релогіну → support-stress.
Phase 1-4 дають нам data, щоб Phase 5 push був адресним.

**Чому 30-day read-only window після T₀** (Phase 6): user-recovery-кейс. Якщо
юзер відсутній 28 днів і повертається на застарілу версію — він зможе
прочитати свої v1 дані (read-only 410 для PUT), отримати notification про
update, оновитися, і v2 backfill підхопить його. 30 днів — компроміс:
Phase 6 backup `pg_dump module_data` робиться у T₀ + 30, після цього
DROP COLUMN — point-of-no-return.

## Consequences

### Positive

- **Чистий deprecation-контракт**: клієнти, що моніторять `Deprecation:`
  header (наприклад, Datadog API analytics) автоматично побачать це
  без code-change на нашому боці.
- **Soft-rollout**: жоден client не ламається на Phase 2 деплої; ми просто
  отримуємо measurement-сигнал і "оголошення наміру".
- **`Link:` rel="successor-version"** автоматично читається API-developer-tool-ами
  (e.g. Hoppscotch) → зменшує нашу documentation-debt.
- **Reversible до Phase 5**: будь-яку фазу 2-4 ми можемо rollback окремим PR
  без впливу на існуючі клієнти.

### Negative

- **3 додаткових HTTP headers per v1 request**: Deprecation (5 байт),
  Link (~110 байт), Sunset (~30 байт). Загалом ~145 байт overhead per response.
  На 30 req/min × 200 active-users = ~10MB/day extra egress. Acceptable.
- **`CLOUDSYNC_V1_SUNSET_AT` як env-controlled date** — risk: SRE може
  перетягнути T₀ нечесно (e.g. на короткий strix). Mitigation: env-change
  логіть через Railway audit trail; amend ADR document коли committed.
- **6 фаз = 6 PR-ів** — operational-cost. Acceptable: кожна фаза має
  окремий blast-radius, окремий CI-cycle.

### Neutral

- v2 routes (`/api/v2/sync/*`) — без жодних змін; middleware mount-нутий
  тільки на `/api/sync` namespace.
- `sync_operations_total` Prom counter — без змін; survey-counter
  (`sync_v1_legacy_clients_total`) вже доданий у Phase 1 (PR #1621).
- ADR-0004 (LWW conflict resolution) лишається Accepted — він описує
  algorithmic choice для v1, що активний до Phase 6 cleanup.

## Compliance

- **CI**: тест `apps/server/src/modules/sync/sunsetHeaders.test.ts` фіксує
  emission всіх трьох headers (Deprecation always, Link always, Sunset
  only when env-set).
- **Manual review**: на ADR-graph-check-у (`pnpm lint:adr-graph`) перевіряємо
  що цей ADR посилається на 0004 (Supersedes-relation hint, хоч і не
  Supersedes).
- **Operational**: на Phase 5 (T₀-cutoff) команда валідує через Grafana
  dashboard `sync.json` panel-и 6/7/8 (PR #1621), що `sli:sync_v1:rate5m`
  стабільно <5% протягом тижня **до того**, як міняти v1 PUT/POST на 410.

## Links

- [RFC 8594 — The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594)
- [RFC 8288 — Web Linking](https://datatracker.ietf.org/doc/html/rfc8288)
- [Apigee deprecation pattern](https://cloud.google.com/apigee/docs/api-platform/develop/deprecation-policy) — industry reference
- [Stripe API versioning model](https://stripe.com/docs/api/versioning) — alternative approach (versioned URL paths) — НЕ обрано, бо v2 уже на окремому prefix.
