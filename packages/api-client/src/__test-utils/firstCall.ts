/**
 * Test helper: повертає перший mock-call (типізований кортеж аргументів)
 * або кидає AssertionError, якщо мок не викликали жодного разу.
 *
 * Існує спеціально для tsconfig `noUncheckedIndexedAccess: true` — без неї
 * `fn.mock.calls[0]` має тип `T | undefined` і кожний test треба було б
 * руками оголошувати `if (!call) throw ...`. Замість цього сайт-ами тестів
 * пишемо `const [url, init] = firstCall(fn)`.
 */
export function firstCall<T extends unknown[]>(fn: {
  mock: { calls: T[] };
}): T {
  const call = fn.mock.calls[0];
  if (!call) {
    throw new Error(
      "firstCall: expected mock to have been called at least once, got 0 calls",
    );
  }
  return call;
}
