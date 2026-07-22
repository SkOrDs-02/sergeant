/** @status Active */

export const finykPageMessages = {
  reportHeading: "Фінік (витрати)",
  addLimitOrGoal: "+ Додати ліміт або ціль",
  budgetOverLimit: "перевищено",
  budgetOverSixtyPercent: "· понад 60% ліміту",
  transactionsFilterLabel: "Фільтр транзакцій",
  nonUahAssetsExcluded: {
    one: "актив в іноземній валюті не враховую в нетворсі",
    few: "активи в іноземній валюті не враховую в нетворсі",
    many: "активів в іноземній валюті не враховую в нетворсі",
  },
  monoConnectErrors: {
    tokenRejected: "Mono відхилив токен. Перевір, чи скопіював правильний.",
    networkUnavailable: "Не вдалось зв'язатись з Mono. Перевір з'єднання.",
  },
} as const;
