import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { meApi, type UserPreferences } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { useFlag, setFlag } from "../lib/featureFlags";
import { useAppLockContext } from "../security/AppLockContext";
import type { LockState } from "../security/useAppLock";
import { LegalLinks } from "../legal/LegalLinks";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { writeMemoryEntries } from "../profile/memoryBank";
import { setAnalyticsConsent } from "../observability/analyticsConsent";
import { AiMemoryList } from "./AiMemoryList";

const m = messages.privacy.lock;

// Експортовано для `PrivacySection.test.tsx` (L-3): loading-гейт нижче
// означає, що це значення НІКОЛИ не може просочитись у DOM чи
// `analyticsConsent` до завершення гідрації, тож перевіряти його треба
// напряму, а не виводити з відрендереного виводу (2026-08-08 adversarial
// review, finding #4 — попередній assert `not.toBeChecked()` насправді
// перевіряв відповідь server-мока, а не цю константу).
export const DEFAULT_PREFERENCES: UserPreferences = {
  // L-3: продукт — opt-in analytics, не opt-out. Дефолт тут мусить
  // збігатися з серверним DEFAULT FALSE (apps/server/src/modules/me/
  // dataRights.ts, міграція 111) і з in-memory-кешем `analyticsConsent.ts`
  // ("DENY UNTIL HYDRATED"). До відповіді сервера екран нижче все одно не
  // стверджує ні "увімкнено", ні "вимкнено" — див. `preferencesLoaded`-гейт
  // у розмітці нижче.
  analytics: false,
  aiMemory: true,
  pushNotifications: false,
  sergeantNudges: false,
  healthDataConsent: false,
  // Приватність цим екраном не керує — вибір модулів живе в
  // «Дашборд» (`DashboardSection`) і синхронізується окремо
  // (`activeModulesSync`). `null` тут означає «цей екран нічого не знає
  // про вибір», а не «вибору немає».
  activeModules: null,
  updatedAt: null,
};

type PreferenceKey =
  "analytics" | "aiMemory" | "pushNotifications" | "healthDataConsent";

