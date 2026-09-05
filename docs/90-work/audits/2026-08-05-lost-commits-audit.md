# Аудит загублених комітів по гілках · 2026-08-05

> **Поточні статуси перенесених знахідок:** [єдиний реєстр верифікації](verification/findings.json). Цей документ зберігає історичні результати; нові спроби та виправлення ведуться в реєстрі.

> **Last touched:** 2026-09-05 by @Skords-01. **Next review:** 2026-12-09.
> **Status:** Active — знахідки §3 відкриті; після їх закриття перевести у Reference.

- **Питання:** чи лишилися на гілках коміти або зміни, які загубилися або пішли поверх мерджу і не потрапили на `main`?
- **База:** `SkOrDs-02/sergeant`, `origin/main@44b2218`, 416 remote-гілок, 619 PR-записів (повна історія, un-shallow).
- **Дата прогону:** 05.08.2026

---

## 1 · Метод

Механічний прохід у чотири фільтри — щоб не сплутати «зміни немає в `main`» із «гілка просто застаріла».

1. **Ancestor-перевірка.** `git rev-list --left-right --count origin/main...<branch>` — гілки з `ahead == 0` уже в `main`.
2. **Squash-детекція.** Для решти будується синтетичний squash-коміт
   (`git commit-tree <branch>^{tree} -p <merge-base>`) і зіставляється з `main` через `git cherry`
   (patch-id). Це ловить squash-мерджі, які `git branch --merged` не бачить.
3. **Post-merge-детекція.** Якщо merge-base гілки **не** лежить на first-parent-ланцюгу `main`,
   значить частина гілки зайшла через merge-коміт, а решта комітів лягла **поверх** мерджу.
4. **Blob-level перевірка проти повної історії `main`.** Побудовано індекс усіх пар
   `(path, blob)`, що коли-небудь існували в `main` (42 001 пара, 10 528 шляхів, 40 406 blob-ів).
   Зміна вважається втраченою, тільки якщо її точного вмісту **ніколи** не було в `main` —
   це відсіює файли, які зайшли й пізніше були свідомо видалені або перейменовані.

Далі — звірка з PR-історією (state / `merged_at` / **base branch**) і ручна перевірка кожної
знахідки по суті.

### 1.1 Розподіл 416 гілок

| Стан                               | Гілок |
| ---------------------------------- | ----- |
| Уже в `main` (ancestor або squash) | 264   |
| Відкритий PR — робота в польоті    | 20    |
| Коміти поверх мерджу               | 17    |
| PR змерджено, але гілка попереду   | 45    |
| PR закрито без мерджу              | 2     |
| Жодного PR ніколи не існувало      | 68    |

Після blob-level фільтра **реальний вміст, якого ніколи не було в `main`, лишився на 49 гілках**.
З них 20 — відкриті PR і dependabot (нормально), 20 — гілки автоматизації `docs/pr-backlinks-*`
(§4), решта — знахідки нижче.

---

## 2 · Головна знахідка: PR #420 змерджено не в `main`

**Найсерйозніше з усього, що знайшлося.** Фікс втрати даних змерджено — і не доїхав до `main`.

