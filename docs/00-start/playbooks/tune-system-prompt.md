# Playbook: Tune System Prompt

> **Last touched:** 2026-08-30 by @Skords-01. **Next review:** 2026-12-20.
> **Status:** Active

**Trigger:** «AI відповідає не так як треба» / «Зміни тон асистента» / «Додай нову інструкцію в системний промпт» / зміна як модель розуміє контекст модулі.

## Owner surface

- Primary surface: `apps/server/src/modules/chat/toolDefs/systemPrompt.ts`
- Coupled surface: `apps/server/src/modules/chat/tools.ts`, prompt-cache budget
- Governing skill: `sergeant-module-ai`

---

## Контекст

System prompt для HubChat живе у `apps/server/src/modules/chat/toolDefs/systemPrompt.ts` як константа `SYSTEM_PREFIX`. Передається в Anthropic Messages API на кожен `/api/chat`, разом з `TOOLS` (визначення tool-ів).

**Чому це дороге:** system prompt прямо керує тим, **які tool-и викликає модель** і **як**. Маленька зміна тексту може:

- зламати tool-calling (модель перестає викликати `log_meal`, бо нова інструкція двозначна)
- збільшити cost (довший prompt = більше input tokens × всі юзери × всі messages)
- змінити tone у небажаний бік («стало занадто сухо», «надто перепрошує»)

Тому **завжди тестуй** перед мерджем, не редагуй наосліп.

---

## Steps

### 1. Прочитай поточний промпт повністю

```bash
cat apps/server/src/modules/chat/toolDefs/systemPrompt.ts
```

Зверни увагу на структуру: ввід/роль → інструкції по модулях → правила tool-calling → формат відповіді. Зміна найкраще лягає в **існуючу секцію**, а не як новий блок наприкінці.

### 2. Сформулюй зміну як **delta**

❌ Не «перепиши все, як ти вважаєш правильним».
✅ «У секції про Фінік замінити рядок X на Y» / «Додати після інструкції про tool-calling новий пункт N».

Чим точніше delta — тим менше шансів випадково задушити інший aspect.

### 3. Mini-eval перед запуском

Зроби список **3-5 канонічних запитів**, які мають викликати конкретний tool:

```
запит → очікуваний tool → очікувана модель відповіді
─────────────────────────────────────────────────────
"витратив 200 на каву" → create_transaction → коротке підтвердження
"добав витрату" (incomplete) → НЕ викликає tool, питає скільки і на що
"скільки в мене на чорній?" → НЕ викликає tool, читає з контексту
"Видали останню транзакцію" → delete_transaction (risky)
"Як справи?" → НЕ викликає tool, маленький smalltalk
```

Цей eval-set став **regression baseline**. Прогни його **до** і **після** зміни промпту, порівняй.

### 4. Запусти модель локально

```bash
# 1) Стартни сервер з реальним ANTHROPIC_API_KEY:
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @sergeant/server dev

# 2) Стартни web:
pnpm --filter @sergeant/web dev

# 3) Відкрий localhost:5173, увійди тестовим юзером (AGENTS.md), піди в HubChat,
#    прогни eval-set вручну.
```

Альтернатива (без UI): прямий `curl` на `/api/chat`:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Cookie: better-auth.session_token=..." \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"витратив 200 на каву"}]}'
```

### 5. Зроби зміну

Едитай `systemPrompt.ts`. Дотримуйся стилю:

- **Українською** (модель розуміє і відповідає українською краще, ніж англійським промптом).
- **Імперативно** («Викликай `create_transaction` коли...», не «Tool create_transaction can be used to...»).
- **Конкретні приклади** замість абстрактних правил, де можливо.
- **Один пункт — одна думка.** Розбивай довгі речення.

### 6. Repeat eval після зміни

Прогни ту ж саму mini-eval (крок 3). Перевір:

- ✅ Усі очікувані tool-calls — на місці.
- ✅ Tone не дрейфонув.
- ✅ Формат відповіді (markdown headings, emoji) лишається.
- ✅ Не з'явились галюцинації нових tool-ів («execute_transfer» якого не існує — модель таке вигадує, якщо новий промпт натякає на нього).

Якщо щось зламалось — повертайся до кроку 5. **Не коміт зміну, що зламала eval.**

### 7. Token cost check

```bash
pnpm --filter @sergeant/server test -- promptPrefixBudget
```

`promptPrefixBudget.test.ts` міряє те, що реально їде в контекстне вікно на
кожному запиті: не-deferred tools + `SYSTEM_PREFIX`. Бюджет — 9 000 B
(вимір 2026-07-25: 7 564 B). Якщо тест впав, промпт або гарячий набір
інструментів виріс — спершу подумай, що **видалити**, і лише потім піднімай
ліміт (тим самим PR-ом, з новим числом у
[§ 9.6 монетизації](../../01-product/launch/business/01-monetization-and-pricing.md)).

Раніше тут стояв `node -e ... SYSTEM_PREFIX.length` і правило «виріс на >10%».
Це міряло 7% від реальної вартості: основна маса префікса — не промпт, а
tool-дефініції.

### 8. Тести (юніт-рівень)

Тести чату в `apps/server/src/modules/chat/chat.test.ts` мокають Anthropic — вони перевіряють route plumbing, не якість промпту. Eval-якість лишається мануальним кроком 6.

```bash
pnpm --filter @sergeant/server exec vitest run src/modules/chat
```

### 9. PR з прикладами

Branch: `<harness>/tune-system-prompt-<topic>`. PR description **обов'язково** містить:

- Diff промпту (GitHub покаже автоматично).
- Eval-set до / після — як таблицю «request → tool called (before)`/`tool called (after)`».
- Token-count change.
- Якщо це продуктовий tone-change — короткий приклад «до/після» розмови.

