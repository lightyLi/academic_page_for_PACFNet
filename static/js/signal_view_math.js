/**
 * Pure math helpers for signal chart x-axis view windows.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SignalViewMath = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const INITIAL_VIEW_SECONDS = 5;
  const MIN_VIEW_SECONDS = 0.2;

  function clamp(value, min, max) {
    if (max <= min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function computeClampedView(
    min,
    max,
    totalDuration,
    minSpan = MIN_VIEW_SECONDS
  ) {
    const total = Math.max(0, Number(totalDuration) || 0);
    if (total <= 0 || !Number.isFinite(total)) {
      return { min: 0, max: 0 };
    }

    let lo = Number(min);
    let hi = Number(max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      const span = Math.min(INITIAL_VIEW_SECONDS, total);
      return { min: 0, max: span };
    }

    let span = hi - lo;
    const minSpanClamped = Math.min(Math.max(minSpan, 1e-6), total);
    if (span < minSpanClamped) span = minSpanClamped;
    if (span > total) span = total;

    lo = clamp(lo, 0, Math.max(0, total - span));
    hi = lo + span;
    if (hi > total) {
      hi = total;
      lo = Math.max(0, hi - span);
    }
    return { min: lo, max: hi };
  }

  function computeSteppedView(min, max, totalDuration, direction) {
    const view = computeClampedView(min, max, totalDuration);
    const span = view.max - view.min;
    const delta = (direction < 0 ? -1 : 1) * span * 0.5;
    return computeClampedView(
      view.min + delta,
      view.max + delta,
      totalDuration
    );
  }

  function computeResetView(totalDuration) {
    const total = Math.max(0, Number(totalDuration) || 0);
    const span = Math.min(INITIAL_VIEW_SECONDS, total);
    return { min: 0, max: span };
  }

  return {
    INITIAL_VIEW_SECONDS,
    MIN_VIEW_SECONDS,
    clamp,
    computeClampedView,
    computeSteppedView,
    computeResetView,
  };
});
