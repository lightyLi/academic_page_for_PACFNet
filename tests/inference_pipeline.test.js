const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  prepareSegments,
  majorityVote,
  zscoreInPlace,
  SAMPLE_RATE,
  WINDOW_SAMPLES,
} = require("../static/js/inference_pipeline.js");

describe("prepareSegments order and math", () => {
  it("z-scores full series before slicing and drops the tail", () => {
    // 2.4 seconds @ 2000 Hz → 2 windows, discard 0.4s
    const n = Math.round(2.4 * SAMPLE_RATE);
    const ecg = Float32Array.from({ length: n }, (_, i) => i * 0.01);
    const pcg = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 50));

    const prepared = prepareSegments(ecg, pcg, SAMPLE_RATE);
    assert.equal(prepared.segmentCount, 2);
    assert.ok(Math.abs(prepared.discardedSeconds - 0.4) < 1e-9);
    assert.equal(prepared.order, "zscore_then_segment");
    assert.equal(prepared.norm, "zscore_full_modality");
    assert.equal(prepared.segments[0].ecg.length, WINDOW_SAMPLES);

    // Reconstruct kept prefix from segments and compare to full z-score prefix
    const fullZ = zscoreInPlace(ecg.subarray(0, prepared.effectiveLen)).values;
    const joined = new Float32Array(prepared.segmentCount * WINDOW_SAMPLES);
    prepared.segments.forEach((seg, i) => {
      joined.set(seg.ecg, i * WINDOW_SAMPLES);
    });
    for (let i = 0; i < joined.length; i++) {
      assert.ok(Math.abs(joined[i] - fullZ[i]) < 1e-6);
    }
  });

  it("uses min length across modalities", () => {
    const ecg = Float32Array.from({ length: 5000 }, () => 1);
    const pcg = Float32Array.from({ length: 3500 }, () => 2);
    const prepared = prepareSegments(ecg, pcg, SAMPLE_RATE);
    assert.equal(prepared.effectiveLen, 3500);
    assert.equal(prepared.segmentCount, 1);
    assert.equal(prepared.discardedSamples, 1500);
  });

  it("returns zero segments when shorter than 1s", () => {
    const ecg = Float32Array.from({ length: 500 }, () => 1);
    const pcg = Float32Array.from({ length: 500 }, () => 1);
    const prepared = prepareSegments(ecg, pcg, SAMPLE_RATE);
    assert.equal(prepared.segmentCount, 0);
  });
});

describe("majorityVote", () => {
  it("picks abnormal on majority and reports confidence", () => {
    const vote = majorityVote([1, 1, 1, -1, -1]);
    assert.equal(vote.label, 1);
    assert.equal(vote.abnormal, 3);
    assert.equal(vote.normal, 2);
    assert.ok(Math.abs(vote.confidence - 60) < 1e-9);
  });
});
