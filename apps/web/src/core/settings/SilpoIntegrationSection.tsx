/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, tracks A + B. See
 * `docs/work/specs/silpo-mcp-integration.md`.
 *
 * Settings card for the Silpo receipts integration — mono-pattern
 * disconnect (tokens only, receipts survive) + a separate, explicitly
 * confirmed "Видалити всі дані Сільпо" wipe action, plus the "Чеки без
 * транзакції" unmatched-receipts list (track B, § Рішення дизайну
 * «Unmatched-чеки — першокласний стан»). `SILPO_ENABLED` defaults to
 * `false` server-side (503 `SILPO_DISABLED`); this card must degrade to a
 * quiet "не увімкнена" state, never an error banner — `useSilpoSyncState`
 * already turns that 503 into `status: "disabled"`.
 */
import { useState } from "react";
import { isApiError, silpoConnectUrl } from "@shared/api";
import { Banner } from "@shared/components/ui/Banner";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { apiUrl, getApiPrefix } from "@shared/lib/api/apiUrl";
import { formatApiError } from "@shared/lib/api/apiErrorFormat";
import { friendlyApiError } from "@shared/lib/api/friendlyApiError";
import { useToast } from "@shared/hooks/useToast";
import {
  useSilpoDisconnect,
  useSilpoSync,
  useSilpoWipe,
} from "@finyk/hooks/useSilpoMutations";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { useSilpoUpdateSettings } from "@finyk/hooks/useSilpoReceipts";
import { SettingsSubGroup, ToggleRow } from "./SettingsPrimitives";
import { SilpoPrivacyPromise } from "./SilpoPrivacyPromise";
import {
  SilpoUnmatchedReceipts,
  type ManualExpenseDraft,
} from "./SilpoUnmatchedReceipts";

interface SilpoIntegrationSectionProps {
  inView: boolean;
  /** `useFinykStorage({}).addManualExpense` — threaded down from
   * `FinykSection` (already the owner of the finyk storage hook for this
   * settings page) so the unmatched-receipt CTA writes through the same
   * manual-expense path as the rest of finyk, not a parallel one. */
  addManualExpense: (expense: ManualExpenseDraft) => void;
}