- Гілка: `claude/hubchat-routine-dualwrite-registration`
- Коміт: `103f5438` — «fix(web): реєструвати routine dual-write у HubChat — запис із чату гинув»
- [PR #420](https://github.com/SkOrDs-02/sergeant/pull/420) — **merged** 2026-07-22T20:37:46Z

Причина — stacked PR, чия база так і не переїхала на `main`:

| PR   | base                                                        | merged_at                |
| ---- | ----------------------------------------------------------- | ------------------------ |
| #419 | `main`                                                      | 2026-07-22T20:37:**28**Z |
| #420 | `claude/sergeant-anonymous-persistence-33b5da` (гілка #419) | 2026-07-22T20:37:**46**Z |

#419 зайшов у `main` на **18 секунд раніше**, ніж #420 зайшов у гілку #419. GitHub переводить
базу stacked-PR на `main` при мерджі базового PR — тут цього не сталося (сам опис #420 на це
розраховував: «Мерджити після #419 (GitHub переведе базу на `main` автоматично)»). У результаті
#420 влився в уже мертву гілку, а `main` його не отримав.

**Перевірка по суті** — `main@44b2218`, `apps/web/src/core/hub/chat/useHubChatStorageBoot.ts`:

- імпорту `bootRoutineDualWrite` немає; викликається тільки `bootFinykDualWrite`;
- ідентичність усе ще через `useAuth`, а не `useLocalUserId`;
- `bootRoutineDualWrite` у `apps/web/src/core/hub/**` не викликається більше нізвідки —
  тільки в шелі модуля `/routine` (`useRoutineDualWriteBoot`).

**Наслідок у проді.** HubChat змонтований застосунково-широко через `HubChatOverlay` у
`RootLayout`, тож на Hub-root шел `/routine` не змонтований і dual-write-контексту немає.
`saveRoutineState` не має localStorage-фолбеку (Stage 8 PR #057r tombstone), тому
незареєстрований `triggerRoutineDualWrite` — **тихий no-op**: звичка, створена через chat-тул,
доходить до теплого кешу і гине на reload. Хук при цьому гріє routine **READ**-кеш — саме та
асиметрія, яку #420 і закривав. Дефект б'є і по залогінених, не лише по анонімах.

Обсяг: 2 файли, +71 / −13 (`useHubChatStorageBoot.ts` + `.test.ts`).

> `claude/sergeant-anonymous-persistence-33b5da` (#419) у зведенні показує ті самі два файли —
> це не окрема втрата: #420 влився саме в цю гілку, тому вона несе той самий коміт.

---

## 3 · Решта втраченого

### 3.1 Коміти поверх мерджу

**`claude/docs-cleanup-994e82`** — коміт `106b43d3` «fix(web): stop clipping nav and header labels
when text scales», зроблений 2026-08-01 **о 18:55**, тоді як [PR #562](https://github.com/SkOrDs-02/sergeant/pull/562)
змерджено о **14:10** того ж дня. Нового PR під нього не відкривали. Не в `main` (5 файлів, +173/−3):

- `HubHeader.tsx`, `HubBottomNav.tsx`, `ModuleBottomNav.tsx` — `leading-none` → `leading-tight`.
  У `main` усі три досі `leading-none`; при `overflow-hidden` рядковий бокс висотою рівно 1em
  зрізає кириличні нижні виносні елементи (`р`, `у`, `д`) — помітно вже на дефолтному масштабі,
  явно при 200% тексту.
- `low-vision.spec.ts` (165 рядків) у каталозі `apps/web/tests/a11y/` — у `main` відсутній;
  каталог містить `axe`, `ds-visual-qa`, `expanded-routes`, `reflow`, `sw-smoke`, але не
  `low-vision`. (Шлях навмисно не записаний повністю: `lint:governance-sync` трактує конкретні
  source-рефи як твердження про поточний код, а тут суть знахідки — що файлу немає.)
- `playwright.config.ts` — підняття таймауту, потрібне цьому спеку.

### 3.2 Гілки, які ніколи не мали PR

| Гілка                                            | Дата       | Що втрачено                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CMP-74`                                         | 2026-07-10 | `feat(web): trial_day7 paywall surface + A/B feature flag + i18n` — 11 файлів, **+754**. У `main` немає ні `TrialDay7Paywall.tsx`, ні `billing/featureFlags.ts`, ні growth-experiment-доку `01-paywall-day7-benefit-socialproof.md`            |
| `cursor/web-coverage-wave18-core-hub-ab0a`       | 2026-07-10 | 19 тест-файлів `*.branches.test.tsx` (core hub + settings)                                                                                                                                                                                     |
| `cursor/web-coverage-wave20-nutrition-ab0a`      | 2026-07-10 | 13 тест-файлів (nutrition components + hooks)                                                                                                                                                                                                  |
| `cursor/web-coverage-wave19-finyk-ab0a`          | 2026-07-10 | 8 тест-файлів (finyk lazy pages + hooks)                                                                                                                                                                                                       |
| `cursor/web-coverage-wave21-fizruk-routine-ab0a` | 2026-07-10 | 3 тест-файли (routine/fizruk shell)                                                                                                                                                                                                            |
| `spike/pro-monthly-cap`                          | 2026-06-29 | `feat(server): add monthly AI usage bucket` — міграція `077_ai_usage_daily_monthly_bucket`. **Номер 077 у `main` вже зайнятий** `077_ai_usage_daily_pro_tier_buckets`, тож гілка конфліктує з Hard Rule #4 і в поточному вигляді не застосовна |
| `claude/spec-fab-manual-income`                  | 2026-07-24 | спека `docs/90-work/planning/specs/fab-and-manual-income.md` — у `main` відсутня                                                                                                                                                               |

Разом по чотирьох coverage-хвилях — **43 тест-файли**, які ніколи не заходили в `main`
(конвенція `*.branches.test.*` у `main` жива — 41 такий файл, тобто інші хвилі зайшли, а ці чотири ні).

### 3.3 Закритий PR

**`chore/whats-new-2026-07-20`** — [PR #324](https://github.com/SkOrDs-02/sergeant/pull/324)
закрито без мерджу. `docs/01-product/whats-new/2026-07-20-phone-polish.md` (+53) і 29 рядків у
`apps/web/src/core/whatsNew/releases.ts` не заходили. У `main` `whats-new/` обривається на
`2026-06-26-summer-refresh.md`. Закриття могло бути свідомим — потребує рішення власника, а не
автоматичного відновлення.

---

## 4 · Клас: автоматизація `docs/pr-backlinks-*` не доїжджає

57 гілок, створених `github-actions[bot]` між 2026-07-10 і 2026-08-05. **Жодна не має PR.**
У 20 із них лежить контент, якого в `main` ніколи не було.

Причина — у самому воркфлоу `.github/workflows/pr-backlinks.yml`: він пушить гілку, потім
викликає `gh pr create`, і має явну обробку відмови:

```
::warning::gh pr create failed. The branch '<branch>' is pushed; open the PR manually.
::warning::To enable automatic PR creation: Settings → Actions → General →
           ✅ Allow GitHub Actions to create and approve pull requests
```

Відсутність PR у всіх 57 гілок означає, що `gh pr create` падає щоразу — прапорець
«Allow GitHub Actions to create and approve pull requests» у налаштуваннях репо вимкнений.
Наслідок: оновлення `docs/04-governance/pr-ledger/index.json` і `PR-BACKLINKS`-блоків
накопичуються на гілках замість `main`, що прямо підриває **Hard Rule #26**.

Це організаційний фікс (перемкнути прапорець), а не код: сам воркфлоу поводиться коректно.

---

## 5 · Хибні тривоги — перевірено, не втрачено

Щоб наступний прогін не піднімав їх знову:

- **`claude/sergeant-persona-and-proactive-push` (#571) і `claude/mechanical-ui-and-push-fixes` (#567)** —
  по 7 комітів поверх мерджу, серед них міграція `094_sergeant_proactive_push` і
  `lib/jobs/sergeantNudge.ts`. Роботу **передоставлено наново** в
  [PR #594](https://github.com/SkOrDs-02/sergeant/pull/594) (`5a4069cb`, 2026-08-03): у `main`
  це `100_sergeant_proactive_push.sql` і `lib/reminders/nudge.ts`. Реалізація в `main` свідомо
  краща — замість окремої `sergeant_push_log` перевикористано `push_reminder_log` (міграція 099)
  тієї ж форми. Гілки застарілі, не втрачені.
- **`codex/90-work-portfolio-audit` (#308) і `codex/july-execution-batch` (#309)** — по одному
  хвостовому діффу в `NutritionCard.test.tsx` (перевірка тултипа). Дрібниця, обидві гілки несуть
  той самий шматок.
- **Гілки з `missing_new` у `docs/**` після архівних переїздів** (`claude/active-projects-archive-_`,
  `codex/_`, `cursor/planning-docs-reconcile-\*`) — файли існували в `main` і були свідомо
  переміщені/видалені; blob-level фільтр їх зняв.
- **20 відкритих PR** (переважно dependabot) — робота в польоті.

---

## 6 · Обмеження методу

- Категорія «main і гілка розійшлися обидва» (`MOD_SUPERSEDED_OR_DRIFT`) не розрізняється
  механічно: якщо `main` після merge-base сам змінив той самий файл, неможливо автоматично
  сказати, чи зміна гілки була врахована. Усі знахідки §2–§3 перевірені вручну по суті;
  у «сірій зоні» лишаються дрібні дифи в часто редагованих файлах.
- Аудит дивиться тільки на remote-гілки. Незапушені локальні коміти на машинах розробників
  цим методом не видно.
- Порівняння — з `origin/main@44b2218` на 2026-08-05.

---

## 7 · Рекомендації

За спаданням пріоритету:

1. **Відновити #420** — портувати `103f5438` на свіжий `main` окремим PR. Це фікс тихої втрати
   даних користувача, він пройшов рев'ю і був змерджений; у `main` його просто немає.
2. **Перемкнути «Allow GitHub Actions to create and approve pull requests»** — інакше
   `pr-backlinks.yml` і далі копитиме гілки, а Hard Rule #26 лишатиметься формально порушеним.
   Після цього розібрати 20 гілок із незалитим вмістом (перегенерувати одним прогоном простіше,
   ніж мерджити 20 стейлових).
3. **Портувати `106b43d3`** (`claude/docs-cleanup-994e82`) — обрізання кириличних виносних
   елементів у трьох компонентах + a11y-спек `low-vision.spec.ts`.
4. **Вирішити долю `CMP-74`** — 754 рядки paywall/feature-flag-роботи без PR. Або відкрити PR,
   або свідомо закрити гілку, щоб вона не висіла невизначеною.
5. **Підняти 43 тест-файли** з чотирьох `cursor/web-coverage-wave*` — найдешевший приріст
   покриття з наявних (усі чотири гілки від 2026-07-10, конфлікти ймовірні, але це тести).
6. **`spike/pro-monthly-cap`** — перенумерувати міграцію (077 зайнято) або закрити спайк.
7. **Процес:** stacked PR — джерело саме цієї втрати. Перед мерджем базового PR
   переконуватись, що GitHub перевів базу залежного на `main`; після мерджа серії —
   звіряти `main` на наявність вершини стека.
