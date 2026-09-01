/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * «Дані живуть лише на цьому пристрої» — попередження для незалогіненого
 * користувача.
 *
 * Канон `finyk` §6.2 (durability обовʼязкова): втрата ручного світу
 * неприйнятна. Ручний світ — це те, що з банку НЕ відновлюється: готівкові
 * витрати, активи, борги, підписки, бюджети, а також оверлеї над
 * банківськими транзакціями (категорії, спліти, приховування, виключення зі
 * статистики) — «місяці ручної праці, які банк не поверне».
 *
 * AI-CONTEXT: банер показується рівно тоді, коли синхронізація фізично
 * неможлива — коли поточний id не синхронізований (`local-anon` /
 * `demo-local`). Це не здогад про план і не евристика: `enqueueOutboxUpsert`
 * використовує **той самий** предикат `isSyncableUserId`, щоб узагалі не
 * писати такі рядки в чергу — вони недренабельні за визначенням. Тобто банер
 * і рушій sync-у судять по одному й тому ж факту, а не по двох схожих.
 *
 * Чому саме попередження, а не автобекап: аудит (G2) пропонує рівно
 * альтернативу — «автоматичний періодичний JSON-бекап **або** явне
 * попередження». Автобекап без місця, куди його класти, лише переносить
 * проблему (файл у Downloads так само зникне разом із пристроєм), а вхід в
 * акаунт вмикає справжню серверну реплікацію, яка вже працює — cloud-sync
 * доступний і на Free (2 пристрої).
 *
 * AI-DANGER: не показуй цей банер залогіненому користувачу «про всяк
 * випадок». Для нього твердження просто НЕПРАВДИВЕ — його дані їдуть на
 * сервер, — а банер, який бреше, вчить ігнорувати всі банери в продукті.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

import { useLocalUserId } from "../auth/useLocalUserId";
import { isSyncableUserId } from "../syncEngine/syncableUserId";
import { useHubBannerSlot } from "../hub/bannerBudget";

const m = messages.durability.localOnly;

export interface LocalOnlyDataBannerProps {
  /** Відкриває екран входу/реєстрації. */
  onSignIn: () => void;
  /** Завантажує JSON-бекап (панель бекапу в hub). */
  onBackup?: (() => void) | undefined;
}

export function LocalOnlyDataBanner({
  onSignIn,
  onBackup,
}: LocalOnlyDataBannerProps) {
  const userId = useLocalUserId();
  // Бюджет банерів хабу (F3, 2026-09-01): це попередження — пріоритет 0,
  // тож місце в нього є завжди, коли воно хоче показатись.
  const hasSlot = useHubBannerSlot(
    "localOnlyData",
    userId !== null && !isSyncableUserId(userId),
  );

  // `null` — сесія ще вантажиться. Мигнути попередженням «дані під загрозою»
  // і прибрати його через 200 мс — гірше, ніж не показати нічого: користувач
  // запамʼятає тривогу, а не факт.
  if (userId === null) return null;
  if (isSyncableUserId(userId)) return null;
  if (!hasSlot) return null;

  return (
    <div
      role="status"
      className="rounded-2xl border border-warning bg-warning/10 p-3"
    >
      <p className="text-style-label text-text">{m.title}</p>
      <p className="mt-1 text-style-caption text-subtle leading-relaxed">
        {m.body}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSignIn}>
          {m.signIn}
        </Button>
        {onBackup ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBackup}>
            {m.backup}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
