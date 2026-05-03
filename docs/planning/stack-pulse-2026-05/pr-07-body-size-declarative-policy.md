# PR-07: Declarative body-size policy

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                              |
| ------------ | -------------------------------------------- |
| **Severity** | High (H1)                                    |
| **Owner**    | TBD                                          |
| **Effort**   | 0.5 дня                                      |
| **Risk**     | Low                                          |
| **Touches**  | `apps/server/src/app.ts`, `routes/` mounting |

## Контекст

```ts
// apps/server/src/app.ts:119–155 (приблизно)
app.use("/api/photo", express.json({ limit: "10mb" }));
app.use("/api/import", express.json({ limit: "6mb" }));
app.use(express.json({ limit: "128kb" })); // default
```

Express `body-parser` middleware **order-dependent**: те, що mount-нуто **першим**, виграє. Якщо хтось пере-port-ує routes у нову папку і випадково помістить default-mount раніше за специфічні — `/api/photo` повертатиме `413` для будь-якого upload-а.

Сьогодні працює, але це footgun: один zero-думаний рефакторинг ламає все.

## Scope

- `apps/server/src/http/bodySizePolicy.ts` — declarative policy table:

```ts
export const BODY_SIZE_POLICY: ReadonlyArray<{
  pathPrefix: string;
  limit: string;
  reason: string;
}> = [
  {
    pathPrefix: "/api/photo",
    limit: "10mb",
    reason: "User photo upload (nutrition, fizruk)",
  },
  {
    pathPrefix: "/api/import",
    limit: "6mb",
    reason: "Bulk JSON import for migration",
  },
  {
    pathPrefix: "/api/",
    limit: "128kb",
    reason: "Default API body size; override per-route",
  },
];

export function applyBodySizePolicy(app: Express): void {
  // sort by specificity (longest prefix first), then mount
  for (const rule of [...BODY_SIZE_POLICY].sort(
    (a, b) => b.pathPrefix.length - a.pathPrefix.length,
  )) {
    app.use(rule.pathPrefix, express.json({ limit: rule.limit }));
  }
}
```

- Single call-site у `app.ts`: `applyBodySizePolicy(app)`.
- Unit-тест перевіряє actual `413`-поведінку для кожного prefix-а.

## Out of scope

- Розглянути chunked-upload / S3-presigned-URL для great-than-10mb (це окрема архітектура, не цей PR).

## Acceptance criteria (DoD)

- [ ] `BODY_SIZE_POLICY` як єдине джерело правди.
- [ ] `apps/server/src/app.ts` не містить inline `express.json({ limit })` поза `applyBodySizePolicy`.
- [ ] ESLint-rule (custom або grep-CI) забороняє `express.json({ limit:` поза `bodySizePolicy.ts`.
- [ ] Тест перевіряє: `/api/photo` приймає 9.9mb (200), не приймає 11mb (413); `/api/users` не приймає 200kb (413).

## Тести

- `apps/server/src/http/__tests__/bodySizePolicy.test.ts` — supertest для кожної rule.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                              | Mitigation                            |
| ------------------------------------------------- | ------------------------------------- |
| Ховане сортування може дати unexpected order      | Unit-тест перевіряє реальну поведінку |
| Хтось додасть нову route з власним `express.json` | ESLint-rule fail PR                   |

## Touchpoints (file:line)

- `apps/server/src/app.ts:119–155`
- `apps/server/src/http/bodySizePolicy.ts` — новий
- `eslint.config.js` — кастомне правило / grep
