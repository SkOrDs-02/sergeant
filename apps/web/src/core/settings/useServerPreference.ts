import { useCallback, useEffect, useRef, useState } from "react";
import { meApi, type UserPreferences } from "@shared/api";

/**
 * Один булевий прапорець із `/api/me/preferences` з оптимістичним записом.
 *
 * Чому серверне сховище, а не localStorage: цей прапорець читає СЕРВЕРНИЙ
 * прохід (`apps/server/src/lib/reminders/nudge.ts`), який працює тоді, коли
 * жодного клієнта немає. Прапорець у браузері він би не побачив.
 *
 * ponytail: `PrivacySection` містить свою копію цього циклу — вона старша за
 * цей хук і має власний набір тестів на ту копію. Зводити їх в одне варто,
 * але окремим PR-ом, а не всередині фічі.
 */

type BooleanPreferenceKey = {
  [K in keyof UserPreferences]: UserPreferences[K] extends boolean ? K : never;
}[keyof UserPreferences];

export interface ServerPreferenceState {
  value: boolean;
  /** `false`, поки сервер не відповів або відповів помилкою. */
  loaded: boolean;
  /** Непорожній рядок = показати користувачу, що збереження не відбулось. */
  error: string | null;
  saving: boolean;
  set: (next: boolean) => Promise<void>;
}

export function useServerPreference(
  key: BooleanPreferenceKey,
  copy: { saveError: string; authRequired: string },
): ServerPreferenceState {
  const [value, setValue] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // L-14: гонка GET/PUT. Початковий GET (useEffect нижче) і `set()` (PUT)
  // летять незалежно — раніше GET перевіряв лише `cancelled` (unmount),
  // тож повільна початкова відповідь, що приходила ПІСЛЯ швидшого PUT,
  // беззастережно тирла значення назад: юзер клацав тумблер, бачив
  // миттєвий ON, а за мить той сам собою застигав на старому OFF.
  const requestIdRef = useRef(0);
  // F3 (review адверсаріалу L-14): порівняння лише за `requestId` було
  // занадто грубим — воно питає "чи стартував НОВІШИЙ запит", а не "чи
  // ЩОСЬ новіше вже дало підтверджену відповідь". Початковий GET завжди
  // має найменший id (видається першим, при монтуванні), тож досить
  // просто РОЗПОЧАТИ `set()` — навіть той, що зрештою впаде мережевою
  // помилкою — і GET назавжди дискваліфікувався, хоча цей `set()` так
  // нічого нового про сервер і не повідомив. `appliedRequestIdRef`
  // натомість тримає id ЗАСТОСОВАНОЇ відповіді (0, поки жодна ще не
  // виграла) — і GET, і `set()` звіряються з ним, а не одне з одним.
  const appliedRequestIdRef = useRef(0);
  // Накладені збереження (малоймовірно сьогодні, але частина контракту):
  // рахуємо активні `set()`-виклики лічильником замість звірки id, щоб
  // `saving` знімався рівно тоді, коли завершився ОСТАННІЙ з них — навіть
  // якщо `requestIdRef` тим часом окремо зрушив через перезапуск ефекту
  // (зміна deps) поки цей виклик ще летів.
  const inFlightSavesRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    meApi
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        // Застосовуємо, якщо НІЧОГО ще не виграло. GET завжди виданий
        // першим, тож ненульовий `appliedRequestIdRef` тут може означати
        // лише те, що якийсь новіший `set()` уже ДІЙСНО застосував свою
        // відповідь. Сам факт, що якийсь `set()` СТАРТУВАВ (чи навіть
        // ВПАВ), — не привід відкидати цю, досі найсвіжішу, правду про
        // сервер.
        if (appliedRequestIdRef.current !== 0) return;
        appliedRequestIdRef.current = requestId;
        setValue(prefs[key] === true);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Гість або збій мережі. Не помилка збереження — тумблер просто
        // нема куди писати, і копія має пояснити саме це.
        setLoaded(false);
        setError(copy.authRequired);
      });
    return () => {
      cancelled = true;
    };
  }, [key, copy.authRequired]);

  const set = useCallback(
    async (next: boolean) => {
      const requestId = ++requestIdRef.current;
      const appliedAtStart = appliedRequestIdRef.current;
      inFlightSavesRef.current += 1;
      setError(null);
      setSaving(true);
      const previous = value;
      setValue(next);
      try {
        const saved = await meApi.updatePreferences({ [key]: next });
        // Якщо новіший запит УЖЕ ЗАСТОСУВАВ свою відповідь, поки цей PUT
        // летів, вона авторитетна; застосовувати цю (застарілу) не можна.
        if (requestId <= appliedRequestIdRef.current) return;
        appliedRequestIdRef.current = requestId;
        setValue(saved[key] === true);
        setLoaded(true);
      } catch {
        // F3: відкочувати до `previous` можна лише якщо НІЧОГО новішого
        // не встигло застосуватись, поки цей PUT летів — інакше ми
        // затираємо щойно підтверджену серверну правду (наприклад, GET,
        // що прийшов саме зараз) застарілим клієнтським здогадом,
        // зробленим ДО цієї підтвердженої відповіді.
        if (appliedRequestIdRef.current !== appliedAtStart) return;
        setValue(previous);
        setError(copy.saveError);
      } finally {
        inFlightSavesRef.current -= 1;
        if (inFlightSavesRef.current === 0) setSaving(false);
      }
    },
    [key, value, copy.saveError],
  );

  return { value, loaded, error, saving, set };
}
