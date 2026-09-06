# Профілі тестових акаунтів

> **Last validated:** 2026-09-05 by Codex. **Next review:** 2026-12-05.
> **Status:** Active

Ідентифікатори, паролі, токени й browser state не комітяться. Операційні значення живуть поза репо у секретному нотатнику лейна; кожен прогін записує лише alias і revision seed.

| Alias                                                | Призначення                                    | Дані                   | Життєвий цикл         |
| ---------------------------------------------------- | ---------------------------------------------- | ---------------------- | --------------------- |
| `anonymous`                                          | welcome, FTUX, legal                           | немає                  | відтворюваний         |
| `empty-free`                                         | порожні та error стани                         | немає                  | постійний, resettable |
| `rich-free`                                          | доменні journeys                               | light seed             | постійний             |
| `rich-pro`                                           | paywall, Pro, AI memory                        | rich seed              | постійний             |
| `edge`                                               | межі чисел, дат, валідація                     | ручний edge seed       | одноразовий           |
| `sync-same-user-device-a`, `sync-same-user-device-b` | той самий користувач у двох чистих contexts    | один контрольний seed  | одноразові на прогін  |
| `isolation-user-a`, `isolation-user-b`               | перевірка відсутності витоку між користувачами | різні контрольні seeds | одноразові на прогін  |
| `delete-once`                                        | видалення і recovery                           | disposable             | знищується сценарієм  |

`seed-light.spec.ts` створює через справжній signup Q1 empty та Q2/Q5/Q8 light; Q5 не отримує Pro автоматично. Запускати з `PW_SEED_LIGHT=1`, абсолютним зовнішнім `PW_STATE_DIR` і, за потреби, `PW_SEED_ONLY`. `seed-rich.spec.ts` створює витрати, звички й комору, але не їжу або тренування; його stdout із credentials перенаправляти у приватний файл поза репо. У run записуються тільки alias і `seedRevision`, не email/password/state path.

Для cross-device сценарію context B створюється без storageState, входить тим самим email після підтвердженого `POST /api/v2/sync/push` з context A і лише потім робить pull. Для isolation використовуються два різні акаунти. Підпис `sync-a/sync-b` без уточнення заборонений: він уже спричинив хибну методику.

`seed-rich` викликається тільки на локальному або test стенді. Production обмежується окремим безпечним smoke на спеціальному акаунті. Перед reuse профілю звір revision, entitlement через API, pending outbox і поточний стан у handoff попереднього прогону.
