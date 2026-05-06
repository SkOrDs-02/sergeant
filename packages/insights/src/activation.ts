/** Input snapshot needed to evaluate activation_v2. */
export interface ActivationInput {
  /** Unix timestamp (ms) when the user signed up. */
  signedUpAt: number;
  /** Unix timestamp (ms) of the evaluation moment (defaults to Date.now() in helpers). */
  evaluatedAt: number;
  /** Number of Mono (bank) accounts connected by the user. */
  monoAccountsConnected: number;
  /** Number of transactions that have a non-null category assigned. */
  categorizedTransactions: number;
  /** Number of budgets the user has created. */
  budgetsCreated: number;
}

export interface ActivationResult {
  /** True when all three activation_v2 conditions are met within the 72h window. */
  activated: boolean;
  /** Individual condition outcomes for analytics / debugging. */
  conditions: {
    monoConnected: boolean;
    transactionsCategorized: boolean;
    budgetCreated: boolean;
    withinWindow: boolean;
  };
  /** Hours elapsed since signup at evaluation time. */
  hoursElapsed: number;
}

const WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
const MIN_MONO_ACCOUNTS = 1;
const MIN_CATEGORIZED_TXN = 5;
const MIN_BUDGETS = 1;

/**
 * Evaluates whether a user has reached activation_v2.
 *
 * activation_v2 = Mono connected ≥1 AND ≥5 transactions categorized AND ≥1 budget set,
 * all achieved within 72 h of signup.
 */
export function evaluateActivationV2(input: ActivationInput): ActivationResult {
  const {
    signedUpAt,
    evaluatedAt,
    monoAccountsConnected,
    categorizedTransactions,
    budgetsCreated,
  } = input;

  const elapsedMs = evaluatedAt - signedUpAt;
  const hoursElapsed = elapsedMs / (60 * 60 * 1000);

  const withinWindow = elapsedMs <= WINDOW_MS;
  const monoConnected = monoAccountsConnected >= MIN_MONO_ACCOUNTS;
  const transactionsCategorized =
    categorizedTransactions >= MIN_CATEGORIZED_TXN;
  const budgetCreated = budgetsCreated >= MIN_BUDGETS;

  const activated =
    withinWindow && monoConnected && transactionsCategorized && budgetCreated;

  return {
    activated,
    conditions: {
      monoConnected,
      transactionsCategorized,
      budgetCreated,
      withinWindow,
    },
    hoursElapsed,
  };
}

/** Convenience builder: evaluate at the current moment. */
export function evaluateActivationV2Now(
  input: Omit<ActivationInput, "evaluatedAt">,
): ActivationResult {
  return evaluateActivationV2({ ...input, evaluatedAt: Date.now() });
}
