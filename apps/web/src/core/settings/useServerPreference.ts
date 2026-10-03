import { useCallback, useEffect, useRef, useState } from "react";
import { meApi, type UserPreferences } from "@shared/api";
import {
  classifyPreferenceLoadFailure,
  PREFERENCE_LOAD_FAILURE_COPY,
} from "./preferenceLoadFailure";

/**
 * Одне скалярне налаштування з `/api/me/preferences` (прапорець чи число)
 * з оптимістичним записом.
 *
 * Чому серверне сховище, а не localStorage: ці значення читає СЕРВЕРНИЙ
 * прохід нагадувань (`apps/server/src/lib/reminders/sweep.ts`), який
 * працює тоді, коли жодного клієнта немає. Значення в браузері він би не
 * побачив.
 *
 * ponytail: `PrivacySection` містить свою копію цього циклу — вона старша за
 * цей хук і має власний набір тестів на ту копію. Зводити їх в одне варто,
 * але окремим PR-ом, а не всередині фічі.
 */

type ScalarPreferenceKey = {
  [K in keyof UserPreferences]: UserPreferences[K] extends boolean | number
    ? K
    : never;
}[keyof UserPreferences];

export interface ServerPreferenceState<V> {
  /** До відповіді сервера тут `initial`. */
  value: V;
  /** `false`, поки сервер не відповів або відповів помилкою. */
  loaded: boolean;
  /** Непорожній рядок = показати користувачу, що збереження не відбулось. */
  error: string | null;
  saving: boolean;
  set: (next: V) => Promise<void>;
}

export function useServerPreference<K extends ScalarPreferenceKey>(
  key: K,
  copy: { saveError: string; authRequired: string },
  initial: UserPreferences[K],
): ServerPreferenceState<UserPreferences[K]> {
  const [value, setValue] = useState<UserPreferences[K]>(initial);
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
  //
  // Дефект #1 (CodeRabbit post-merge review PR #756): гейт у `.then` GET-а
  // раніше звучав як "застосовуй, якщо ЩЕ ЖОДНА відповідь не виграла"
  // (`appliedRequestIdRef.current !== 0`) — тобто ПІСЛЯ першого-ліпшого
  // застосування він назавжди відкидав будь-яку наступну GET-відповідь,
  // навіть свіжішу. Якщо `key` міняється (deps ефекту), кожна зміна видає
  // НОВИЙ GET з БІЛЬШИМ `requestId` — і саме таку відповідь треба
  // застосовувати. Правильна перевірка — порядок запитів
  // (`requestId <= appliedRequestIdRef.current`), а не "чи вже щось
  // застосовано"; це той самий критерій, який вже використовує `set()`
  // нижче.
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
        // Застосовуємо, якщо ЦЯ відповідь новіша за вже застосовану — той
        // самий порядковий критерій, що й у `set()`. Це коректно і для
        // "звичайного" першого GET (найменший id, appliedRequestIdRef ще
        // 0), і для GET-а, виданого ПІСЛЯ зміни `key` (більший id за
        // попередньо застосовану відповідь), тоді як стара перевірка
        // `appliedRequestIdRef.current !== 0` беззастережно відкидала
        // будь-яку відповідь після першої застосованої — включно з цим
        // другим випадком.
        if (requestId <= appliedRequestIdRef.current) return;
        appliedRequestIdRef.current = requestId;
        setValue(prefs[key]);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Не помилка ЗБЕРЕЖЕННЯ: тумблер просто нема куди писати, і копія
        // має пояснити саме це. Але раніше тут стояло беззастережне
        // `copy.authRequired`, тобто «гість АБО збій мережі» злипались в
        // одне твердження «ти не залогінений» — і залогінена людина в
        // метро йшла перелогінюватись (знахідка PR-S2). Тепер причину
        // розрізняємо; чому саме так, а не через `useOnlineStatus`, —
        // у `preferenceLoadFailure.ts`.
        const failure = classifyPreferenceLoadFailure(err);
        setLoaded(false);
        setError(
          failure === "auth"
            ? copy.authRequired
            : PREFERENCE_LOAD_FAILURE_COPY[failure],
        );
      });
    return () => {
      cancelled = true;
    };
  }, [key, copy.authRequired]);

  const set = useCallback(
    async (next: UserPreferences[K]) => {
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
        setValue(saved[key]);
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