export function PrivacySection() {
  const appLock = useAppLockContext();
  const flagEnabled = useFlag("app-lock-enabled");
  const queryClient = useQueryClient();
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] =
    useState<PreferenceKey | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryClearStatus, setMemoryClearStatus] = useState<string | null>(
    null,
  );
  const [clearMemoryConfirmOpen, setClearMemoryConfirmOpen] = useState(false);
  // L-11: попередній `appLock.state` — щоб реагувати лише на перехід
  // "locked" -> "idle" (справжнє розблокування або wipe після 10 невдалих
  // спроб), а не на будь-яку зміну. Інакше реконсиляція нижче ганялася б і
  // під час ЖИВОГО ввімкнення тумблера (idle -> setup) і race-ила б із
  // handleToggle, зганяючи щойно виставлений прапор назад у false.
  const prevLockStateRef = useRef<LockState | null>(null);
  // Finding #5 (2026-08-08 adversarial review): ІДЕНТИЧНІСТЬ
  // `appLock.hasPin` міняється лише коли міняється залогінений користувач
  // (див. eslint-disable-коментар нижче). Відстеження цього дає
  // реконсиляційному ефекту нижче покрити ще й «спільний пристрій, інший
  // користувач»: перемикання юзерів не чіпає ні `appLock.state`, ні
  // `flagEnabled`, тож без цього ефект перезапускався б (hasPin і так у
  // deps), але завжди впирався в ранній `!isMount && !cameFromLocked`
  // return і мовчки лишав «Блокування додатку» ввімкненим для юзера без
  // PIN-а в ЙОГО партиції.
  const prevHasPinRef = useRef<typeof appLock.hasPin | null>(null);

  // L-3: винесено окремо, щоб стан помилки (див. рендер нижче) міг
  // пропонувати справжній retry, а не глухий кут (finding #9) — тіло
  // `useEffect` з `[]`-deps не можна повторно викликати з click-хендлера.
  const loadPreferences = useCallback(() => {
    let cancelled = false;
    meApi
      .getPreferences()
      .then((next) => {
        if (cancelled) return;
        setPreferences(next);
        setPreferencesLoaded(true);
        setPreferencesError(null);
        setAnalyticsConsent(next.analytics);
      })
      .catch(() => {
        if (cancelled) return;
        setPreferencesLoaded(false);
        setPreferencesError(
          "Увійди в акаунт, щоб керувати налаштуваннями згоди на сервері.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadPreferences(), [loadPreferences]);

  useEffect(() => {
    // L-11: стирання PIN-креденшела після 10 невдалих спроб
    // (lockStorage.MAX_FAILED_UNLOCK_ATTEMPTS) міняє лише `appLock.state`
    // (locked -> idle, useAppLock.unlock) — прапор "app-lock-enabled"
    // ніхто не чіпає, тож тумблер лишається ON, хоча PIN-а вже нема.
    // Звіряємо факт при монтуванні, на кожному переході з "locked" і на
    // кожній зміні користувача (finding #5), доки прапор ще ввімкнений.
    const prev = prevLockStateRef.current;
    const isMount = prev === null;
    const cameFromLocked = prev === "locked";
    const userChanged =
      prevHasPinRef.current !== null &&
      prevHasPinRef.current !== appLock.hasPin;
    prevLockStateRef.current = appLock.state;
    prevHasPinRef.current = appLock.hasPin;

    if (!flagEnabled) return;
    if (appLock.state !== "idle") return;
    if (!isMount && !cameFromLocked && !userChanged) return;

    let cancelled = false;
    appLock
      .hasPin()
      .then((has) => {
        if (cancelled || has) return;
        setFlag("app-lock-enabled", false);
      })
      .catch(() => {
        // Finding #6: `hasPin()` (lockStorage.hasPinSet -> loadCred) РЕДЖЕКТИТЬ
        // при збої IndexedDB (приватний режим Safari, брак сховища), а не
        // резолвиться в `false` — це best-effort реконсиляція, а не дія,
        // видима юзеру, тож ковтаємо її мовчки замість того, щоб лишати
        // unhandled rejection на кожному монтуванні Налаштувань.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `appLock` — новий обʼєкт-літерал щорендеру (useAppLock.ts не мемоізує повернене значення). Додавання ЦІЛОГО обʼєкта в deps ганяло б цей ефект (і реальний IndexedDB-запит `hasPin()`) на КОЖЕН неповʼязаний ре-рендер PrivacySection; має значення лише ідентичність `.state` і `.hasPin` (остання міняється тільки з userId), обидві вже явно в deps.
  }, [flagEnabled, appLock.state, appLock.hasPin]);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setFlag("app-lock-enabled", true);
      // Audit F16: перевіряємо PIN-партицію САМЕ поточного користувача, а
      // не `anon`. `appLock.hasPin()` замикається на `user?.id` з `useAppLock`.
      const has = await appLock.hasPin();
      if (!has) {
        appLock.startSetup();
      }
    } else {
      setDisableConfirmOpen(true);
    }
  };

  const handleDisableConfirm = async () => {
    setDisableConfirmOpen(false);
    setFlag("app-lock-enabled", false);
    // Audit F16: стираємо креденшел поточного користувача, а не слот `anon`.
    await appLock.disablePin();
  };

  const updatePreference = async (key: PreferenceKey, checked: boolean) => {
    setPreferencesError(null);
    setSavingPreference(key);
    const previous = preferences;
    setPreferences({ ...previous, [key]: checked });
    if (key === "analytics") {
      // Оптимістично, ще ДО мережевого round trip (CodeRabbit PR #627):
      // dismiss, що стався між цим кліком і відповіддю сервера, має вже
      // враховувати новий вибір юзера — очікування на резолв
      // `updatePreferences()` лишало вікно, де вимкнений тумблер усе одно
      // емітив `advice_shown`/`advice_dismissed` зі старим (згодним)
      // значенням. Відкочується в `catch` нижче при збої.
      setAnalyticsConsent(checked);
    }
    try {
      const next = await meApi.updatePreferences({ [key]: checked });
      setPreferences(next);
      setPreferencesLoaded(true);
      setAnalyticsConsent(next.analytics);
    } catch {
      setPreferences(previous);
      if (key === "analytics") {
        setAnalyticsConsent(previous.analytics);
      }
      setPreferencesError("Не вдалося зберегти налаштування. Спробуй ще раз.");
    } finally {
      setSavingPreference(null);
    }
  };

  const handleClearMemoryConfirm = async () => {
    setClearMemoryConfirmOpen(false);
    // Finding #2 (2026-08-08 adversarial review): якщо батчити це разом із
    // `setClearingMemory(true)`, діалог закривався і його ж кнопка-тригер
    // вимикалась в ОДНОМУ й тому ж коміті. Cleanup фокус-пастки
    // `ConfirmDialog` повертає фокус саме на цей тригер після
    // розмонтування діалогу — `.focus()` на вже `disabled`-елементі мовчки
    // нічого не робить, тож keyboard/AT-юзери лишались на `<body>`.
    // Пропуск одного мікротаску дає React спершу закомітити (і прогнати
    // відкладений passive-ефект відновлення фокусу для) рендер, що лише
    // закриває діалог: будь-який наступний виклик `setState` спершу
    // прогонить відкладені passive-ефекти, перш ніж обробити нове
    // оновлення — тож цей порядок детермінований, а не гонка з таймінгом —
    // див. cleanup у `useDialogFocusTrap.ts`.
    await Promise.resolve();
    setClearingMemory(true);
    setMemoryClearStatus(null);
    // Дефект #5 (CodeRabbit post-merge review PR #756): один спільний
    // try/catch навколо серверного DELETE і локального запису видавав
    // локальну помилку (наприклад переповнене localStorage у приватному
    // режимі) за серверну — а сервер на той момент УЖЕ незворотно стер
    // факти. Показувати "Не вдалося очистити памʼять ШІ" в такому разі —
    // брехня (дані реально видалені), і гірше: інвалідація aiMemoryKeys
    // пропускалась тим самим throw, тож AiMemoryList далі показував би
    // факти, яких на сервері вже нема. Тому серверний виклик і локальний
    // запис розділені на окремі кроки: результат для юзера залежить лише
    // від сервера, а інвалідація кешу відбувається завжди, коли сервер
    // підтвердив очищення — незалежно від того, чи вдався локальний запис.
    try {
      await meApi.clearAiMemory();
    } catch {
      setMemoryClearStatus("Не вдалося очистити памʼять ШІ.");
      setClearingMemory(false);
      return;
    }
    // CodeRabbit-ревʼю PR #757 (продовження дефекту #5): попередній фікс
    // розділив кроки, але ковтав локальну помилку МОВЧКИ і завжди
    // показував "Памʼять ШІ очищено." — тобто повне видалення, хоча факти
    // локально ЛИШАЮТЬСЯ на пристрої. Для дії про приватність це брехня в
    // інший бік: людині кажуть "стерто", коли частина даних на місці.
    // Показувати "Не вдалося очистити памʼять ШІ." теж не можна — сервер
    // УЖЕ незворотно стер факти, і це твердження було б неправдою в
    // протилежний бік. Тому третій, окремий стан: сервер очищено, локальну
    // копію стерти не вдалося.
    let localWriteFailed = false;
    try {
      writeMemoryEntries([]);
    } catch {
      localWriteFailed = true;
    }
    // L-20: без явної інвалідації aiMemoryKeys інфініт-список у
    // AiMemoryList лишається зі стертими фактами до наступного
    // неповʼязаного refetch — той самий ключ, який AiMemoryList сам
    // інвалідує після точкового видалення ОДНОГО факту (AiMemoryList.tsx,
    // remove.onSuccess). Тут стирається ВЕСЬ список, тож той самий шлях.
    // Інвалідація відбувається В БУДЬ-ЯКОМУ разі — сервер підтвердив
    // очищення вище, і статус локального запису на це не впливає.
    // Finding #10: НЕ через await — саме очищення вже відбулось успішно, а
    // власний refetch AiMemoryList — фонова робота; чекати на нього тут
    // лише тримало б кнопку в стані "Очищаю…" зайвий round-trip на
    // повільній мережі без жодної користі для коректності.
    void queryClient.invalidateQueries({ queryKey: aiMemoryKeys.all });
    setMemoryClearStatus(
      localWriteFailed
        ? "Памʼять ШІ очищено на сервері, але локальну копію стерти не вдалося."
        : "Памʼять ШІ очищено.",
    );
    setClearingMemory(false);
  };

  return (
    <SettingsGroup
      title={m.sectionTitle}
      icon="lock"
      anchorId="settings-privacy"
    >
      <ToggleRow
        label={m.enableLabel}
        description={m.enableDescription}
        checked={flagEnabled}
        onChange={handleToggle}
      />

      {flagEnabled && (
        <div className="flex flex-col gap-3 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={appLock.startChange}
            className="self-start text-brand"
          >
            {m.changePin}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={appLock.lock}
            className="self-start text-muted"
          >
            {m.lockNow}
          </Button>
        </div>
      )}

      {/* V-12 (аудит 2026-08-08, docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md
          §5): підблок «Згода та дані» і вкладений під ним підблок «Що ШІ
          про тебе памʼятає» малювались саморобно (`<h3>`/`<h4>` з
          `text-style-label`) замість спільного примітиву `SettingsSubGroup`
          (`SettingsPrimitives.tsx`, який тут НЕ чіпаємо — над ним може
          працювати інший агент). Примітив фіксовано рендерить
          `<h3 class="text-style-overline">`, тож варіанта «зберегти h4-
          глибину вкладеного блоку через примітив» немає — переведено ОБИДВА
          підблоки, і вкладений теж стає h3 (див. нижче біля AiMemory-блоку).
          heading-order (блокуючий axe-гейт tests/a11y/axe.spec.ts) це не
          порушує: рівні йдуть h2 (SettingsGroup «Конфіденційність») → h3 →
          h3 без розриву — axe забороняє СТРИБОК рівня вниз (напр. h2→h4),
          а не повтор того самого рівня. */}
      <SettingsSubGroup title="Згода та дані">
        <p className="text-style-body text-subtle leading-relaxed">
          Обери, що Sergeant може використовувати для якості продукту та
          персоналізації. Дані для входу, безпеки й оплати залишаються
          потрібними для роботи застосунку. Сповіщення налаштовуються в окремому
          розділі.
        </p>
        {preferencesLoaded ? (
          <>
            <ToggleRow
              label="Аналітика продукту"
              description={
                savingPreference === "analytics"
                  ? "Зберігаю…"
                  : "Допомагає бачити, де інтерфейс незручний або ламається."
              }
              checked={preferences.analytics}
              onChange={(checked) =>
                void updatePreference("analytics", checked)
              }
            />
            <ToggleRow
              label="Памʼять для ШІ"
              description={
                savingPreference === "aiMemory"
                  ? "Зберігаю…"
                  : "Дозволяє ШІ памʼятати корисні факти між сесіями, щоб відповіді були точнішими."
              }
              checked={preferences.aiMemory}
              onChange={(checked) => void updatePreference("aiMemory", checked)}
            />
            <ToggleRow
              label="Дані про здоровʼя"
              description={
                savingPreference === "healthDataConsent"
                  ? "Зберігаю…"
                  : "Явна згода на обробку тренувань, самопочуття й харчування, без неї ця інформація не використовується."
              }
              checked={preferences.healthDataConsent}
              onChange={(checked) =>
                void updatePreference("healthDataConsent", checked)
              }
            />
            {preferencesError ? (
              // Finding #7: рендериться одразу біля групи тумблерів, що не
              // зберіглась, а не на висоту екрана нижче, поруч із
              // `LegalLinks` — зрячий юзер, що щойно бачив, як тумблер
              // мовчки відкотився (див. `catch` у `updatePreference`
              // вище), потребує пояснення поруч із контролом, а не під
              // списком фактів ШІ-памʼяті.
              <p className="text-style-caption text-danger-strong" role="alert">
                {preferencesError}
              </p>
            ) : null}
          </>
        ) : preferencesError ? (
          // Finding #9: провальне ПЕРШЕ завантаження раніше рендерило тут
          // порожнечу — ні тумблерів (коректно, див. L-3 нижче), ні
          // способу вийти з цього стану, крім виходу з Налаштувань і
          // повернення. Пропонуємо той самий текст помилки плюс справжній
          // retry, що повторно викликає fetch.
          <div className="flex flex-col items-start gap-2">
            <p className="text-style-caption text-danger-strong" role="alert">
              {preferencesError}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreferencesError(null);
                loadPreferences();
              }}
            >
              Спробувати ще
            </Button>
          </div>
        ) : (
          // L-3: до відповіді сервера дефолт — false (opt-in), але екран
          // не має стверджувати НІ "увімкнено", НІ "вимкнено" до гідрації —
          // інакше гість чи офлайн-юзер бачить чужий/застарілий стан як
          // свій. Замість цього — явний loading-стан без тумблерів.
          <p
            className="text-style-caption text-subtle"
            role="status"
            aria-live="polite"
          >
            Завантажую налаштування…
          </p>
        )}
        <div className="rounded-2xl border border-line bg-panelHi p-3">
          <p className="text-style-caption text-subtle leading-relaxed">
            Памʼять зберігає підтверджені факти профілю локально та, коли
            перемикач увімкнений, семантичні записи на сервері. Вимкнення блокує
            нові записи й використання між сесіями, але не видаляє вже
            збережене.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={clearingMemory}
            className="mt-2 text-danger-strong"
            onClick={() => setClearMemoryConfirmOpen(true)}
          >
            {clearingMemory ? "Очищаю…" : "Очистити памʼять ШІ"}
          </Button>
          {memoryClearStatus ? (
            <p className="mt-2 text-style-caption text-subtle" role="status">
              {memoryClearStatus}
            </p>
          ) : null}
          <div className="mt-3 border-t border-line pt-3">
            <SettingsSubGroup title={messages.privacy.aiMemory.sectionTitle}>
              {/* V-11 (фаза 2 L-8, 2026-08-09): обсяг перед правилом.
                  Спершу кажемо, ЩО тут лежить (включно з фактами профілю,
                  які тепер дзеркаляться сюди), і лише потім — що з ним
                  можна зробити. Без цього рядка мітка «Профіль» на факті
                  читається як дубль секції «Памʼять» у Профілі. */}
              <p className="text-style-body text-subtle leading-relaxed">
                {messages.privacy.aiMemory.sectionScope}
              </p>
              <p className="text-style-body text-subtle leading-relaxed">
                {messages.privacy.aiMemory.sectionHint}
              </p>
              <AiMemoryList />
            </SettingsSubGroup>
          </div>
        </div>
        <LegalLinks compact className="justify-start" />
      </SettingsSubGroup>

      {/* V-6 / finding #1 (2026-08-08 adversarial review): `SettingsGroup` —
          це `Card prominence="glass"` (`backdrop-blur-md`) всередині двох
          `overflow-hidden`-обгорток — `backdrop-filter` робить картку
          containing block для `position: fixed`, тож непорталений діалог
          (раніше тут був локальний `ConfirmModal`) закривався й обрізався
          ВСЕРЕДИНІ картки налаштувань замість покрити весь екран. Той сам
          збій уже задокументовано на цьому самому контейнері в
          `OnboardingWizard.tsx`. `ConfirmDialog` (`@shared/components/ui`)
          порталиться в `document.body` — той самий примітив, що й
          `PWASection` уже використовує поруч. */}
      <ConfirmDialog
        open={disableConfirmOpen}
        title={m.disableConfirmTitle}
        description={m.disableConfirmBody}
        confirmLabel={m.disableConfirmButton}
        danger
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableConfirmOpen(false)}
      />

      {/* V-6: незворотне видалення (сервер робить DELETE, не soft-delete —
          так само, як точкове видалення в AiMemoryList) підтверджується
          тим самим діалоговим примітивом застосунку, а не нативним
          `window.confirm`, якого дизайн-система забороняє (не
          стилізується, блокує event loop, без focus-trap/фокус-стилів). */}
      <ConfirmDialog
        open={clearMemoryConfirmOpen}
        title="Очистити памʼять ШІ?"
        description="Зникнуть усі факти, і локальні, і на сервері. Відновити не вийде."
        confirmLabel="Очистити назавжди"
        danger
        onConfirm={() => void handleClearMemoryConfirm()}
        onCancel={() => setClearMemoryConfirmOpen(false)}
      />
    </SettingsGroup>
  );
}
