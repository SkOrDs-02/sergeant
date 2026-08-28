/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, tracks A + B. See
 * `docs/90-work/planning/specs/silpo-mcp-integration.md`.
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
import { silpoConnectUrl } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";
import { apiUrl, getApiPrefix } from "@shared/lib/api/apiUrl";
import { useToast } from "@shared/hooks/useToast";
import {
  useSilpoDisconnect,
  useSilpoSync,
  useSilpoWipe,
} from "@finyk/hooks/useSilpoMutations";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { SettingsSubGroup } from "./SettingsPrimitives";
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
  help: "Звʼяжи акаунт Сільпо, щоб покупки з чеків збагачували транзакції Monobank позиціями товарів. Дані обробляються на сервері, токен у браузер не потрапляє.",
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
  neverSynced: "Ще не синхронізовано",
  sync: "Оновити чеки",
  syncing: "Оновлюю…",
  disconnect: "Відключити",
  disconnectTitle: "Відключити Сільпо?",
  disconnectBody:
    "Звʼязок буде розірвано: токен видаляється з сервера. Уже завантажені чеки лишаються і нікуди не діваються; щоб видалити й їх, скористайся окремою дією нижче.",
  disconnectConfirm: "Відключити",
  reauthTitle: "Сільпо просить повторну авторизацію",
  reauthBody:
    "Доступ до акаунта Сільпо закінчився або був відкликаний. Підключи заново, щоб чеки продовжили оновлюватись.",
  reauthCta: "Підключити повторно",
  dangerTitle: "Небезпечна дія",
  wipeCta: "Видалити всі дані Сільпо",
  wipeTitle: "Видалити всі дані Сільпо?",
  wipeBody:
    "Видалю всі завантажені чеки, позиції товарів і їх звʼязки з транзакціями Monobank. Підтверджені спліти категорій і записи комори, створені на основі покупок, НЕ видаляються: це вже твої дані, а не дані Сільпо.",
  wipeConfirm: "Видалити назавжди",
} as const;

type ConfirmKind = "disconnect" | "wipe" | null;

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
        `Знайдено ${result.receiptsInserted} нових чеків, зіставлено ${result.matched} із транзакціями.`,
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
              variant="ghost"
              className="w-full h-11"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <Icon name="refresh-cw" size={16} aria-hidden />
              {isFetching ? COPY.checking : COPY.retryCheck}
            </Button>
          </div>
        ) : status === "connected" ? (
          <div className="space-y-3">
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
                variant="ghost"
                className="flex-1 h-11"
                onClick={runSync}
                disabled={syncMutation.isPending}
              >
                <Icon name="refresh-cw" size={16} aria-hidden />
                {syncMutation.isPending ? COPY.syncing : COPY.sync}
              </Button>
              <Button
                variant="danger"
                className="flex-1 h-11"
                onClick={() => setConfirmKind("disconnect")}
                disabled={destructivePending}
              >
                {COPY.disconnect}
              </Button>
            </div>
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
            <div
              className="flex items-start gap-3 p-3 rounded-xl border border-warning/40 bg-warning/10"
              role="alert"
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
            </div>
            <Button
              variant="secondary"
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
              variant="secondary"
              className="w-full h-11"
              onClick={goToSilpoConnect}
            >
              <Icon name="shopping-cart" size={16} aria-hidden />
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
            variant="danger"
            className="w-full h-11"
            onClick={() => setConfirmKind("wipe")}
            disabled={destructivePending}
          >
            <Icon name="trash" size={16} aria-hidden />
            {COPY.wipeCta}
          </Button>
        </SettingsSubGroup>
      )}
    </>
  );
}
