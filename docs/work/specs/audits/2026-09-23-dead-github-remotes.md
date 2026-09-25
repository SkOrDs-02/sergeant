# Аудит мертвих GitHub-remote · 2026-09-23

> **Last touched:** 2026-09-25 by @Skords-01. **Next review:** 2027-09-27.
> **Status:** Active - архівний пуш не зроблено, чекає рішення власника.

- **Питання:** що саме лежить у локальних remote `oldgh` і `deadgh-zaebal`, чи є там робота, якої немає більше ніде, і чи безпечно їх чіпати.
- **База:** клон `D:\Sergeant`, порівняння з `hetzner/main@444466f7` (це `bitbucket/main` мінус 3 коміти плюмбінгу від 2026-09-22/23, на класифікацію вони не впливають).
- **Дата прогону:** 23.09.2026
- **Повний перелік:** [`2026-09-23-dead-remotes-inventory.tsv`](./2026-09-23-dead-remotes-inventory.tsv), 753 рядки.
- **Попередник:** [`2026-08-05-lost-commits-audit.md`](./2026-08-05-lost-commits-audit.md) - той самий клас питання, але по живому на той момент GitHub і по 416 гілках.

---

## 1 · Головне

Тріаж тут не потрібен, і це найкорисніший результат прогону. **Увесь архів усіх 547 не-предків важить 9.5 MB**: `git pack-objects` поверх `hetzner/main` дає 12 012 об'єктів і 9 917 863 байти. Вибирати, які з пів тисячі гілок заслуговують збереження, коштує дорожче за саме рішення, а кожна помилка вибору незворотна. Дешевше зберегти все.

Ці об'єкти існують лише в локальному `.git` на диску `D:`. На GitHub їх не дістати (акаунти заблоковані), у дзеркалі на Hetzner і на Bitbucket їх немає, крім десяти збігів із §6.

`AGENTS.md § Де живе код` окремо забороняє видаляти ці remote. Архівація не скасовує ту заборону, вона знімає причину хвилюватись: поки refs лише локальні, перевстановка системи або `git gc --prune` після видалення remote втрачає їх назавжди.

## 2 · Що всередині (753 refs)

| Категорія            | К-сть | Що це                                                       |
| -------------------- | ----: | ----------------------------------------------------------- |
| A · у історії `main` |   204 | предки `hetzner/main`                                       |
| B · вміст у `main`   |     7 | не предок, але дерево збігається                            |
| C · squash-merge     |   268 | усі теми комітів є в історії `main`                         |
| D · бот backlink-ів  |    89 | `docs(docs): backlinks for #N`, посилання на мертвий GitHub |
| E · dependabot       |    32 | бампи залежностей, застарілі                                |
| F · унікальний код   |    26 | незмерджена робота в `apps/**`, `packages/**`, `scripts/**` |
| G · лише доки        |    78 | правки доків, вердикт недостовірний (див. §4)               |
| H · нічого свого     |    49 | після відсіву змін `main` не лишається нічого               |

Жодного ref виду `refs/remotes/*/pull/*` немає, тегів теж немає. Припущення, що значну частину складають GitHub PR-refs, не підтвердилось: 433 з 731 у `oldgh` це `claude/*`, ще 95 `docs/*` і 89 `cursor/*`.

Squash-мерджі справді були масовими: 268 гілок не є предками `main`, хоча їхня робота там.

## 3 · Дві пастки методу

Перший підхід дав 542 «унікальні» гілки. Обидві причини завищення варто знати наперед, бо вони повторяться при наступному такому прогоні.

**Squash не ловиться трикрапкою.** `git diff main...<ref>` рахує від merge-base, а merge-base при squash лишається точкою розгалуження. Тому діф показує зміни гілки навіть тоді, коли вони давно в `main`. Робочий тест інший: `git diff main <ref> -- <файли, які гілка чіпала>`.

**Перейменування дерева доків.** Комітом `e78fdc4e6b` від 2026-09-06 доки переїхали: `docs/00-start/` у `docs/start/`, `docs/01-product/` у `docs/product/` і так далі. Порівняння за шляхом бачить старі шляхи як відсутні в `main`, тож кожна гілка старша за вересень виглядає унікальною. Саме це давало 104 хибні спрацювання; після відсіву доків лишилось 26.

