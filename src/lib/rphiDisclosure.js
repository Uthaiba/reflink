/**
 * Applies primary small-cell suppression to an aggregate count.
 *
 * This helper is not a substitute for complementary suppression or
 * differencing controls when multiple overlapping aggregates are published.
 */
export function applySmallCellSuppression(count, minimumVisibleCount = 5) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError("count must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(minimumVisibleCount) || minimumVisibleCount < 2) {
    throw new TypeError("minimumVisibleCount must be a safe integer of at least 2.");
  }

  const suppressed = count > 0 && count < minimumVisibleCount;
  return {
    value: suppressed ? null : count,
    suppressed,
    reason: suppressed ? "SMALL_CELL" : null,
  };
}
