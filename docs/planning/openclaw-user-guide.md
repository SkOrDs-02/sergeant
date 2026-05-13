# OpenClaw: Інструкція з встановлення та налаштування

> **Last validated:** 2026-05-10 by Devin. **Next review:** після завершення міграції.
> **Status:** Scaffolded

Ця інструкція для людини, яка хоче встановити і налаштувати зовнішній [OpenClaw](https://openclaw.ai) — персональний AI-асистент, який працює на твоїх пристроях. Він відповідає тобі у месенджерах, якими ти вже користуєшся.

---

## Що таке OpenClaw?

OpenClaw — це AI-асистент, який:

- **Працює у тебе** — ти встановлюєш його на свій комп'ютер або сервер
- **Відповідає в месенджерах** — Telegram, WhatsApp, Slack, Discord, Signal, iMessage та ще 20+
- **Вміє говорити** — голосовий ввід/вивід на macOS, iOS, Android
- **Використовує будь-яку AI-модель** — Anthropic (Claude), OpenAI (ChatGPT), Google, або локальні моделі
- **Має систему навичок (skills)** — можна навчити його робити специфічні речі для твого проєкту

---

## Крок 1: Перевір вимоги

Тобі потрібно:

- **Node.js** версії 24 (рекомендовано) або 22.16+
- **API ключ** від AI-провайдера (Anthropic, OpenAI, або Google)

Перевір версію Node:

```bash
node --version
```

Якщо Node не встановлений або стара версія:

```bash
# macOS/Linux — встановити Node через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 24

# Windows — використовуй WSL2 (рекомендовано):
# 1. Відкрий PowerShell як адміністратор
# 2. wsl --install
# 3. Перезавантаж комп'ютер
# 4. Відкрий Ubuntu і встанови Node через nvm як вище
```

---

## Крок 2: Встанови OpenClaw

### macOS / Linux

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

### Або через npm/pnpm

```bash
npm install -g openclaw@latest
# або
pnpm add -g openclaw@latest
```

---

## Крок 3: Пройди onboarding

```bash
openclaw onboard --install-daemon
```

Це інтерактивний wizard, який за ~2 хвилини:

1. Запитає, який AI-провайдер ти хочеш використовувати (Anthropic / OpenAI / Google)
2. Попросить API ключ
3. Налаштує Gateway (це "серверна" частина, яка працює у фоні)
4. Встановить daemon (автозапуск після перезавантаження)

### Де взяти API ключ?

| Провайдер                     | Де отримати                                                                        | Модель          |
| ----------------------------- | ---------------------------------------------------------------------------------- | --------------- |
| **Anthropic** (рекомендовано) | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Claude Sonnet 4 |
| **OpenAI**                    | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)               | GPT-4o          |
| **Google**                    | [aistudio.google.com/apikey](https://aistudio.google.com/apikey)                   | Gemini 2.5 Pro  |

---

## Крок 4: Перевір, що працює

```bash
# Перевір, що Gateway запущений
openclaw gateway status

# Відкрий dashboard у браузері
openclaw dashboard
```

Dashboard — це веб-інтерфейс, де ти можеш чатитися з асистентом. Якщо він відкрився — все працює.

### Відправ перше повідомлення

В dashboard напиши щось — наприклад "Привіт, як справи?" — і повинна прийти відповідь.

---

## Крок 5: Підключи Telegram

Telegram — найпростіший канал для початку. Тобі потрібен Telegram Bot Token.

### Як отримати Bot Token:

1. Відкрий Telegram і знайди [@BotFather](https://t.me/BotFather)
2. Напиши `/newbot`
3. Вибери ім'я для бота (наприклад, "Мій Sergeant Асистент")
4. Вибери username (наприклад, `my_sergeant_bot`)
5. BotFather дасть тобі **токен** — скопіюй його

### Налаштуй Telegram у OpenClaw:

```bash
openclaw setup telegram
```

Wizard попросить Bot Token — встав його. Після цього:

1. Знайди свого бота в Telegram
2. Натисни "Start"
3. Напиши повідомлення — бот відповість!

### Безпека (хто може писати боту):

За замовчуванням бот відповідає тільки тобі. Якщо хтось інший напише — він отримає pairing код. Ти вирішуєш, кого пускати:

```bash
# Подивитись pending запити
openclaw pairing list

# Дозволити користувача
openclaw pairing approve <код>
```

---

## Крок 6: Підключи інші канали (опціонально)

### Slack

```bash
openclaw setup slack
```

Потрібно створити Slack App — wizard проведе через процес.

### Discord

```bash
openclaw setup discord
```

Потрібен Discord Bot Token — wizard покаже де його взяти.

### Signal

```bash
openclaw setup signal
```

### iMessage (тільки macOS)

```bash
openclaw setup imessage
```

Повний список каналів: [docs.openclaw.ai/channels](https://docs.openclaw.ai/channels/)

---

## Крок 7: Налаштуй під Sergeant (для co-founder бота)

Після базового встановлення — підключаємо Sergeant-специфічні можливості.

### 7.1 Встанови Sergeant plugin

Коли plugin буде готовий (див. [план міграції](./openclaw-migration-plan.md)):

```bash
openclaw plugins install @sergeant/openclaw-tools
```

### 7.2 Налаштуй plugin

Відкрий конфіг:

```bash
openclaw config edit
```

Додай:

```json
{
  "plugins": {
    "entries": {
      "@sergeant/openclaw-tools": {
        "enabled": true,
        "config": {
          "serverUrl": "https://your-sergeant-server.railway.app",
          "internalApiKey": "ваш-internal-api-key",
          "founderUserId": "ваш-better-auth-user-id"
        }
      }
    }
  }
}
```

**Де взяти ці значення:**

- `serverUrl` — URL вашого Sergeant backend (Railway dashboard → Settings → Domains)
- `internalApiKey` — значення `INTERNAL_API_KEY` з Railway env vars
- `founderUserId` — ваш user ID з бази даних Sergeant

### 7.3 Додай skills (personas)

Скопіюй skills у workspace:

```bash
mkdir -p ~/.openclaw/workspace/skills

# Skills підуть разом з plugin — їх створювати вручну не треба.
# Якщо хочеш кастомізувати — скопіюй і відредагуй:
cp -r ~/.openclaw/skills/sergeant-cofounder ~/.openclaw/workspace/skills/
```

### 7.4 Перезапусти Gateway

```bash
openclaw gateway restart
```

### 7.5 Перевір, що все працює

Напиши боту в Telegram:

- `/help` — повинен показати Sergeant-специфічні команди
- "Покажи метрики за тиждень" — повинен отримати дані з Stripe/PostHog/Sentry
- "Що ми вирішували минулого тижня?" — повинен показати decisions

---

## Корисні команди

| Команда                          | Що робить                     |
| -------------------------------- | ----------------------------- |
| `openclaw gateway status`        | Перевірити статус Gateway     |
| `openclaw gateway restart`       | Перезапустити Gateway         |
| `openclaw gateway stop`          | Зупинити Gateway              |
| `openclaw dashboard`             | Відкрити веб-інтерфейс        |
| `openclaw config edit`           | Редагувати конфіг             |
| `openclaw skills list`           | Показати активні skills       |
| `openclaw plugins list`          | Показати встановлені plugins  |
| `openclaw doctor`                | Діагностика проблем           |
| `openclaw agent --message "..."` | Відправити повідомлення з CLI |

---

## Оновлення

```bash
# Перевірити поточну версію
openclaw --version

# Оновити
openclaw update

# Або через npm
npm update -g openclaw@latest
```

Після оновлення:

```bash
openclaw doctor       # перевірити, що все ОК
openclaw gateway restart  # перезапустити Gateway
```

---

## Troubleshooting

### Gateway не стартує

```bash
openclaw doctor
openclaw gateway --verbose  # запустити з детальним логом
```

### Бот не відповідає в Telegram

1. Перевір, що Gateway запущений: `openclaw gateway status`
2. Перевір Telegram channel: `openclaw channels status`
3. Перевір логи: `openclaw gateway --verbose`

### API key не працює

```bash
openclaw config edit
# Знайди секцію з provider і перевір ключ
```

### Plugin не працює

```bash
openclaw plugins list         # чи встановлений?
openclaw plugins diagnose     # діагностика
openclaw gateway --verbose    # дивись логи
```

### Потрібна допомога

- Документація: [docs.openclaw.ai](https://docs.openclaw.ai)
- Discord спільнота: [discord.gg/clawd](https://discord.gg/clawd)
- FAQ: [docs.openclaw.ai/help/faq](https://docs.openclaw.ai/help/faq)

---

## Словник

| Термін         | Що це                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Gateway**    | "Сервер" OpenClaw, який працює у фоні на твоєму комп'ютері. Він з'єднує AI-модель з каналами (Telegram, WhatsApp, тощо). |
| **Channel**    | Канал зв'язку — Telegram, WhatsApp, Slack, Discord, тощо.                                                                |
| **Skill**      | Набір інструкцій для AI, як робити конкретну задачу. Це текстовий файл (SKILL.md).                                       |
| **Plugin**     | Розширення, яке додає нові можливості — наприклад, підключення до Sergeant API.                                          |
| **Workspace**  | Робоча директорія OpenClaw — тут живуть твої skills, конфіги, дані.                                                      |
| **Dashboard**  | Веб-інтерфейс для чату з асистентом та моніторингу.                                                                      |
| **DM Pairing** | Механізм безпеки — новий користувач повинен підтвердити свою особу через код.                                            |
| **ClawHub**    | Публічний реєстр plugins і skills (як npm для OpenClaw).                                                                 |
