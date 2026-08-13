# Theme 1 — Kyiv timezone discipline

> **Last touched:** 2026-08-04 by @claude (звірено з ADR-0078: правило більше не вимагає Kyiv для межі особистої доби). **Next review:** 2027-02-10.
> **Status:** Active

## Одне правило межі доби

**Особистий день — за пристроєм. Київ — для відображення, звітів і серверних
періодів.** Це рішення [ADR-0078](../../adr/0078-day-boundary-device-local.md),
воно ратифіковане й не обговорюється в цьому файлі.

| Що рахуємо                                                                         | Чим                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| «Сьогодні» для відмітки звички, логу їжі, денного запису, стріка, денного агрегату | **годинник пристрою** в момент дії                         |
| Відображення часу в UI (мітка «о 20:14», підпис дати)                              | **Europe/Kyiv**                                            |
| Серверні операційні звіти, фінансові періоди (місяць витрат, платіжний цикл)       | **Europe/Kyiv**                                            |
| Тиждень (`weekKey`)                                                                | понеділок ISO 8601 у тій же зоні, що й день цього конвеєра |

Кожна подія особистого журналу несе `tz_offset_minutes` — саме він дозволяє
серверу згорнути журнал у дні, не вгадуючи «сьогодні» користувача.

## Що забороняє ESLint-правило

У `apps/web/**` `sergeant-design/prefer-kyiv-time` (severity `warn`) позначає
читання host-local частин `Date`:

- `getFullYear()` / `getMonth()` / `getDate()` / `getDay()`
- `getHours()` / `getMinutes()` / `getSeconds()`

**Правило не означає «тут має бути Київ».** Після ADR-0078 воно означає інше:
_у цьому місці межа доби вибирається явно, а не випадково_. Голий host-getter
не показує, чи автор свідомо хотів пристрій, чи просто написав найкоротший
код — а обидві доктрини чинні. Тому кожен такий сайт закривається одним із
двох способів, і обидва легітимні.

## Спосіб 1 — Київ (відображення, звіти, фінансові періоди)

```ts
import {
  getKyivDateParts,
  getKyivDayKey,
  isSameKyivDay,
} from "@shared/lib/time/kyivTime";

const { day, month, hour, minute } = getKyivDateParts(createdAt); // підпис у UI
const dayKey = getKyivDayKey(new Date()); // серверний звіт, фін. період
const isToday = isSameKyivDay(timestamp);
```

Для ISO-тижня з понеділка канонічний патерн — `getKyivWeekStartKey()`
(`apps/web/src/shared/lib/time/kyivTime.ts`, споживач — `apps/web/src/pages/strategy/StrategyPage.tsx`);
серверний аналог — `kyivMondayStartMs()` у `packages/shared/src/utils/date.ts`. Обидва
будуються на `Intl.DateTimeFormat` із `timeZone: "Europe/Kyiv"` і вважаються compliant.

## Спосіб 2 — пристрій (особистий день) із явним suppress

Device-local — **не борг і не виняток**, а канон для особистої доби. Але він
має бути помічений, щоб наступний читач не «полагодив» його назад у Київ:

```ts
/* eslint-disable sergeant-design/prefer-kyiv-time --
   ADR-0078: день належить ПРИСТРОЮ, не Києву. Київський day-key приписав би
   «учорашній» показ мандрівнику, який читає пораду о 20:00 за місцевим часом. */
function deviceDayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
/* eslint-enable sergeant-design/prefer-kyiv-time */
```

Еталон формулювання — `deviceDayKey` у
[`apps/web/src/core/observability/adviceTelemetry.ts`](../../../../apps/web/src/core/observability/adviceTelemetry.ts).
У спільному коді, де це доречно, бери готове `dateKeyFromDate` з
[`packages/routine-domain/src/dateKeys.ts`](../../../../packages/routine-domain/src/dateKeys.ts) —
device-local там ратифіковано ADR-0078, а не залатано.

**Що НЕ треба писати в suppress:** «pre-existing burndown», «out of scope»,
«tracked in tech-debt». Такий коментар нічого не каже про доктрину. Пиши, чому
саме тут доба належить пристрою (або чому це взагалі не межа доби —
косметичний час, календарна арифметика над уже прив'язаним ключем,
sub-хвилинний таймер).

## Allowlist (rule-level skip)

- **Сам хелпер** — `apps/web/src/shared/lib/time/kyivTime.ts`.
- **Серверний код** — `apps/server/**`: UTC на межі, Київ на презентації.
- **Тести** — `*.test.{ts,tsx,js}`: `vi.setSystemTime` + асерти на getter-и.

## Статус правила (замість колишнього severity-ramp)

Правило лишається **`warn` назавжди** і НЕ буде промотоване в `error`.
Промоція мала сенс, поки метою був нуль host-getter-ів; після ADR-0078 частина
сайтів device-local **правильні**, тож `error` карав би за канон. Цілі
міграції тепер дві:

1. Жодного **голого** host-getter-а без suppress — кожен сайт декларує доктрину.
2. Жодного suppress із порожнім «pre-existing/out-of-scope» WHY — переписати на
   змістовний, коли той файл наступного разу відкриють.

Відкритий залишок доктрини (HubChat-контекст рахує особистий день за Києвом,
поки дайджест і Hub-Reports — за пристроєм) описано в
[`metric-registry.md § Часовий шов`](../../../02-engineering/architecture/metric-registry.md).

## Cross-refs

- [ADR-0078](../../adr/0078-day-boundary-device-local.md) — межа доби за пристроєм (рішення)
- [`docs/02-engineering/architecture/domain-invariants.md`](../../../02-engineering/architecture/domain-invariants.md) — інваріанти часу після ADR-0078
- [`apps/web/src/shared/lib/time/kyivTime.ts`](../../../../apps/web/src/shared/lib/time/kyivTime.ts) — реалізація Kyiv-хелперів
- [`docs/90-work/audits/2026-05-13-page-audit-03-hub-chat-search.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-13-page-audit-03-hub-chat-search.md) F1/F2/F8 — перший кластер порушень, що породив правило
- [`docs/90-work/audits/2026-05-13-page-audit-09-routine-strategy.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-13-page-audit-09-routine-strategy.md) F3 — кластер `setHours(12,…)` у Routine
