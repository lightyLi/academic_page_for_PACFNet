/**
 * Local ECG/PCG upload with same-stem pairing and authoritative hash verification.
 * Chrome/Edge: File System Access API with directory-handle resume.
 * Other browsers: file input / webkitdirectory fallback.
 */

(function (global) {
  "use strict";

  const helpers = global.PACFNetUploadHelpers;
  if (!helpers) {
    console.error(
      "[upload] PACFNetUploadHelpers missing; load upload_helpers.js first"
    );
    return;
  }

  const {
    ERRORS,
    parseSignalName,
    pairFilesByStem,
    resolvePeerFileName,
    hoursLeft,
  } = helpers;

  const DB_NAME = "pacfnet_upload_v1";
  const DB_VERSION = 1;
  const SESSION_STORE = "sessions";
  const PREFS_STORE = "prefs";
  const PREFS_KEY = "last";
  const TTL_MS = 24 * 60 * 60 * 1000;
  const VERIFY_TIMEOUT_MS = 5000;

  function UploadError(reason, message) {
    const err = new Error(message || ERRORS[reason] || reason);
    err.reason = reason;
    err.name = "UploadError";
    return err;
  }

  function supportsFsAccess() {
    return typeof global.showDirectoryPicker === "function";
  }

  async function sha256Hex(blob) {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PREFS_STORE)) {
          db.createObjectStore(PREFS_STORE, { keyPath: "key" });
        }
      };
    });
  }

  async function purgeExpired() {
    const now = Date.now();
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readonly");
      const req = tx.objectStore(SESSION_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const expired = rows.filter(
      (session) => !session.expiresAt || session.expiresAt <= now
    );
    if (!expired.length) {
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      const store = tx.objectStore(SESSION_STORE);
      expired.forEach((session) => store.delete(session.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveSession(session) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readwrite");
      tx.objectStore(SESSION_STORE).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSession(id) {
    await purgeExpired();
    const db = await openDb();
    const session = await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, "readonly");
      const req = tx.objectStore(SESSION_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_STORE, "readwrite");
        tx.objectStore(SESSION_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return null;
    }
    return session;
  }

  async function savePrefs(prefs) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS_STORE, "readwrite");
      tx.objectStore(PREFS_STORE).put({ key: PREFS_KEY, ...prefs });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getPrefs() {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(PREFS_STORE, "readonly");
      const req = tx.objectStore(PREFS_STORE).get(PREFS_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!row) {
      return null;
    }
    const { key, ...prefs } = row;
    return prefs;
  }

  async function ensureDirectoryPermission(dirHandle) {
    if (!dirHandle) {
      return false;
    }
    const opts = { mode: "read" };
    if ((await dirHandle.queryPermission(opts)) === "granted") {
      return true;
    }
    if ((await dirHandle.requestPermission(opts)) === "granted") {
      return true;
    }
    return false;
  }

  async function listDirectoryFileNames(dirHandle) {
    const names = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        names.push(entry.name);
      }
    }
    return names;
  }

  async function pairFromDirectoryHandle(dirHandle, selectedName) {
    const names = await listDirectoryFileNames(dirHandle);
    const resolved = resolvePeerFileName(names, selectedName);
    if (!resolved.ok) {
      throw UploadError(resolved.reason);
    }

    let selectedHandle;
    let peerHandle;
    try {
      selectedHandle = await dirHandle.getFileHandle(resolved.selectedName);
      peerHandle = await dirHandle.getFileHandle(resolved.peerName);
    } catch (err) {
      throw UploadError("PAIR_NOT_FOUND");
    }

    const selectedFile = await selectedHandle.getFile();
    const peerFile = await peerHandle.getFile();
    const wavFile =
      resolved.selectedExt === "wav" ? selectedFile : peerFile;
    const datFile =
      resolved.selectedExt === "dat" ? selectedFile : peerFile;

    return {
      localStem: resolved.localStem,
      wavFile,
      datFile,
      wavName: wavFile.name,
      datName: datFile.name,
      directoryHandle: dirHandle,
      mode: "fs-access",
    };
  }

  function signalFilePickerTypes() {
    // Keep filters broad: macOS often greys out .dat when MIME types are too strict.
    return [
      {
        description: "ECG/PCG signals (.wav / .dat)",
        accept: {
          "audio/wav": [".wav"],
          "audio/x-wav": [".wav"],
          "audio/*": [".wav"],
          "application/octet-stream": [".dat"],
          "application/x-dat": [".dat"],
          "text/plain": [".dat"],
        },
      },
    ];
  }

  async function pickFileInDirectory(dirHandle, preferredName) {
    if (typeof global.showOpenFilePicker === "function") {
      setUploadUiState({
        busy: true,
        message:
          "Step 2/2: Select one .wav or .dat file — the matching pair in this folder is detected automatically.",
        error: "",
      });
      const pickerOpts = {
        multiple: false,
        excludeAcceptAllOption: false,
        types: signalFilePickerTypes(),
      };
      if (dirHandle) {
        pickerOpts.startIn = dirHandle;
      }
      const [fileHandle] = await global.showOpenFilePicker(pickerOpts);
      const file = await fileHandle.getFile();
      return file.name;
    }

    if (preferredName) {
      return preferredName;
    }

    const names = await listDirectoryFileNames(dirHandle);
    const first = names.find((n) => parseSignalName(n));
    if (!first) {
      throw UploadError("PAIR_NOT_FOUND");
    }
    return first;
  }

  async function pickWithFsAccess(prefs) {
    // Resume previously authorized folder when possible.
    if (prefs && prefs.directoryHandle) {
      const allowed = await ensureDirectoryPermission(prefs.directoryHandle);
      if (!allowed) {
        throw UploadError("FOLDER_PERMISSION_DENIED");
      }
      try {
        const fileName =
          (prefs.fileNames && prefs.fileNames.find((n) => /\.wav$/i.test(n))) ||
          (prefs.fileNames && prefs.fileNames[0]) ||
          `${prefs.localStem}.wav`;
        return await pairFromDirectoryHandle(prefs.directoryHandle, fileName);
      } catch (err) {
        if (err && err.reason === "PAIR_NOT_FOUND") {
          const selectedName = await pickFileInDirectory(
            prefs.directoryHandle,
            null
          );
          return await pairFromDirectoryHandle(
            prefs.directoryHandle,
            selectedName
          );
        }
        throw err;
      }
    }

    // Step 1: directory picker greys out files on purpose — user must Select the folder.
    setUploadUiState({
      busy: true,
      message:
        "Step 1/2: Select the folder that contains your signals. Files are greyed out here — click Select on the folder.",
      error: "",
    });

    const dirHandle = await global.showDirectoryPicker({
      id: "pacfnet-signals",
      mode: "read",
    });

    const preferred =
      prefs && prefs.localStem ? `${prefs.localStem}.wav` : null;
    let selectedName = null;
    if (preferred) {
      const names = await listDirectoryFileNames(dirHandle);
      const hit = names.find(
        (n) => n.toLowerCase() === preferred.toLowerCase()
      );
      if (hit) {
        selectedName = hit;
      }
    }

    if (!selectedName) {
      selectedName = await pickFileInDirectory(dirHandle, preferred);
    }

    return await pairFromDirectoryHandle(dirHandle, selectedName);
  }

  function pickWithFallback(prefs) {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      // Direct file selection (not directory): choose both .wav and .dat together.
      input.accept = ".wav,.dat,audio/wav,audio/x-wav";
      input.multiple = true;

      setUploadUiState({
        busy: true,
        message:
          "Select both paired files together (.wav and .dat with the same filename).",
        error: "",
      });

      input.onchange = () => {
        const files = Array.from(input.files || []);
        const paired = pairFilesByStem(files, prefs);
        if (!paired.ok) {
          reject(UploadError(paired.reason));
          return;
        }
        resolve({
          localStem: paired.localStem,
          wavFile: paired.wavFile,
          datFile: paired.datFile,
          wavName: paired.wavName,
          datName: paired.datName,
          directoryHandle: null,
          mode: "fallback",
        });
      };

      input.oncancel = () => reject(UploadError("CANCELLED"));
      input.click();
    });
  }

  async function verifyWithServer(wavHash, datHash, signal) {
    let response;
    try {
      response = await fetch("/api/verify-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wavHash, datHash }),
        signal,
      });
    } catch (err) {
      if (err && (err.name === "AbortError" || signal?.aborted)) {
        throw UploadError("VERIFY_TIMEOUT");
      }
      throw UploadError("SERVER_ERROR");
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw UploadError("SERVER_ERROR");
    }

    if (!payload.ok) {
      throw UploadError(
        payload.reason || "SERVER_ERROR",
        payload.message || ERRORS[payload.reason] || ERRORS.SERVER_ERROR
      );
    }

    return payload;
  }

  function setUploadUiState({ busy, message, error }) {
    const button = document.getElementById("uploadLocalSignalsBtn");
    const spinner = document.getElementById("uploadSpinner");
    const status = document.getElementById("uploadStatusMessage");
    const errEl = document.getElementById("uploadErrorMessage");

    if (button) {
      button.disabled = !!busy;
      button.classList.toggle("is-loading", !!busy);
    }
    if (spinner) {
      spinner.style.display = busy ? "inline-flex" : "none";
    }
    if (status) {
      status.textContent = message || "";
      status.style.display = message ? "block" : "none";
      const isSuccess =
        typeof message === "string" && /^Verified as\b/i.test(message);
      status.classList.toggle("signal-note-success", isSuccess);
      status.classList.toggle("signal-note-status", !isSuccess);
    }
    if (errEl) {
      errEl.textContent = error || "";
      errEl.style.display = error ? "block" : "none";
    }
  }

  async function applyVerifiedUpload(result) {
    if (typeof global.selectSignal === "function") {
      global.selectSignal(result.id, {
        localUpload: true,
        localStem: result.localStem,
        expiresAt: result.expiresAt,
      });
    }

    const localMeta = document.getElementById("selectedLocalMeta");
    if (localMeta) {
      localMeta.style.display = "inline-flex";
      localMeta.textContent = `Local · ${hoursLeft(result.expiresAt)}h left · ${result.localStem}.wav/.dat`;
    }
  }

  async function runUploadPipeline(pair, abortSignal) {
    const wavHash = await sha256Hex(pair.wavFile);
    const datHash = await sha256Hex(pair.datFile);
    if (abortSignal.aborted) {
      throw UploadError("VERIFY_TIMEOUT");
    }

    const verified = await verifyWithServer(wavHash, datHash, abortSignal);
    const now = Date.now();
    const session = {
      id: verified.id,
      wavBlob: pair.wavFile,
      datBlob: pair.datFile,
      wavHash,
      datHash,
      localStem: pair.localStem,
      wavName: pair.wavName,
      datName: pair.datName,
      savedAt: now,
      expiresAt: now + TTL_MS,
      source: "upload",
    };

    await saveSession(session);
    await savePrefs({
      recordId: verified.id,
      localStem: pair.localStem,
      fileNames: [pair.wavName, pair.datName],
      mode: pair.mode,
      directoryHandle: pair.directoryHandle || undefined,
      updatedAt: now,
    });

    return {
      id: verified.id,
      localStem: pair.localStem,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Test/helper entry: verify an already-paired File/Blob pair without pickers.
   */
  async function verifyLocalPair(pair, options = {}) {
    const timeoutMs = options.timeoutMs || VERIFY_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await runUploadPipeline(
        {
          localStem: pair.localStem,
          wavFile: pair.wavFile,
          datFile: pair.datFile,
          wavName: pair.wavName || `${pair.localStem}.wav`,
          datName: pair.datName || `${pair.localStem}.dat`,
          directoryHandle: pair.directoryHandle || null,
          mode: pair.mode || "programmatic",
        },
        controller.signal
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function startLocalSignalUpload() {
    setUploadUiState({
      busy: true,
      message: supportsFsAccess()
        ? "Step 1/2: Select the folder that contains your signals. Files are greyed out here — click Select on the folder."
        : "Select both paired files together (.wav and .dat with the same filename).",
      error: "",
    });

    try {
      await purgeExpired();
      const prefs = await getPrefs();

      let pair;
      try {
        if (supportsFsAccess()) {
          pair = await pickWithFsAccess(prefs);
        } else {
          if (prefs && prefs.mode === "fallback") {
            setUploadUiState({
              busy: true,
              message: ERRORS.FALLBACK_RESELECT_REQUIRED,
              error: "",
            });
          }
          pair = await pickWithFallback(prefs);
        }
      } catch (err) {
        if (err && err.name === "AbortError") {
          throw UploadError("CANCELLED");
        }
        if (err && err.name === "UploadError") {
          throw err;
        }
        if (err && err.name === "NotAllowedError") {
          throw UploadError("FOLDER_PERMISSION_DENIED");
        }
        throw err;
      }

      setUploadUiState({
        busy: true,
        message: "Verifying against hosted training-a…",
        error: "",
      });

      const result = await verifyLocalPair(pair);

      setUploadUiState({
        busy: false,
        message: `Verified as ${result.id}`,
        error: "",
      });
      await applyVerifiedUpload(result);
      return result;
    } catch (err) {
      const reason = (err && err.reason) || "SERVER_ERROR";
      const message =
        reason === "CANCELLED"
          ? ""
          : (err && err.message) || ERRORS[reason] || ERRORS.SERVER_ERROR;
      setUploadUiState({
        busy: false,
        message: "",
        error: message,
      });
      if (reason !== "CANCELLED") {
        console.error("[upload]", err);
      }
      return null;
    }
  }

  async function getLocalSignalBlobs(id) {
    const session = await getSession(id);
    if (!session) {
      return null;
    }
    return {
      id: session.id,
      wavBlob: session.wavBlob,
      datBlob: session.datBlob,
      localStem: session.localStem,
      expiresAt: session.expiresAt,
    };
  }

  global.PACFNetUpload = {
    startLocalSignalUpload,
    verifyLocalPair,
    getLocalSignalBlobs,
    purgeExpired,
    getPrefs,
    getSession,
    supportsFsAccess,
    pairFilesByStem,
    parseSignalName,
    ERRORS,
  };

  function showUploadGuide() {
    const modal = document.getElementById("uploadGuideModal");
    if (modal) {
      modal.classList.add("is-active");
    }
  }

  function closeUploadGuide() {
    const modal = document.getElementById("uploadGuideModal");
    if (modal) {
      modal.classList.remove("is-active");
    }
  }

  function confirmUploadGuide() {
    closeUploadGuide();
    // Defer so the modal closes before the native picker opens.
    setTimeout(() => {
      startLocalSignalUpload().catch((err) => {
        console.error("[upload]", err);
      });
    }, 50);
  }

  global.showUploadGuide = showUploadGuide;
  global.closeUploadGuide = closeUploadGuide;
  global.confirmUploadGuide = confirmUploadGuide;
  global.startLocalSignalUpload = function startLocalSignalUploadSafe() {
    return startLocalSignalUpload().catch((err) => {
      console.error("[upload]", err);
      return null;
    });
  };
  global.getLocalSignalBlobs = getLocalSignalBlobs;
  global.verifyLocalPair = verifyLocalPair;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      purgeExpired().catch(() => {});
    });
  } else {
    purgeExpired().catch(() => {});
  }
})(window);
