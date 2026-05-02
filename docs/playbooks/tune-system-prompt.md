# Playbook: Tune System Prompt

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** «AI відповідає не так як треба» / «Зміни тон асистента» / «Додай нову інструкцію в системний промпт» / зміна як модель розуміє контекст модулі.

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
# Кількість символів промпту (грубо ≈ tokens × 3 для української):
node -e "console.log(require('./apps/server/src/modules/chat/toolDefs/systemPrompt.js').SYSTEM_PREFIX.length)"
```

Якщо промпт виріс на >10% — це бачити на бюджеті Anthropic. Подумай, чи можна **видалити** щось зайве, перш ніж додавати.

### 8. Тести (юніт-рівень)

Тести чату в `apps/server/src/modules/chat/chat.test.ts` мокають Anthropic — вони перевіряють route plumbing, не якість промпту. Eval-якість лишається мануальним кроком 6.

```bash
pnpm --filter @sergeant/server exec vitest run src/modules/chat
```

### 9. PR з прикладами

Branch: `devin/<unix-ts>-tune-system-prompt-<topic>`. PR description **обов'язково** містить:

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
- **Про cost:** Anthropic Messages кешує prompt-prefix (prompt caching) — стабільний `SYSTEM_PREFIX` = дешеві наступні запити. Якщо змінюєш його часто, втрачається cache benefit.
- **Якщо потрібен A/B тест двох промптів** — використовуй `featureFlags.ts` з `apps/server/src` (потрібен серверний контекст). Не роби це через два хардкоднутих рядки.

## See also

- [add-hubchat-tool.md](add-hubchat-tool.md) — для додавання tool, не зміна тону
- [add-feature-flag.md](add-feature-flag.md) — якщо A/B тест двох промптів
- `apps/server/src/modules/chat/toolDefs/systemPrompt.ts` — поточний промпт
- [AGENTS.md](../../AGENTS.md) — секція «Architecture: AI tool execution path»
