# PR-08: API versioning consolidation (видалити v1-rewrite-shim)

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Closed — research done, decision = keep mirror (див. [ADR-0053](../../adr/0053-api-versioning-policy.md) + [spike](../../notes/spikes/2026-05-api-v1-usage.md))

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| **Severity** | High (H2)                                                             |
| **Owner**    | TBD                                                                   |
| **Effort**   | 0.5 дня                                                               |
| **Risk**     | Medium (видалення shim-а може вплинути на mobile-shell старих версій) |
| **Touches**  | `apps/server/src/app.ts`, OpenAPI spec, mobile API-клієнт             |

## Контекст

```ts
// apps/server/src/app.ts:41–53 (приблизно)
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/v1/")) {
    req.url = req.url.replace("/api/v1/", "/api/");
  }
  next();
});
```

Цей shim:

- Existed «just in case» — клієнти ніколи не вказували `/v1/`. **Спростовано:** усі активні клієнти за замовчуванням ходять у `/api/v1/*` (web, mobile, mobile-shell, `@sergeant/api-client`).
- Стійкий до видалення: якщо мобільний клієнт відправляє `/v1/`, він autonomously redirected без awareness-у.
- Робить **версіонування ілюзорним**: `/api/v2/` ніколи не зможе існувати окремо, бо немає роутингу що це різні layers.

Якщо api-versioning потрібно — слід використати proper `Accept: application/vnd.sergeant.v2+json` header або path-based з реальним routing-divergence. Якщо не потрібно — видалити shim.

**Update 2026-05-06 (research-фаза):** видалити shim сьогодні неможливо без breaking change для mobile. Decision зафіксовано в [ADR-0053](../../adr/0053-api-versioning-policy.md): mirror лишається до моменту або (a) реального `v2`-split-у, або (b) завершення mobile beta-rollout-у. Подальша implementation-фаза цього PR-а **не потрібна**.

## Scope

### Decision першочергово (research, не цей PR)

- Перевірити логи Vercel/Railway за останні 30 днів: чи є **будь-які** запити з `/api/v1/`?
  - Якщо ні (probable): просто видалити shim.
  - Якщо так (mobile-shell старих versions): додати explicit deprecation-header `Sunset:` з датою sunset, тримати shim 90 днів, потім видалити.

### Implementation (after decision)

- Видалити middleware (lines 41–53).
- Оновити OpenAPI spec (`apps/server/openapi.yaml` if exists) — переконатись, що тільки `/api/...` paths.
- Якщо клієнти на v1 знайдені:
  - Sentry breadcrumb на кожному `/api/v1/` request з `tag: deprecated_v1_path`.
  - Email-notification до mobile-team з вимогою upgrade.
  - У `apps/mobile-shell/Info.plist` додати `MIN_API_PATH_VERSION=v2` (якщо ще немає).

## Out of scope

- Real API-versioning strategy (це окремий ADR, якщо потрібен v2 у майбутньому).

## Acceptance criteria (DoD)

- [x] Research report — у [`docs/notes/spikes/2026-05-api-v1-usage.md`](../../notes/spikes/2026-05-api-v1-usage.md). Code-grep evidence показує, що клієнти за замовчуванням використовують `/api/v1/*`; Vercel-логи самі по собі недостатні (API живе на `api.sergeant.app`, не на Vercel).
- [x] Decision зафіксовано в [ADR-0053 «API versioning policy»](../../adr/0053-api-versioning-policy.md) (раніше планувалось як ADR-0044, але цей номер уже зайнято Renovate-ом).
- [ ] ~~Якщо usage > 0 → 90-day deprecation plan з `Sunset:` header.~~ (Не потрібно — decision = keep mirror.)
- [ ] ~~Якщо usage == 0 → shim видалений, OpenAPI clean.~~ (Не потрібно — clients use `/v1`.)
- [ ] ~~Тест: `GET /api/v1/health` повертає 404 (after removal).~~ (Не потрібно.)
- [ ] (Future) Sentry-breadcrumb у `apiVersionRewrite`, коли треба кількісно міряти долю `/api/v1/*` traffic перед фіналом legacy `/api/*` removal.

## Тести

- `apps/server/src/__tests__/api-versioning.test.ts` — `/api/v1/health` → 404 (після видалення) або `200` з `Sunset:` header (під час deprecation).

## Rollout

- 1 PR на decision (research). 1 PR на implementation. Якщо deprecation — 3-й PR на final removal через 90 днів.

## Risks & mitigations

| Risk                                     | Mitigation                                           |
| ---------------------------------------- | ---------------------------------------------------- |
| Старі mobile-shell-и зламаються          | 90-day grace + monitoring + force-upgrade dialog     |
| Видаляли shim — потім виявили v1-traffic | Шukати тільки після log-analysis + Sentry monitoring |

## Touchpoints (file:line)

- `apps/server/src/app.ts:43-55` (`apiVersionRewrite` — лишається)
- `apps/mobile-shell/` — config-check
- [`docs/adr/0053-api-versioning-policy.md`](../../adr/0053-api-versioning-policy.md) — створено
- [`docs/notes/spikes/2026-05-api-v1-usage.md`](../../notes/spikes/2026-05-api-v1-usage.md) — research note

## Refs

- [HTTP `Sunset` header RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594)
- Stripe API versioning model
