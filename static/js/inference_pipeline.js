/**
 * PACFNet inference pipeline: preprocess + staged runner + event bus.
 * Preprocess order: full-series z-score (per modality) → 1s segments → drop tail.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InferencePipeline = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SAMPLE_RATE = 2000;
  const WINDOW_SAMPLES = 2000; // 1.0 s
  const EPS = 1e-8;

  function meanStd(arr) {
    const n = arr.length;
    if (!n) return { mean: 0, std: 0 };
    let sum = 0;
    for (let i = 0; i < n; i++) sum += arr[i];
    const mean = sum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = arr[i] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / n);
    return { mean, std };
  }

  function zscoreInPlace(arr) {
    const { mean, std } = meanStd(arr);
    const denom = std + EPS;
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = (arr[i] - mean) / denom;
    }
    return { values: out, mean, std };
  }

  /**
   * Z-score full effective series, then non-overlapping 1s windows; drop remainder.
   */
  function prepareSegments(ecgSamples, pcgSamples, sampleRate = SAMPLE_RATE) {
    const rate = sampleRate || SAMPLE_RATE;
    const windowSamples = Math.round(rate); // 1 second
    const ecgLen = ecgSamples?.length || 0;
    const pcgLen = pcgSamples?.length || 0;
    const effectiveLen = Math.min(ecgLen, pcgLen);

    if (effectiveLen < windowSamples) {
      return {
        sampleRate: rate,
        windowSamples,
        effectiveLen,
        effectiveSeconds: effectiveLen / rate,
        ecgSeconds: ecgLen / rate,
        pcgSeconds: pcgLen / rate,
        segmentCount: 0,
        discardedSamples: effectiveLen,
        discardedSeconds: effectiveLen / rate,
        segments: [],
        ecgStats: { mean: 0, std: 0 },
        pcgStats: { mean: 0, std: 0 },
        order: "zscore_then_segment",
        norm: "zscore_full_modality",
      };
    }

    const ecgEff = ecgSamples.slice
      ? ecgSamples.slice(0, effectiveLen)
      : Float32Array.from(ecgSamples).subarray(0, effectiveLen);
    const pcgEff = pcgSamples.slice
      ? pcgSamples.slice(0, effectiveLen)
      : Float32Array.from(pcgSamples).subarray(0, effectiveLen);

    const ecgZ = zscoreInPlace(ecgEff);
    const pcgZ = zscoreInPlace(pcgEff);

    const segmentCount = Math.floor(effectiveLen / windowSamples);
    const kept = segmentCount * windowSamples;
    const discardedSamples = effectiveLen - kept;
    const segments = [];

    for (let i = 0; i < segmentCount; i++) {
      const start = i * windowSamples;
      const end = start + windowSamples;
      segments.push({
        index: i,
        ecg: ecgZ.values.subarray(start, end),
        pcg: pcgZ.values.subarray(start, end),
      });
    }

    return {
      sampleRate: rate,
      windowSamples,
      effectiveLen,
      effectiveSeconds: effectiveLen / rate,
      ecgSeconds: ecgLen / rate,
      pcgSeconds: pcgLen / rate,
      segmentCount,
      discardedSamples,
      discardedSeconds: discardedSamples / rate,
      segments,
      ecgStats: { mean: ecgZ.mean, std: ecgZ.std },
      pcgStats: { mean: pcgZ.mean, std: pcgZ.std },
      order: "zscore_then_segment",
      norm: "zscore_full_modality",
    };
  }

  function majorityVote(segmentLabels) {
    let normal = 0;
    let abnormal = 0;
    for (const label of segmentLabels) {
      if (label === 1) abnormal++;
      else normal++;
    }
    const total = normal + abnormal;
    const isAbnormal = abnormal > normal;
    const win = Math.max(normal, abnormal);
    return {
      normal,
      abnormal,
      label: total === 0 ? -1 : isAbnormal ? 1 : -1,
      confidence: total === 0 ? 0 : (win / total) * 100,
      total,
    };
  }

  function createEmitter() {
    const listeners = new Set();
    return {
      on(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      emit(event) {
        const payload = { t: performance.now?.() ?? Date.now(), ...event };
        listeners.forEach((fn) => {
          try {
            fn(payload);
          } catch (err) {
            console.error("InferencePipeline listener error:", err);
          }
        });
      },
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // Demo model session cache (mimics onnx session reuse).
  let demoModelReady = false;

  async function runModelPhase(emit, options = {}) {
    const forceReload = !!options.forceReload;
    emit({
      type: "phase_start",
      phase: "model",
      payload: { cached: demoModelReady && !forceReload },
    });

    if (demoModelReady && !forceReload) {
      emit({
        type: "phase_progress",
        phase: "model",
        payload: { progress: 1, cached: true },
      });
      await sleep(randBetween(220, 380));
      const detail = {
        status: "Ready (cached)",
        runtime: "Demo runtime (simulated weights)",
        artifact: "pacfnet.h5 → onnx (pending)",
        sizeMB: 153,
        loadSeconds: randBetween(0.22, 0.38),
        cached: true,
      };
      emit({ type: "phase_done", phase: "model", payload: { detail } });
      return detail;
    }

    const totalMs = randBetween(2200, 3400);
    const start = Date.now();
    let lastLogged = -1;
    while (true) {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / totalMs);
      const pct = Math.round(progress * 100);
      emit({
        type: "phase_progress",
        phase: "model",
        payload: { progress, percent: pct, cached: false },
      });
      if (pct >= 25 && lastLogged < 25) {
        lastLogged = 25;
      }
      if (progress >= 1) break;
      await sleep(80);
    }

    demoModelReady = true;
    const detail = {
      status: "Ready (downloaded)",
      runtime: "Demo runtime (simulated weights)",
      artifact: "pacfnet.h5 → onnx (pending)",
      sizeMB: 153,
      loadSeconds: totalMs / 1000,
      cached: false,
    };
    emit({ type: "phase_done", phase: "model", payload: { detail } });
    return detail;
  }

  async function runPrepPhase(emit, raw) {
    emit({
      type: "phase_start",
      phase: "prep",
      payload: {
        ecgSeconds: raw.ecgDuration,
        pcgSeconds: raw.pcgDuration,
      },
    });

    await sleep(randBetween(180, 320));
    emit({
      type: "phase_progress",
      phase: "prep",
      payload: { step: "zscore", progress: 0.15 },
    });

    // Mimic cost scaling with recording length.
    const scale = Math.min(
      1.8,
      Math.max(0.6, (raw.ecg?.length || 2000) / (SAMPLE_RATE * 30))
    );
    await sleep(randBetween(350, 700) * scale);
    emit({
      type: "phase_progress",
      phase: "prep",
      payload: { step: "zscore", progress: 0.55 },
    });

    const prepared = prepareSegments(raw.ecg, raw.pcg, raw.sampleRate || SAMPLE_RATE);

    emit({
      type: "phase_progress",
      phase: "prep",
      payload: {
        step: "segment",
        progress: 0.75,
        segmentCount: prepared.segmentCount,
        discardedSeconds: prepared.discardedSeconds,
      },
    });
    await sleep(randBetween(250, 480) * scale);

    const detail = {
      ecgSeconds: prepared.ecgSeconds,
      pcgSeconds: prepared.pcgSeconds,
      effectiveSeconds: prepared.effectiveSeconds,
      sampleRate: prepared.sampleRate,
      norm: prepared.norm,
      order: prepared.order,
      segmentCount: prepared.segmentCount,
      discardedSeconds: prepared.discardedSeconds,
      windowSamples: prepared.windowSamples,
      shape: "[1,1,2000] × 2",
      ecgStats: prepared.ecgStats,
      pcgStats: prepared.pcgStats,
    };

    emit({
      type: "phase_done",
      phase: "prep",
      payload: { detail, prepared },
    });
    return prepared;
  }

  async function runInferPhase(emit, prepared, options = {}) {
    const accuracy = options.accuracy ?? 0.9777;
    const groundTruth = options.groundTruth;
    const total = prepared.segmentCount;

    emit({
      type: "phase_start",
      phase: "infer",
      payload: { total },
    });

    if (total <= 0) {
      const detail = {
        total: 0,
        avgMs: 0,
        totalSeconds: 0,
        normal: 0,
        abnormal: 0,
        results: [],
      };
      emit({ type: "phase_done", phase: "infer", payload: { detail } });
      return detail;
    }

    const results = [];
    let normal = 0;
    let abnormal = 0;
    const t0 = Date.now();

    for (let i = 0; i < total; i++) {
      // Mimic per-segment classifier latency (~80–160 ms).
      await sleep(randBetween(80, 160));

      let label;
      if (groundTruth === 1 || groundTruth === -1) {
        const isCorrect = Math.random() < accuracy;
        label = isCorrect ? groundTruth : -groundTruth;
      } else {
        label = Math.random() < 0.5 ? 1 : -1;
      }
      const p = randBetween(0.62, 0.97);
      if (label === 1) abnormal++;
      else normal++;

      const seg = { index: i, label, p };
      results.push(seg);

      emit({
        type: "segment_result",
        phase: "infer",
        payload: {
          index: i,
          total,
          label,
          p,
          normal,
          abnormal,
          current: i + 1,
        },
      });

      if ((i + 1) % 5 === 0 || i === total - 1) {
        emit({
          type: "phase_progress",
          phase: "infer",
          payload: {
            current: i + 1,
            total,
            normal,
            abnormal,
            progress: (i + 1) / total,
          },
        });
      }
    }

    const totalMs = Date.now() - t0;
    const detail = {
      total,
      avgMs: totalMs / total,
      totalSeconds: totalMs / 1000,
      normal,
      abnormal,
      results,
      last: results[results.length - 1],
    };
    emit({ type: "phase_done", phase: "infer", payload: { detail } });
    return detail;
  }

  async function runVotePhase(emit, inferDetail) {
    emit({ type: "phase_start", phase: "vote", payload: {} });

    const labels = (inferDetail.results || []).map((r) => r.label);
    const vote = majorityVote(labels);

    // Animate tally climb
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      emit({
        type: "phase_progress",
        phase: "vote",
        payload: {
          normal: Math.round(vote.normal * f),
          abnormal: Math.round(vote.abnormal * f),
          progress: f,
        },
      });
      await sleep(randBetween(45, 75));
    }

    const detail = {
      strategy: "Majority vote",
      normal: vote.normal,
      abnormal: vote.abnormal,
      label: vote.label,
      confidence: vote.confidence,
      total: vote.total,
    };
    emit({ type: "phase_done", phase: "vote", payload: { detail, vote } });
    return detail;
  }

  /**
   * Full staged pipeline. options: { raw, groundTruth, accuracy, sampleId, forceReload }
   */
  async function runPipeline(options = {}) {
    const emit = options.emit || (() => {});
    const bus = typeof options.emit === "function" ? null : createEmitter();
    const fire = options.emit || bus.emit.bind(bus);

    const raw = options.raw;
    const sampleId = options.sampleId || raw?.signalName || "unknown";

    try {
      fire({
        type: "pipeline_start",
        phase: null,
        payload: { sampleId },
      });

      if (!raw?.ecg?.length || !raw?.pcg?.length) {
        throw new Error("Signal samples not available. Wait for ECG/PCG to load.");
      }

      const modelDetail = await runModelPhase(fire, options);
      const prepared = await runPrepPhase(fire, raw);

      if (prepared.segmentCount <= 0) {
        throw new Error(
          "Recording shorter than 1.0s after alignment; no segments to classify."
        );
      }

      const inferDetail = await runInferPhase(fire, prepared, options);
      const voteDetail = await runVotePhase(fire, inferDetail);

      const result = {
        sampleId,
        modelDetail,
        prepDetail: {
          ecgSeconds: prepared.ecgSeconds,
          pcgSeconds: prepared.pcgSeconds,
          effectiveSeconds: prepared.effectiveSeconds,
          sampleRate: prepared.sampleRate,
          norm: prepared.norm,
          order: prepared.order,
          segmentCount: prepared.segmentCount,
          discardedSeconds: prepared.discardedSeconds,
          windowSamples: prepared.windowSamples,
          shape: "[1,1,2000] × 2",
        },
        inferDetail,
        voteDetail,
        prediction: {
          label: voteDetail.label,
          isAbnormal: voteDetail.label === 1,
          confidence: voteDetail.confidence,
          normal: voteDetail.normal,
          abnormal: voteDetail.abnormal,
          total: voteDetail.total,
        },
      };

      fire({ type: "pipeline_done", phase: null, payload: result });
      return result;
    } catch (error) {
      fire({
        type: "pipeline_error",
        phase: null,
        payload: { message: error.message || String(error) },
      });
      throw error;
    }
  }

  return {
    SAMPLE_RATE,
    WINDOW_SAMPLES,
    meanStd,
    zscoreInPlace,
    prepareSegments,
    majorityVote,
    createEmitter,
    runPipeline,
    resetDemoModelCache() {
      demoModelReady = false;
    },
    isDemoModelReady() {
      return demoModelReady;
    },
  };
});
