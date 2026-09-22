import { useState, useSyncExternalStore } from "react";

import { Button } from "@shared/components/ui/Button";
import {
  readDbOwnership,
  subscribeDbOwnership,
  takeOverDbOwnership,
} from "../db/dbOwnership";

/**
 * Last validated: 2026-09-22
 * Status: Active
 *
 * Екран вкладки, якій не дісталась локальна база.
 *
 * Чому екран, а не тихий фолбек. OPFS-пул замикає каталог цілком, тож друга
 * вкладка персистентного сховища не отримає ніколи. Раніше вона мовчки
 * відкривала власне сховище поруч — і показувала інші дані на тому самому
 * акаунті. Порожній застосунок замість даних не кращий: людина прочитає це
 * як «усе зникло». Тому стан називається вголос, а дія рівно одна.
 */
const COPY = {
  title: "Sergeant уже відкрито в іншій вкладці",
  body: "Дані лежать в одному сховищі, і працювати з ним може лише одна вкладка. Закрий зайву або перенеси роботу сюди.",
  action: "Працювати тут",
  pending: "Переношу…",
} as const;

export function DbBusyScreen() {
  const [pending, setPending] = useState(false);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-10 text-center safe-area-pt-pb">
      <h1 className="text-style-title text-balance">{COPY.title}</h1>
      <p className="max-w-sm text-style-body text-muted-foreground">
        {COPY.body}
      </p>
      <Button
        variant="solid"
        tone="neutral"
        disabled={pending}
        onClick={() => {
          setPending(true);
          // Перезавантаження робить сама `takeOverDbOwnership`, щойно лок
          // звільниться, тож `pending` навмисно не скидається.
          void takeOverDbOwnership();
        }}
      >
        {pending ? COPY.pending : COPY.action}
      </Button>
    </div>
  );
}

/** Чи тримає локальну базу інша вкладка. */
export function useDbIsBusyElsewhere(): boolean {
  return (
    useSyncExternalStore(
      subscribeDbOwnership,
      readDbOwnership,
      () => "unknown" as const,
    ) === "follower"
  );
}
