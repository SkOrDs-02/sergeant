/**
 * Востаннє перевірено: 2026-07-16
 * Статус: Активний
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError, monoWebhookApi, type MonoSyncState } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { isRetriableError } from "@shared/lib/api/queryClient";
import { cn } from "@shared/lib/ui/cn";
import { BackfillProgressPill } from "@finyk/components/BackfillProgressPill";
import { useMonoBackfillProgress } from "@finyk/hooks/useMonoBackfillProgress";
import { removeItem as removeFinykStorageItem } from "@finyk/lib/finykStorage";
import { PaywallModal, usePlan } from "../billing";
// V-8 (аудит Профілю/Налаштувань 2026-08-08): раніше тут був локальний
// `ConfirmModal` із `SettingsPrimitives` — друга оболонка підтвердження з
// власним затемненням і, головне, без `createPortal`: вона малювалась у
// потоці батька, тож усередині glass-картки Налаштувань її обрізало.
// Канонічна оболонка одна — `ConfirmDialog`, вона портальна.
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { SettingsSubGroup } from "./SettingsPrimitives";
import { MonoTokenInlineForm } from "./MonoTokenInlineForm";

type ConfirmKind = "cache" | "disconnect" | null;

interface FinykWebhookServiceSectionProps {
  inView: boolean;
}

const COPY = {
  paywallTitle: "Авто-Mono sync доступний у Pro",
  paywallDescription:
    "Free лишається для ручного ведення фінансів. Pro підключає серверний Monobank webhook, backfill і автоматичне оновлення транзакцій.",
  clearCacheTitle: "Очистити кеш?",
  disconnectTitle: "Вийти з Monobank?",
  clearCacheBody:
    "Буде видалено збережені транзакції в кеші. Потім дані підтягнуться з Monobank знову.",
  disconnectBody:
    "Webhook-зʼєднання буде відʼєднано. Щоб відновити, введи токен заново.",
  clear: "Очистити",
  exit: "Вийти",
  accounts: "рахунків",
  disconnect: "Відʼєднати",
  tokenHelp:
    "Токен відправляється на сервер і не зберігається у браузері. Mono → Налаштування → Інші → API.",
  connect: "Підключити Monobank",
  serviceTitle: "Сервіс",
  serviceHelp:
    "Дані Monobank приходять автоматично через webhook та оновлюються при поверненні у вкладку. Якщо потрібно примусово перепитати сервер, натисни «Оновити дані». Якщо список операцій виглядає некоректно, очисти кеш і синхронізуй знову.",
  refreshing: "Оновлення…",
  refresh: "Оновити дані",
  clearTransactions: "Очистити кеш транзакцій",
  // L-15: `GET /api/mono/sync-state` може впасти через мережу/5xx —
  // окремо від чесного "ще не підключено". Раніше обидва стани малювали
  // однакову форму вводу токена, тож юзер із живим підключенням бачив
  // прохання "підключити Monobank" через тимчасовий збій перевірки.
  checkFailed:
    "Не вдалося перевірити стан підключення Monobank. Це не означає, що підключення втрачено, перевір мережу і спробуй ще раз.",
  retryCheck: "Спробувати ще раз",
  // F7 (review): сусідня кнопка «Оновити дані» показує busy-стан
  // (`disabled` + «Оновлення…») під час запиту — ретрай тут мав ту саму
  // прогалину: без цього тап на повільній мережі виглядав мертвим.
  checking: "Перевіряю…",
  // Перевірка живості токена (міграція 120). Формулювання навмисно не
  // звинувачує людину й не каже «помилка»: найчастіша причина — вона сама
  // відкликала токен у Monobank, і це нормальна дія, а не поломка.
  reconnectTitle: "Monobank втратив звʼязок",
  reconnectBody:
    "Monobank більше не приймає збережений токен, найчастіше так буває, якщо його відкликали в застосунку банку. Транзакції не оновлюються. Встав новий токен, щоб відновити: Mono → Налаштування → Інші → API.",
  reconnect: "Підключити новий токен",
} as const;

export function FinykWebhookServiceSection({
  inView,
}: FinykWebhookServiceSectionProps) {
  const queryClient = useQueryClient();
  const { isPro } = usePlan();
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [webhookTokenInput, setWebhookTokenInput] = useState("");
  const [webhookConnecting, setWebhookConnecting] = useState(false);
  const [webhookError, setWebhookError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const syncStateQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    enabled: inView,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const webhookSyncState = syncStateQuery.data ?? null;
  // `invalid` — це підключення, яке БУЛО живим і перестало: сервер сходив
  // у Monobank і дістав явну відмову в авторизації (перевірка живості
  // токена, міграція 120). Раніше такий статус потрапляв у
  // `webhookConnected` разом з `active`/`pending` і малював той самий блок
  // «підключено», тільки з червоною крапкою — тобто повідомляв про
  // проблему й водночас не давав жодного способу її полагодити, крім
  // «Відʼєднати» наосліп. Тепер це окрема гілка з формою нового токена.
  const webhookNeedsReconnect = webhookSyncState?.status === "invalid";
  const webhookConnected =
    webhookSyncState != null &&
    webhookSyncState.status !== "disconnected" &&
    !webhookNeedsReconnect;
  // L-15: query-помилка (мережа/5xx/timeout) — це НЕ те саме, що чесний
  // "disconnected" статус із валідної відповіді сервера. Без цього
  // розрізнення `webhookConnected === false` і в обох випадках рендерився
  // той самий "підключи Monobank" екран.
  //
  // F2 (review): `isError` саме по собі не розрізняє тимчасовий збій
  // (мережа/5xx — власне випадок L-15) від ПОСТІЙНОЇ HTTP-помилки (напр.
  // 404, коли `MONO_WEBHOOK_ENABLED=false` на сервері, або 401/403).
  // Для таких кодів "спробувати ще раз" ніколи не допоможе — і без цього
  // звуження `webhookCheckFailed` намертво ховав форму підключення позаду
  // банера, що бреше про мережу. `isRetriableError` (той самий гейт, що
  // й `queryClient`-ретраї) відсіює саме нересурсні/постійні помилки —
  // для них рендер провалюється до звичайної форми токена.
  const webhookCheckFailed =
    syncStateQuery.isError &&
    !webhookConnected &&
    isRetriableError(syncStateQuery.error);
  const { progress: backfillProgress } = useMonoBackfillProgress({
    enabled: inView && webhookConnected,
  });

  const connectWebhook = async () => {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    const clean = webhookTokenInput.trim();
    if (!clean) {
      setWebhookError("Введи токен");
      return;
    }
    setWebhookConnecting(true);
    setWebhookError("");
    try {
      await monoWebhookApi.connect(clean, {
        signal: AbortSignal.timeout(30_000),
      });
      setWebhookTokenInput("");
      await queryClient.invalidateQueries({
        queryKey: finykKeys.monoSyncState,
      });
      queryClient.invalidateQueries({
        queryKey: finykKeys.monoWebhookAccounts,
      });
      queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    } catch (error) {
      if (isApiError(error) && error.kind === "http" && error.isAuth) {
        setWebhookError(
          error.serverMessage ||
            "Токен Monobank недійсний або закінчився. Онови токен.",
        );
      } else if (isApiError(error) && error.kind === "aborted") {
        setWebhookError("Monobank API не відповідає. Спробуй пізніше.");
      } else {
        setWebhookError(
          error instanceof Error && error.message
            ? error.message
            : "Помилка підключення",
        );
      }
    } finally {
      setWebhookConnecting(false);
    }
  };

  const disconnectWebhook = async () => {
    setWebhookError("");
    try {
      await monoWebhookApi.disconnect();
    } catch (error) {
      setWebhookError(
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося відʼєднати Monobank",
      );
      return;
    }
    queryClient.removeQueries({ queryKey: finykKeys.mono });
    queryClient.removeQueries({ queryKey: finykKeys.monoSyncState });
    queryClient.removeQueries({ queryKey: finykKeys.monoWebhookAccounts });
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
  };

  const triggerBackfill = async () => {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    setWebhookError("");
    try {
      await monoWebhookApi.backfill();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState }),
        queryClient.invalidateQueries({
          queryKey: finykKeys.monoBackfillProgress,
        }),
      ]);
    } catch (error) {
      setWebhookError(
        error instanceof Error && error.message
          ? error.message
          : "Помилка re-sync",
      );
    }
  };

  const clearTxCache = () => {
    removeFinykStorageItem("finyk_tx_cache");
    removeFinykStorageItem("finyk_tx_cache_last_good");
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    queryClient.removeQueries({
      queryKey: finykKeys.monoWebhookTransactions(),
    });
    queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState });
  };

  const refreshAllData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: finykKeys.mono }),
        queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState }),
        queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        surface="mono_auto_sync"
        title={COPY.paywallTitle}
        description={COPY.paywallDescription}
      />
      <ConfirmDialog
        open={confirmKind !== null}
        title={
          confirmKind === "cache" ? COPY.clearCacheTitle : COPY.disconnectTitle
        }
        description={
          confirmKind === "cache" ? COPY.clearCacheBody : COPY.disconnectBody
        }
        confirmLabel={confirmKind === "cache" ? COPY.clear : COPY.exit}
        danger={confirmKind === "disconnect"}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === "cache") clearTxCache();
          if (confirmKind === "disconnect") disconnectWebhook();
          setConfirmKind(null);
        }}
      />

      <SettingsSubGroup title="Monobank (Webhook)">
        {webhookConnected && webhookSyncState ? (
          <div className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border",
                webhookSyncState.status === "active"
                  ? "bg-bg border-success/30"
                  : webhookSyncState.status === "pending"
                    ? "bg-bg border-warning/30"
                    : "bg-bg border-danger/30",
              )}
            >
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  webhookSyncState.status === "active"
                    ? "bg-success"
                    : webhookSyncState.status === "pending"
                      ? "bg-warning"
                      : "bg-danger",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-style-label">
                  {webhookSyncState.status === "active"
                    ? "Webhook активний"
                    : webhookSyncState.status === "pending"
                      ? "Webhook очікує"
                      : "Помилка webhook"}
                </div>
                <div className="text-style-caption text-subtle mt-0.5">
                  {webhookSyncState.accountsCount} {COPY.accounts}
                  {webhookSyncState.lastEventAt && (
                    <>
                      {" · "}
                      {new Date(webhookSyncState.lastEventAt).toLocaleString(
                        "uk-UA",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                          timeZone: "Europe/Kyiv",
                        },
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 h-11"
                onClick={triggerBackfill}
                disabled={backfillProgress?.status === "running"}
              >
                {backfillProgress?.status === "running"
                  ? "Повторна синхронізація…"
                  : "Синхронізувати історію"}
              </Button>
              <Button
                variant="danger"
                className="flex-1 h-11"
                onClick={() => setConfirmKind("disconnect")}
              >
                {COPY.disconnect}
              </Button>
            </div>
            <BackfillProgressPill progress={backfillProgress} />
          </div>
        ) : webhookNeedsReconnect ? (
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
                <div className="text-style-label">{COPY.reconnectTitle}</div>
                <p className="text-style-caption text-subtle mt-0.5 leading-snug">
                  {COPY.reconnectBody}
                </p>
              </div>
            </div>
            <MonoTokenInlineForm
              value={webhookTokenInput}
              onChange={setWebhookTokenInput}
              onSubmit={connectWebhook}
              submitting={webhookConnecting}
              submitLabel={COPY.reconnect}
              help={null}
            />
            <Button
              variant="danger"
              className="w-full h-11"
              onClick={() => setConfirmKind("disconnect")}
            >
              {COPY.disconnect}
            </Button>
          </div>
        ) : webhookCheckFailed ? (
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
              onClick={() => syncStateQuery.refetch()}
              disabled={syncStateQuery.isFetching}
            >
              <Icon name="refresh-cw" size={16} aria-hidden />
              {syncStateQuery.isFetching ? COPY.checking : COPY.retryCheck}
            </Button>
          </div>
        ) : (
          <MonoTokenInlineForm
            value={webhookTokenInput}
            onChange={setWebhookTokenInput}
            onSubmit={connectWebhook}
            submitting={webhookConnecting}
            submitLabel={COPY.connect}
            help={COPY.tokenHelp}
          />
        )}
        {webhookError && (
          <p
            className="text-style-body text-danger bg-danger/10 rounded-xl px-3 py-2"
            role="alert"
          >
            {webhookError}
          </p>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title={COPY.serviceTitle}>
        <p className="text-style-caption text-subtle leading-snug">
          {COPY.serviceHelp}
        </p>
        <Button
          variant="ghost"
          className="w-full h-11"
          onClick={refreshAllData}
          disabled={refreshing}
        >
          <Icon name="refresh-cw" size={16} aria-hidden />
          {refreshing ? COPY.refreshing : COPY.refresh}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-11"
          onClick={() => setConfirmKind("cache")}
        >
          <Icon name="trash" size={16} aria-hidden />
          {COPY.clearTransactions}
        </Button>
      </SettingsSubGroup>
    </>
  );
}