Conventional commit:

```
feat(server): tighten Finyk tool-calling rules in system prompt

- bias toward asking back when amount missing (was eagerly creating zero-amount tx)
- explicit example: "витратив на каву" without amount → ask
- token count: 4823 → 4901 (+78 chars; insignificant cost change)
```

---

## Verification

- [ ] Зміна промпту — як точна delta, не повний переписав.
- [ ] Mini-eval (3-5 запитів) пройдено до зміни → зафіксовано baseline.
- [ ] Mini-eval пройдено після зміни → жоден tool-call не зламався, tone OK.
- [ ] Token-count change задокументовано в PR.
- [ ] Server unit-тести `chat/*` — green.
- [ ] PR description містить eval-таблицю до/після.

## Notes

- **Не маскуй tool-bug як prompt-issue.** Якщо модель не викликає tool, бо tool definition двозначний (опис tool-а), фіксь у `toolDefs/<domain>.ts`, не в системному промпті.
- **Системний промпт — НЕ місце для контексту юзера.** Юзер-специфічні дані (баланси, останні транзакції) ін'ектяться в `messages[0].content` як «[Останні операції] ...» блоки в `chat.ts`, не у `SYSTEM_PREFIX`.
- **Про cost:** Anthropic Messages кешує prompt-prefix (prompt caching) — стабільний `SYSTEM_PREFIX` = дешеві наступні запити. Якщо змінюєш його часто, втрачається cache benefit. З 2026-07-25 стабільний префікс кешується на `ttl: "1h"`, а всі інструменти поза гарячим набором ідуть із `defer_loading: true` (tool search) — деталі й обмеження в `apps/server/src/modules/chat/toolSearch.ts`.
- **Список інструментів у промпті — це пошуковий індекс.** `buildModuleToolList()` перелічує всі 77 імен у `SYSTEM_PREFIX`. З tool search модель не бачить самих дефініцій наперед, тож цей перелік — головна підказка, ЩО шукати. Не ріж його заради економії: 1.7 КБ тут дешевші за невикликаний інструмент.
- **Якщо потрібен A/B тест двох промптів** — використовуй `featureFlags.ts` з `apps/server/src` (потрібен серверний контекст). Не роби це через два хардкоднутих рядки.

## See also

- [add-hubchat-tool.md](./add-hubchat-tool.md) — для додавання tool, не зміна тону
- [add-feature-flag.md](./add-feature-flag.md) — якщо A/B тест двох промптів
- `apps/server/src/modules/chat/toolDefs/systemPrompt.ts` — поточний промпт
- [AGENTS.md](../../../AGENTS.md) — секція «Architecture: AI tool execution path»

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#895](https://github.com/Skords-01/Sergeant/pull/895) | fix(agents): полірування агентного шару після розкатки module-owners | 2026-08-28 |
| [#892](https://github.com/Skords-01/Sergeant/pull/892) | feat(agents): module-owner і службові Claude-агенти                  | 2026-08-27 |
| [#891](https://github.com/Skords-01/Sergeant/pull/891) | feat(agents): скіли-дисципліни                                       | 2026-08-27 |
| [#890](https://github.com/Skords-01/Sergeant/pull/890) | feat(agents): інфра module-скіли і nested-роутинг                    | 2026-08-27 |
| [#889](https://github.com/Skords-01/Sergeant/pull/889) | feat(agents): продуктові module-owner скіли                          | 2026-08-27 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 5 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