const COPY = {
  title: "Сільпо (чеки)",
  help: "Звʼяжи акаунт Сільпо, щоб покупки з чеків збагачували операції Monobank позиціями товарів. Дані обробляються на сервері, токен у браузер не потрапляє.",
  // Обіцянка приватності Silpo-інтеграції — затверджена founder-ом
  // дослівно (гейт №2, спека silpo-mcp-integration.md § Відкриті гейти).
  // НЕ переписуй і не скорочуй суть, дозволене лише розбиття на абзаци.
  // Рендериться через `SilpoPrivacyPromise` в обох станах картки — не
  // копіюй рядки нижче в інше місце, це єдине джерело тексту.
  privacyPromiseParagraph1:
    "Чеки з Сільпо зберігаються у твоїй базі Sergeant і працюють лише на тебе: розбивка витрат за категоріями, поповнення комори, підказки їжі.",
  privacyPromiseParagraph2:
    "Назви куплених товарів ніколи не потрапляють в аналітику чи телеметрію. AI бачить їх лише тоді, коли ти сам просиш його попрацювати з чеком, і лише через захищений канал з маскуванням. Видалити всі дані Сільпо можна одним натисканням у налаштуваннях, назавжди.",
  privacyPromiseDetailsSummary: "Що відбувається з даними чеків",
  disabledTitle: "Інтеграція ще не увімкнена",
  disabledBody:
    "Звʼязка з Сільпо поки недоступна в цьому середовищі, спробуй пізніше.",
  checkFailed:
    "Не вдалося перевірити стан підключення Сільпо. Це не означає, що звʼязок втрачено. Перевір мережу і спробуй ще раз.",
  retryCheck: "Спробувати ще раз",
  checking: "Перевіряю…",
  connect: "Звʼязати Сільпо",
  connected: "Сільпо звʼязано",
  receipts: "чеків",
  lastSync: "Востаннє оновлено",
  // Плашка провалу. Існує тому, що доти зламаний синк виглядав рівно як
  // «ти не ходив у магазин»: рухався лише `lastSyncAt`, і той стояв на
  // місці в обох випадках. Два тижні мертвого синку 2026-09-14 помітили
  // не тут, а в Sentry — і лише коли власник сам натиснув «Оновити чеки».
  failedTitle: "Чеки не оновлюються",
  failedSince: "Остання спроба",
  failedAction:
    "Натисни «Оновити чеки». Якщо помилка повториться, збій на боці Сільпо: чеки доїдуть, щойно він мине.",
  neverSynced: "Ще не синхронізовано",
  sync: "Оновити чеки",
  syncing: "Оновлюю…",
  // Тумблер автоімпорту (спека docs/work/specs/silpo-pantry-auto-import.md).
  // За замовчуванням вимкнений - свідомий opt-in виняток із «нічого не
  // пишеться мовчки» (спека § Рішення дизайну, «Тумблер»).
  autoImportLabel: "Додавати продукти з чеків у комору автоматично",
  autoImportDescription:
    "Нові чеки додають продукти в комору без підтвердження. Старі чеки лишаються для ручного імпорту.",
  autoImportToggleError: "Не вдалося змінити налаштування.",
  // Старий бекенд без `PUT /api/silpo/settings` віддає 404: веб деплоїться
  // окремо від API, тож тумблер може зʼявитись раніше за ендпоінт. Без цього
  // тексту людина бачила те саме загальне «Не вдалося…», що й при збої мережі,
  // і повтор нічого не міг змінити.
  autoImportNotDeployed:
    "Сервер ще не оновлено, тому це налаштування поки недоступне. Спробуй пізніше.",
  autoImportServerDown: "Сервер тимчасово не відповідає. Спробуй ще раз.",
  disconnect: "Відключити",
  disconnectTitle: "Відключити Сільпо?",
  disconnectBody:
    "Звʼязок буде розірвано: токен видаляється з сервера. Уже завантажені чеки лишаються і нікуди не діваються; щоб видалити й їх, скористайся окремою дією нижче.",
  disconnectConfirm: "Відключити",
  reauthTitle: "Сільпо просить увійти ще раз",
  reauthBody:
    "Доступ до акаунта Сільпо закінчився або був відкликаний. Підключи заново, щоб чеки продовжили оновлюватись.",
  reauthCta: "Підключити повторно",
  dangerTitle: "Небезпечна дія",
  wipeCta: "Видалити всі дані Сільпо",
  wipeTitle: "Видалити всі дані Сільпо?",
  wipeBody:
    "Видалю всі завантажені чеки, позиції товарів і їх звʼязки з операціями Monobank. Підтверджені розбиття категорій і записи комори, створені на основі покупок, НЕ видаляються: це вже твої дані, а не дані Сільпо.",
  wipeConfirm: "Видалити назавжди",
} as const;

type ConfirmKind = "disconnect" | "wipe" | null;

/**
 * Текст тосту, коли `PUT /api/silpo/settings` не вдався. Раніше `catch {}`
 * ковтав помилку й показував одне загальне «Не вдалося змінити
 * налаштування.» на будь-яку причину. Тепер причина видима: 404 (бекенд
 * старіший за веб), шлюзові збої, текст сервера, мережа/офлайн (їх
 * розрізняє `formatApiError`) і, коли сервер нічого не сказав, код статусу.
 * Не-API помилки (наприклад, `ZodError` на формі відповіді) несуть технічний
 * `message`, його людині не показуємо.
 */
function autoImportToggleErrorMessage(error: unknown): string {
  if (!isApiError(error)) return COPY.autoImportToggleError;
  const message = formatApiError(error, {
    fallback: COPY.autoImportToggleError,
    httpStatusToMessage: (status, serverMessage) => {
      if (status === 404) return COPY.autoImportNotDeployed;
      if (status === 502 || status === 503 || status === 504) {
        return COPY.autoImportServerDown;
      }
      if (serverMessage || status === 401 || status === 403 || status === 429) {
        return friendlyApiError(status, serverMessage);
      }
      return `${COPY.autoImportToggleError} Код помилки: ${status}. Спробуй ще раз.`;
    },
  });
  return message || COPY.autoImportToggleError;
}

