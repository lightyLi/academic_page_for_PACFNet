const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeClampedView,
  computeSteppedView,
  computeResetView,
  MIN_VIEW_SECONDS,
} = require("../static/js/signal_view_math.js");

describe("signal view clamp limits", () => {
  it("keeps view inside [0, total]", () => {
    const view = computeClampedView(-100, -50, 35.7);
    assert.ok(view.min >= 0);
    assert.ok(view.max <= 35.7 + 1e-9);
    assert.ok(view.max > view.min);
  });

  it("rejects huge negative escaped windows", () => {
    const view = computeClampedView(-1175806625.4, -1044563015.1, 40);
    assert.equal(view.min, 0);
    assert.ok(view.max <= 40);
    assert.ok(view.max - view.min >= MIN_VIEW_SECONDS - 1e-9);
  });

  it("clamps overshoot past the end", () => {
    const view = computeClampedView(38, 50, 40);
    assert.ok(view.max <= 40 + 1e-9);
    assert.ok(view.min >= 0);
    assert.ok(Math.abs(view.max - view.min - (40 - view.min < 5 ? view.max - view.min : 5)) < 5 || view.max === 40);
    assert.equal(view.max, 40);
  });

  it("enforces minimum span", () => {
    const view = computeClampedView(1, 1.01, 40, 0.2);
    assert.ok(view.max - view.min >= 0.2 - 1e-9);
  });

  it("full-span view stays fixed", () => {
    const view = computeClampedView(0, 40, 40);
    assert.deepEqual(view, { min: 0, max: 40 });
  });
});

describe("signal view step and reset", () => {
  it("steps by half window and stays clamped", () => {
    const start = computeClampedView(0, 5, 40);
    const right = computeSteppedView(start.min, start.max, 40, 1);
    assert.ok(Math.abs(right.min - 2.5) < 1e-9);
    assert.ok(Math.abs(right.max - 7.5) < 1e-9);

    const far = computeSteppedView(37, 42, 40, 1);
    assert.equal(far.max, 40);
    assert.ok(far.min >= 0);
  });

  it("reset returns to initial window", () => {
    assert.deepEqual(computeResetView(40), { min: 0, max: 5 });
    assert.deepEqual(computeResetView(3.2), { min: 0, max: 3.2 });
  });
});
