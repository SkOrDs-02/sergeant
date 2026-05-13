# What's New — release notes content

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Це **джерело істини** для in-product «Що нового» модала
(`<WhatsNewModal />` у `apps/web/src/core/whatsNew/`). Кожен запис тут =
один modal-show у користувача, який ще не бачив цей реліз.

> **PR-18** з [FTUX master tracker](../launch/product-os/ftux-master-tracker.md)
> §3.3. Метрика — `d7_returning_user_engagement_with_whats_new ≥ 30%`
> (відкрив modal AND клікнув по CTA / прочитав scroll-to-end за 7 днів
> від реліз-дати).

## Структура

```
docs/whats-new/
├── README.md                      # цей файл — формат + how-to
└── YYYY-MM-DD-<slug>.md           # один файл на реліз (історія, не
                                   # parsing target — див. нижче)
```

App-side **не парсить markdown** — він читає типізовану таблицю з
[`apps/web/src/core/whatsNew/releases.ts`](../../apps/web/src/core/whatsNew/releases.ts).
Markdown-файли тут — це довша версія з контекстом для команди / changelog
для зовнішніх читачів. Дві сторони мають збігатися (id, дата, заголовок,
list-of-items) — drift ловиться у tests `releases.test.ts`.

## Як додати новий реліз

1. **Створи markdown** `docs/whats-new/YYYY-MM-DD-<slug>.md` за шаблоном
   нижче. `<slug>` = коротка kebab-case-назва (`cold-start`, `mobile-parity`,
   `paywall-launch`).
2. **Додай TS-запис** у `apps/web/src/core/whatsNew/releases.ts`:
   ```ts
   export const RELEASES: readonly WhatsNewRelease[] = [
     {
       id: "2026-05-06-cold-start", // має співпадати з file-stem
       date: "2026-05-06",
       title: "Холодний старт без порожнього дашборду",
       summary: "Wave 1 онбордингу: outcome card + reset of...",
       items: [
         { kind: "feature", text: "..." },
         { kind: "fix", text: "..." },
       ],
       cta: { label: "Спробувати", href: "/?tour=cold-start" },
     },
     // ↓ старі записи — внизу.
   ];
   ```
   `id` — це **сортовний** ключ; modal показує найсвіжіший запис, якого
   юзер ще не бачив (`localStorage["sergeant.whatsNew.lastSeenId"]`).
3. **Запусти tests** — `releases.test.ts` валідовує:
   - `id` унікальні + парсяться як ISO date,
   - кожен item у `items[]` має `kind` ∈ `feature | fix | improvement`,
   - markdown-файл `docs/whats-new/{id}.md` існує (drift gate),
   - `RELEASES` відсортовано від нового до старого.
4. **Не редагуй старі записи.** Користувачі вже їх бачили — зміна `title` /
   `items[]` створює дискрепанс «modal vs PostHog event payload». Замість
   цього додай новий реліз з тегом `improvement`.

## Шаблон markdown

```md
# YYYY-MM-DD — <human-readable заголовок>

> **Modal id:** `YYYY-MM-DD-<slug>` —
> [`apps/web/src/core/whatsNew/releases.ts`](../../apps/web/src/core/whatsNew/releases.ts)

## TL;DR

Один абзац, що відповідає `summary` поля у TS — чим воно цінне для
повертаючогося юзера D1+.

## Items

- **Feature** — <text що співпадає з `items[].text` де `kind: "feature"`>
- **Fix** — ...
- **Improvement** — ...

## Чому

Контекст для команди: який audit-finding / sprint-item / feedback-loop
породив цей реліз. Лінкуй PR-и (`#NNNN`), audit-id-и (`M-XX`,
`8.1.<n>`), sprint-item-и (`S<phase>.<n>`).

## Метрики

- Що ми очікуємо побачити в PostHog 7 днів після реліза.
- Що б показало fail (rollback criterion).
```

## Аналітика

Modal автоматично шле три events через `trackEvent`:

- `whats_new_shown` — `{ id, version_index }` коли modal відкрито
  (auto-show при першому візиті після релізу).
- `whats_new_dismissed` — `{ id, via: "close" | "overlay" | "esc" }` коли
  юзер закрив без CTA.
- `whats_new_cta_clicked` — `{ id, href }` коли юзер натиснув CTA-кнопку.

Funnel у PostHog: `whats_new_shown → whats_new_cta_clicked` за 7 днів —
це і є `d7_returning_user_engagement_with_whats_new`. Pre-launch ціль
≥ 30% (PR-18 acceptance per FTUX master tracker §3.3).

## Чому не parsing-from-markdown

1. **Type safety.** TS-запис ловить друкарські помилки у CTA href,
   неправильні `kind`-теги, drift між `id` та порядком сортування —
   compile-time, не runtime.
2. **Bundle size.** Парсинг markdown у браузері = `unified` /
   `remark-parse` (~30 KB gzip) у головному бандлі або lazy-chunk при
   open. Ні те, ні інше не потрібно для 1-2 release-i на квартал.
3. **PostHog payload stability.** Зміна заголовку у markdown НЕ змінює
   PostHog event у production (`title` не входить у payload). Але якщо
   б ми парсили markdown, мовчазне переписування файлу могло б змінити
   `id` (file-stem) → splittened funnels. TS-таблиця — explicit edit.
4. **No SSR coupling.** Vite resolve-ить `releases.ts` як звичайний
   модуль; не треба вирішувати «де парсити, де серіалізувати».

> **Принцип.** Markdown тут — людський changelog (PR description fodder,
> blog post drafts, support FAQ). TS-запис — те, що бачить продукт.