function formatKyivDateTime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Kyiv",
  });
}

export function SilpoIntegrationSection({
  inView,
  addManualExpense,
}: SilpoIntegrationSectionProps) {
  const toast = useToast();
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const {
    data: syncState,
    status,
    isError: checkFailed,
    isFetching,
    refetch,
  } = useSilpoSyncState({ enabled: inView });
  const syncMutation = useSilpoSync();
  const disconnectMutation = useSilpoDisconnect();
  const wipeMutation = useSilpoWipe();
  const updateSettingsMutation = useSilpoUpdateSettings();

  const runToggleAutoImport = async (checked: boolean) => {
    try {
      await updateSettingsMutation.mutateAsync(checked);
    } catch (error) {
      toast.error(autoImportToggleErrorMessage(error), undefined, {
        label: "Повторити",
        onClick: () => void runToggleAutoImport(checked),
      });
    }
  };
  // Both mutations are destructive and irreversible (token revoke / data
  // delete) — while either is in flight, block opening the confirm dialog
  // again and block re-confirming, so a double-tap can't fire a second
  // destructive call before the first settles.
  const destructivePending =
    wipeMutation.isPending || disconnectMutation.isPending;

  // `GET /api/silpo/connect` is a 302 browser-redirect endpoint —
  // navigation-only (see `silpoConnectUrl()` doc comment in
  // `packages/api-client/src/endpoints/silpo.ts`). `window.location.href`
  // is the documented way to trigger it, not a `fetch`/`<a href>` click.
  const goToSilpoConnect = () => {
    window.location.href = silpoConnectUrl({
      baseUrl: apiUrl(""),
      apiPrefix: getApiPrefix(),
    });
  };

  const runSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(
        `Знайдено ${result.receiptsInserted} нових чеків, зіставлено ${result.matched} із операціями.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося оновити чеки.",
        undefined,
        { label: "Повторити", onClick: () => void runSync() },
      );
    }
  };

  const runDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success("Сільпо відключено. Завантажені чеки лишились.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося відключити Сільпо.",
        undefined,
        { label: "Повторити", onClick: () => void runDisconnect() },
      );
    }
  };

  const runWipe = async () => {
    try {
      const result = await wipeMutation.mutateAsync();
      toast.success(`Видалено чеків: ${result.deletedReceipts}.`);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося видалити дані Сільпо.",
        undefined,
        { label: "Повторити", onClick: () => void runWipe() },
      );
    }
  };

  if (status === "disabled") {
    return (
      <SettingsSubGroup title={COPY.title}>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-style-label text-text">{COPY.disabledTitle}</p>
          <p className="mt-1 text-style-caption text-subtle">
            {COPY.disabledBody}
          </p>
        </div>
      </SettingsSubGroup>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={confirmKind !== null}
        title={confirmKind === "wipe" ? COPY.wipeTitle : COPY.disconnectTitle}
        description={
          confirmKind === "wipe" ? COPY.wipeBody : COPY.disconnectBody
        }
        confirmLabel={
          confirmKind === "wipe" ? COPY.wipeConfirm : COPY.disconnectConfirm
        }
        danger
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          // Guard against a second confirm firing while the first
          // destructive call is still in flight (e.g. a fast double-tap
          // before the dialog has closed).
          if (destructivePending) return;
          if (confirmKind === "wipe") void runWipe();
          if (confirmKind === "disconnect") void runDisconnect();
          setConfirmKind(null);
        }}
      />

      <SettingsSubGroup title={COPY.title}>
        <p className="text-style-caption text-subtle leading-snug">
          {COPY.help}
        </p>

        {checkFailed ? (
          <div className="space-y-3">
            <p
              className="text-style-body text-danger bg-danger/10 rounded-xl px-3 py-2"
              role="alert"
            >
              {COPY.checkFailed}
            </p>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <Icon name="refresh-cw" size="md" aria-hidden />
              {isFetching ? COPY.checking : COPY.retryCheck}
            </Button>
          </div>
        ) : status === "connected" ? (
          <div className="space-y-3">
            {syncState?.lastFailedAt ? (
              <div
                className="flex items-start gap-3 p-3 rounded-xl border border-warning/40 bg-warning/15"
                role="status"
              >
                <Icon
                  name="alert-triangle"
                  size="md"
                  className="shrink-0 mt-0.5 text-warning-strong dark:text-warning"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="text-style-label">{COPY.failedTitle}</div>
                  <div className="text-style-caption text-subtle mt-0.5">
                    {COPY.failedSince}{" "}
                    {formatKyivDateTime(syncState.lastFailedAt)}
                    {syncState.lastErrorCode
                      ? ` · ${syncState.lastErrorCode}`
                      : ""}
                  </div>
                  <div className="text-style-caption text-subtle mt-1">
                    {COPY.failedAction}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-success/30 bg-bg">
              <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-success" />
              <div className="flex-1 min-w-0">
                <div className="text-style-label">{COPY.connected}</div>
                <div className="text-style-caption text-subtle mt-0.5">
                  {syncState?.receiptsCount ?? 0} {COPY.receipts}
                  {" · "}
                  {syncState?.lastSyncAt
                    ? `${COPY.lastSync} ${formatKyivDateTime(syncState.lastSyncAt)}`
                    : COPY.neverSynced}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={runSync}
                disabled={syncMutation.isPending}
              >
                <Icon name="refresh-cw" size="md" aria-hidden />
                {syncMutation.isPending ? COPY.syncing : COPY.sync}
              </Button>
              <Button
                variant="soft"
                tone="danger"
                className="flex-1 h-11"
                onClick={() => setConfirmKind("disconnect")}
                disabled={destructivePending}
              >
                {COPY.disconnect}
              </Button>
            </div>
            <ToggleRow
              label={COPY.autoImportLabel}
              description={COPY.autoImportDescription}
              checked={syncState?.pantryAutoImportSince != null}
              onChange={(checked) => void runToggleAutoImport(checked)}
              disabled={updateSettingsMutation.isPending}
            />
            {/* Той самий текст, що в disconnected-стані, але згорнутий —
                щоденно не муляє, лишається на відстані одного тапу. */}
            <SilpoPrivacyPromise copy={COPY} variant="details" />
            <SilpoUnmatchedReceipts
              enabled={status === "connected"}
              addManualExpense={addManualExpense}
            />
          </div>
        ) : status === "reauth_required" ? (
          <div className="space-y-3">
            <Banner
              variant="warning"
              role="alert"
              className="flex items-start gap-3"
            >
              <span
                className="w-2.5 h-2.5 mt-1.5 rounded-full shrink-0 bg-warning"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="text-style-label">{COPY.reauthTitle}</div>
                <p className="mt-0.5 text-style-caption text-subtle leading-snug">
                  {COPY.reauthBody}
                </p>
              </div>
            </Banner>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={goToSilpoConnect}
            >
              {COPY.reauthCta}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Обіцянка приватності — ПЕРЕД рішенням підключити, не після
                (гейт №2 спеки). */}
            <SilpoPrivacyPromise copy={COPY} variant="inline" />
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={goToSilpoConnect}
            >
              <Icon name="shopping-cart" size="md" aria-hidden />
              {COPY.connect}
            </Button>
          </div>
        )}
      </SettingsSubGroup>

      {(status === "connected" ||
        status === "reauth_required" ||
        (syncState?.receiptsCount ?? 0) > 0) && (
        <SettingsSubGroup title={COPY.dangerTitle}>
          <Button
            variant="soft"
            tone="danger"
            className="w-full h-11"
            onClick={() => setConfirmKind("wipe")}
            disabled={destructivePending}
          >
            <Icon name="trash" size="md" aria-hidden />
            {COPY.wipeCta}
          </Button>
        </SettingsSubGroup>
      )}
    </>
  );
}