## 4 · Чого цей аудит не знає

Для категорії G чесна відповідь - **невідомо**. Доки змінюються безперервно, тож розбіжність вмісту між липневою гілкою і сьогоднішнім `main` не доводить ні що правка загубилась, ні що приземлилась. Звірка за іменем файлу (в обхід перейменування) дала 66 із 78 з розбіжностями, і це число нічого не вирішує. Повний архів робить питання безпредметним, тому далі його не копали.

## 5 · Категорія F: гілки з реально унікальним кодом

Числа в першій колонці - кількість файлів під `apps/**`, `packages/**`, `scripts/**`, яких `main` не чіпав від точки розгалуження і вміст яких відрізняється.

| Файлів | Дата       | Гілка                                                  | Що там                                                     |
| -----: | ---------- | ------------------------------------------------------ | ---------------------------------------------------------- |
|     17 | 2026-07-10 | `oldgh/cursor/web-coverage-wave18-core-hub-ab0a`       | тести покриття core hub і settings                         |
|     13 | 2026-07-10 | `oldgh/cursor/web-coverage-wave20-nutrition-ab0a`      | тести покриття nutrition                                   |
|      8 | 2026-07-10 | `oldgh/cursor/web-coverage-wave19-finyk-ab0a`          | тести покриття finyk                                       |
|      5 | 2026-07-10 | `oldgh/CMP-74`                                         | `TrialDay7Paywall.tsx` плюс A/B-прапорець                  |
|      4 | 2026-08-08 | `oldgh/claude/product-economics-e2vkvu`                | `scripts/economics/*`                                      |
|      4 | 2026-08-27 | `oldgh/claude/multiple-categories-single-limit-xdewxe` | `htmlTableGrid.ts` (див. нижче)                            |
|      4 | 2026-08-06 | `oldgh/claude/models-economics-analysis-z8n56d`        | `apps/server/scripts/econ/*`                               |
|      4 | 2026-08-02 | `oldgh/claude/sergeant-persona-and-proactive-push`     | `sergeantNudge.ts`, міграція `094_sergeant_proactive_push` |
|      4 | 2026-08-02 | `oldgh/claude/mechanical-ui-and-push-fixes`            | те саме, інша гілка                                        |
|      3 | 2026-09-01 | `oldgh/claude/app-access-gate`                         | `accessGate.ts` у web (див. нижче)                         |
|      3 | 2026-07-10 | `oldgh/cursor/web-coverage-wave21-fizruk-routine-ab0a` | тести routine                                              |
|      2 | 2026-07-20 | `oldgh/claude/eager-tharp-e24a44`                      | `ai-memory/invocation-audit.ts`                            |
|      2 | 2026-08-25 | `oldgh/claude/msp-silpo-spec-experiment-vipt1a`        | `SilpoPantryReplenishEntry.tsx`                            |
|      2 | 2026-08-18 | `oldgh/claude/receipt-scan-impl`                       | `importCsv.ts`                                             |
|      2 | 2026-08-02 | `oldgh/claude/backlog-waves-queue-jkvuep`              | міграція `096_fizruk_injuries` (див. нижче)                |
|      2 | 2026-07-22 | `oldgh/claude/sergeant-anonymous-persistence-33b5da`   | `useHubChatStorageBoot.ts`                                 |
|      2 | 2026-07-22 | `oldgh/claude/hubchat-routine-dualwrite-registration`  | те саме, мердж-гілка                                       |
|      2 | 2026-06-29 | `oldgh/spike/pro-monthly-cap`                          | міграція `077_ai_usage_daily_monthly_bucket` (див. нижче)  |
|      1 | 2026-07-29 | `oldgh/codex/docs-00-05-drift`                         | `apps/landing/symbols.json`                                |
|      1 | 2026-08-02 | `oldgh/claude/fizkult-module-brainstorm-6772e4`        | `injuryRepository.ts`                                      |
|      1 | 2026-08-02 | `oldgh/claude/docs-tasks-cleanup-fcfeef`               | `finyk/route.test.tsx`                                     |
|      1 | 2026-08-01 | `oldgh/claude/docs-cleanup-994e82`                     | `tests/a11y/low-vision.spec.ts`                            |
|      1 | 2026-08-30 | `oldgh/claude/pantry-generic-names-spec`               | квадратичність у `nutrition-domain`                        |
|      1 | 2026-09-14 | `deadgh-zaebal/codex/fix-nutrition-pantry-smoke`       | smoke комори                                               |
|      1 | 2026-07-21 | `oldgh/cursor/cov-mobile-core-smoke-2103`              | `settings-search-smoke.spec.ts`                            |
|      1 | 2026-07-27 | `oldgh/v0/product-design-optimization-ed8a944d`        | `TransactionAmountFilter.tsx`                              |

