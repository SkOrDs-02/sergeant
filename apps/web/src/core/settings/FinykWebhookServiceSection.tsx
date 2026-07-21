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
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { BackfillProgressPill } from "@finyk/components/BackfillProgressPill";
import { useMonoBackfillProgress } from "@finyk/hooks/useMonoBackfillProgress";
import { removeItem as removeFinykStorageItem } from "@finyk/lib/finykStorage";
import { PaywallModal, usePlan } from "../billing";
import { ConfirmModal, SettingsSubGroup } from "./SettingsPrimitives";

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
    "Webhook-з'єднання буде від'єднано. Щоб відновити — введіть токен заново.",
  clear: "Очистити",
  exit: "Вийти",
  accounts: "рахунків",
  disconnect: "Від'єднати",
  tokenHelp:
    "Токен відправляється на сервер і не зберігається у браузері. Mono → Налаштування → Інші → API.",
  tokenPlaceholder: "Токен Monobank API",
  hideToken: "Приховати токен",
  showToken: "Показати токен",
  connect: "Підключити Monobank",
  serviceTitle: "Сервіс",
  serviceHelp:
    "Дані Monobank приходять автоматично через webhook та оновлюються при поверненні у вкладку. Якщо потрібно примусово перепитати сервер — натисни «Оновити дані». Якщо список операцій виглядає некоректно — очисти кеш і синхронізуй знову.",
  refreshing: "Оновлення…",
  refresh: "Оновити дані",
  clearTransactions: "Очистити кеш транзакцій",
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
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const syncStateQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    enabled: inView,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const webhookSyncState = syncStateQuery.data ?? null;
  const webhookConnected =
    webhookSyncState != null && webhookSyncState.status !== "disconnected";
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
            "Токен Monobank недійсний або закінчився. Оновіть токен.",
        );
      } else if (isApiError(error) && error.kind === "aborted") {
        setWebhookError("Monobank API не відповідає. Спробуйте пізніше.");
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
      <ConfirmModal
        open={confirmKind !== null}
        title={
          confirmKind === "cache" ? COPY.clearCacheTitle : COPY.disconnectTitle
        }
        body={
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
                <div className="text-xs text-subtle mt-0.5">
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
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-subtle leading-snug">{COPY.tokenHelp}</p>
            <div className="relative">
              <input
                type={showWebhookToken ? "text" : "password"}
                value={webhookTokenInput}
                onChange={(event) => setWebhookTokenInput(event.target.value)}
                placeholder={COPY.tokenPlaceholder}
                autoComplete="off"
                className="input-focus-finyk w-full h-11 rounded-xl border border-line bg-panelHi px-3 pr-10 text-sm text-text"
                onKeyDown={(event) => event.key === "Enter" && connectWebhook()}
              />
              <button
                type="button"
                onClick={() => setShowWebhookToken((visible) => !visible)}
                className="focus-ring touch-target absolute right-0 top-1/2 -translate-y-1/2 rounded-xl text-subtle hover:text-text"
                aria-label={showWebhookToken ? COPY.hideToken : COPY.showToken}
              >
                <Icon
                  name={showWebhookToken ? "eye-off" : "eye"}
                  size={16}
                  aria-hidden
                />
              </button>
            </div>
            <Button
              className="w-full h-11"
              onClick={connectWebhook}
              disabled={webhookConnecting}
            >
              {webhookConnecting
                ? messages.loadingActions.connecting
                : COPY.connect}
            </Button>
          </div>
        )}
        {webhookError && (
          <p
            className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2"
            role="alert"
          >
            {webhookError}
          </p>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title={COPY.serviceTitle}>
        <p className="text-xs text-subtle leading-snug">{COPY.serviceHelp}</p>
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
