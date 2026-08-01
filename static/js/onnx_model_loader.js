/**
 * Real ONNX Runtime Web loader for PACFNet weights.
 * Only used in the Model stage; classification remains simulated.
 */
(function (root) {
  "use strict";

  const MODEL_URL = "static/models/pacfnet.onnx";
  const ORT_WASM_PATH =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
  const WEIGHTS_MB_FALLBACK = 44.8;

  let cachedSession = null;
  let cachedDetail = null;

  function getOrt() {
    if (typeof ort === "undefined") {
      throw new Error(
        "ONNX Runtime Web is not loaded. Check the ort.min.js script tag."
      );
    }
    return ort;
  }

  async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to download model (${response.status})`);
    }

    const totalHeader = Number(response.headers.get("content-length") || 0);
    if (!response.body || !response.body.getReader) {
      const buf = await response.arrayBuffer();
      if (onProgress) onProgress(1, buf.byteLength, buf.byteLength);
      return { buffer: buf, bytes: buf.byteLength };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (onProgress) {
        const total = totalHeader > 0 ? totalHeader : Math.max(received, 1);
        onProgress(Math.min(0.95, received / total), received, totalHeader);
      }
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (onProgress) onProgress(1, received, totalHeader || received);
    return { buffer: buffer.buffer, bytes: received };
  }

  async function smokeTest(session) {
    const ortApi = getOrt();
    const feeds = {};
    for (const name of ["ECG_Input", "PCG_Input"]) {
      feeds[name] = new ortApi.Tensor(
        "float32",
        new Float32Array(2000),
        [1, 2000, 1]
      );
    }
    const out = await session.run(feeds);
    const firstKey = Object.keys(out)[0];
    const tensor = out[firstKey];
    const shape = Array.from(tensor.dims || []);
    if (shape.length !== 2 || shape[1] !== 2) {
      throw new Error(`Unexpected smoke-test output shape: [${shape}]`);
    }
    return { outputName: firstKey, shape, ok: true };
  }

  /**
   * Load or reuse ORT session.
   * onProgress(progress01, meta)
   */
  async function loadPacfnetOnnx(options = {}) {
    const forceReload = !!options.forceReload;
    const onProgress = options.onProgress || (() => {});

    if (cachedSession && !forceReload) {
      const warmStart = performance.now();
      onProgress(1, { stage: "cache" });
      // Tiny await so UI can render warm-cache state.
      await new Promise((r) => setTimeout(r, 120));
      const loadSeconds = (performance.now() - warmStart) / 1000;
      const detail = {
        ...(cachedDetail || {}),
        status: "Ready",
        session: "Warm cache",
        runtime: `${loadSeconds.toFixed(2)} s`,
        loadSeconds,
        cached: true,
        provider: cachedDetail?.provider || "wasm",
      };
      return { session: cachedSession, detail };
    }

    const ortApi = getOrt();
    ortApi.env.wasm.wasmPaths = ORT_WASM_PATH;
    ortApi.env.wasm.numThreads = 1;

    const t0 = performance.now();
    onProgress(0.02, { stage: "download" });

    const { buffer, bytes } = await fetchWithProgress(
      MODEL_URL,
      (p, received, total) => {
        // Reserve 0–0.85 for download, 0.85–1.0 for session create/smoke.
        onProgress(0.02 + p * 0.83, {
          stage: "download",
          received,
          total,
          percent: Math.round(p * 100),
        });
      }
    );

    onProgress(0.88, { stage: "create" });
    const session = await ortApi.InferenceSession.create(buffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    onProgress(0.95, { stage: "smoke" });
    const smoke = await smokeTest(session);
    const loadSeconds = (performance.now() - t0) / 1000;
    const weightsMB = bytes / (1024 * 1024);

    const inputNames = session.inputNames || [];
    const outputNames = session.outputNames || [];

    const detail = {
      status: "Ready",
      session: "Cold start",
      runtime: `${loadSeconds.toFixed(2)} s`,
      loadSeconds,
      weightsMB: Number(weightsMB.toFixed(1)) || WEIGHTS_MB_FALLBACK,
      precision: "float32",
      inputLayout: "ECG_Input + PCG_Input · [B,2000,1]",
      provider: "wasm",
      inputs: inputNames.join(", "),
      outputs: outputNames.join(", "),
      smoke: `ok · out=[${smoke.shape.join(",")}]`,
      artifact: "pacfnet.onnx",
      cached: false,
      realOnnx: true,
    };

    cachedSession = session;
    cachedDetail = detail;
    if (typeof root !== "undefined") {
      root.pacfnetSession = session;
      root.pacfnetModelDetail = detail;
    }

    onProgress(1, { stage: "done" });
    return { session, detail };
  }

  function isOnnxReady() {
    return !!cachedSession;
  }

  function resetOnnxCache() {
    cachedSession = null;
    cachedDetail = null;
    if (typeof root !== "undefined") {
      root.pacfnetSession = null;
      root.pacfnetModelDetail = null;
    }
  }

  root.OnnxModelLoader = {
    MODEL_URL,
    loadPacfnetOnnx,
    isOnnxReady,
    resetOnnxCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