**Три з них перевірено вручну, і це НЕ втрачена робота, а покинуті підходи:**

- `spike/pro-monthly-cap` несе міграцію `077_ai_usage_daily_monthly_bucket`, а в `main` під номером 077 стоїть `077_ai_usage_daily_pro_tier_buckets`. Ідея приземлилась інакше, номер зайнятий, `main` уже на 146.
- `multiple-categories-single-limit-xdewxe` чіпає `htmlTableGrid.ts`, який у `main` переїхав у `packages/tabular-import/`. Робота в `main`, просто в іншому пакеті.
- `app-access-gate` має `apps/web/src/shared/lib/auth/accessGate.ts`, а `main` реалізував гейт серверно: `apps/server/src/auth/accessGate.ts`.

Те саме стосується `backlog-waves-queue-jkvuep`: його `096_fizruk_injuries` конфліктує з `096_finyk_fizruk_pk_text` у `main`, а сам коміт названий «content for the 096_fizruk_injuries revert».

Тобто навіть усередині категорії F частина це покинуті гілки, а не втрата. Ще один аргумент архівувати гуртом замість вирішувати поштучно.

## 6 · Що вже врятовано

Десять гілок уже лежать на Bitbucket з тим самим tip-SHA, тож архівувати треба **537**, не 547:

`claude/analytics-research`, `claude/spec-keyboard-scroll`, `claude/design-cycle6-stage2`, `claude/migrate-owner-mentions`, `claude/app-access-gate`, `claude/day-hint-cache`, `claude/landing-promises-section`, `claude/product-knowledge-backlog`, `codex/repeatable-verification`, `codex/fix-nutrition-pantry-smoke`.

Гілка `claude/fizkult-module-brainstorm-6772e4` на Bitbucket є, але з іншим tip-SHA, тож у перелік збігів не входить.

## 7 · Процедура архівації

Не запускалась. Пушить не-предків під `archive/<remote>/<гілка>` пачками по 100.

```bash
cd /d/Sergeant
mapfile -t refs < <(git for-each-ref --format='%(refname)' \
  'refs/remotes/oldgh/**' 'refs/remotes/deadgh-zaebal/**' | grep -v '/HEAD$')
specs=()
for r in "${refs[@]}"; do
  short=${r#refs/remotes/}; remote=${short%%/*}; branch=${short#*/}
  git merge-base --is-ancestor "$r" bitbucket/main 2>/dev/null && continue
  specs+=("$r:refs/heads/archive/$remote/$branch")
done
echo "до пушу: ${#specs[@]}"
for ((i=0; i<${#specs[@]}; i+=100)); do git push bitbucket "${specs[@]:i:100}"; done
```

Після пушу звірити `git ls-remote bitbucket 'refs/heads/archive/*' | wc -l` з очікуваним числом. **До цього моменту `git gc --prune` не запускати**: саме remote-refs утримують ці об'єкти від збирання сміття.

Видалення самих remote лишається забороненим (`AGENTS.md § Де живе код`) незалежно від архівації.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                   | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| [#13](https://bitbucket.org/skords01/sergeant/pull-requests/13) | docs(agents): вирівняти governance з фактом після переїзду на Bitbucket | 2026-09-23 |
| [#6](https://bitbucket.org/skords01/sergeant/pull-requests/6)   | docs(docs): аудит мертвих GitHub-remote і вартість повного архіву       | 2026-09-22 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
