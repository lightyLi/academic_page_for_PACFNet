/**
 * Local ECG/PCG upload with same-stem pairing and authoritative hash verification.
 * Chrome/Edge: File System Access API with directory-handle resume.
 * Other browsers: file input / webkitdirectory fallback.
 */

(function (global) {
  "use strict";

  const DB_NAME = "pacfnet_upload_v1";
  const DB_VERSION = 1;
  const SESSION_STORE = "sessions";
  const PREFS_STORE = "prefs";
  const PREFS_KEY = "last";
  const TTL_MS = 24 * 60 * 60 * 1000;
  const VERIFY_TIMEOUT_MS = 5000;

  const ERRORS = {
    INVALID_EXTENSION:
      "Please select a .wav (PCG) or .dat (ECG) file",
    PAIR_NOT_FOUND:
      "Paired ECG/PCG not found: expected the same filename with the other extension in this folder",
    NOT_IN_DATASET:
      "These files do not match any hosted PhysioNet 2016 training-a sample",
    HASH_MISMATCH:
      "ECG and PCG do not match the same hosted record (or content was modified)",
    VERIFY_TIMEOUT: "Verification timed out (>5s)",
    FOLDER_PERMISSION_DENIED:
      "Folder access denied; please select the folder again",
    FOLDER_UNAVAILABLE: "Previously selected folder is unavailable",
    FALLBACK_RESELECT_REQUIRED:
      "Please reselect the paired .wav and .dat files",
    SERVER_ERROR: "Verification service unavailable",
    CANCELLED: "Upload cancelled",
  };

  function UploadError(reason, message) {
    const err = new Error(message || ERRORS[reason] || reason);
    err.reason = reason;
    err.name = "UploadError";
    return err;
  }

  function supportsFsAccess() {
    return typeof global.showDirectoryPicker === "function";
  }

  function parseSignalName(fileName) {
    const match = /^(.+)\.(wav|dat)$/i.exec(fileName || "");
    if (!match) {
      return null;
    }
    return {
      stem: match[1],
      ext: match[2].toLowerCase(),
      fileName: fileName,
    };
  }

  function otherExt(ext) {
    return ext === "wav" ? "dat" : "wav";
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

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(storeName, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      Promise.resolve(fn(store))
        .then((result) => {
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
        })
        .catch(reject);
    });
  }

  async function purgeExpired() {
    const now = Date.now();
    await withStore(SESSION_STORE, "readwrite", async (store) => {
      const all = await idbRequest(store.getAll());
      await Promise.all(
        (all || [])
          .filter((session) => !session.expiresAt || session.expiresAt <= now)
          .map((session) => idbRequest(store.delete(session.id)))
      );
    });
  }

  async function saveSession(session) {
    await withStore(SESSION_STORE, "readwrite", (store) =>
      idbRequest(store.put(session))
    );
  }

  async function getSession(id) {
    await purgeExpired();
    const session = await withStore(SESSION_STORE, "readonly", (store) =>
      idbRequest(store.get(id))
    );
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      await withStore(SESSION_STORE, "readwrite", (store) =>
        idbRequest(store.delete(id))
      );
      return null;
    }
    return session;
  }

  async function savePrefs(prefs) {
    await withStore(PREFS_STORE, "readwrite", (store) =>
      idbRequest(store.put({ key: PREFS_KEY, ...prefs }))
    );
  }

  async function getPrefs() {
    const row = await withStore(PREFS_STORE, "readonly", (store) =>
      idbRequest(store.get(PREFS_KEY))
    );
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

  async function pairFromDirectoryHandle(dirHandle, selectedName) {
    const parsed = parseSignalName(selectedName);
    if (!parsed) {
      throw UploadError("INVALID_EXTENSION");
    }

    const peerName = `${parsed.stem}.${otherExt(parsed.ext)}`;
    let selectedHandle;
    let peerHandle;
    try {
      selectedHandle = await dirHandle.getFileHandle(selectedName);
      peerHandle = await dirHandle.getFileHandle(peerName);
    } catch (err) {
      throw UploadError("PAIR_NOT_FOUND");
    }

    const selectedFile = await selectedHandle.getFile();
    const peerFile = await peerHandle.getFile();
    const wavFile = parsed.ext === "wav" ? selectedFile : peerFile;
    const datFile = parsed.ext === "dat" ? selectedFile : peerFile;

    return {
      localStem: parsed.stem,
      wavFile,
      datFile,
      wavName: wavFile.name,
      datName: datFile.name,
      directoryHandle: dirHandle,
      mode: "fs-access",
    };
  }

  async function pickFileInDirectory(dirHandle, preferredName) {
    if (typeof global.showOpenFilePicker === "function") {
      const pickerOpts = {
        multiple: false,
        types: [
          {
            description: "ECG/PCG signal files",
            accept: {
              "audio/wav": [".wav"],
              "application/octet-stream": [".dat"],
            },
          },
        ],
      };
      // Chromium can open the file picker rooted at the authorized directory.
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

    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file" && parseSignalName(entry.name)) {
        return entry.name;
      }
    }

    throw UploadError("PAIR_NOT_FOUND");
  }

  async function pickWithFsAccess(prefs) {
    // Resume last authorized folder and file pair when possible.
    if (prefs && prefs.mode === "fs-access" && prefs.directoryHandle) {
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
          // Folder still open, but previous files missing: ask user to pick again.
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

    // First-time / new folder: authorize a directory, then pick one signal file.
    const dirHandle = await global.showDirectoryPicker({
      id: "pacfnet-signals",
      mode: "read",
    });

    const preferred =
      prefs && prefs.localStem ? `${prefs.localStem}.wav` : null;
    let selectedName;
    try {
      if (preferred) {
        await dirHandle.getFileHandle(preferred);
        selectedName = preferred;
      }
    } catch (err) {
      selectedName = null;
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
      input.accept = ".wav,.dat,audio/wav";
      input.multiple = true;
      // Hint previous names where the OS allows it (not guaranteed).
      if (prefs && prefs.fileNames && prefs.fileNames.length) {
        input.setAttribute("data-last-files", prefs.fileNames.join(","));
      }

      input.onchange = () => {
        const files = Array.from(input.files || []);
        if (!files.length) {
          reject(UploadError("CANCELLED"));
          return;
        }

        if (files.length === 1) {
          const parsed = parseSignalName(files[0].name);
          if (!parsed) {
            reject(UploadError("INVALID_EXTENSION"));
            return;
          }
          reject(UploadError("PAIR_NOT_FOUND"));
          return;
        }

        const byStem = new Map();
        for (const file of files) {
          const parsed = parseSignalName(file.name);
          if (!parsed) {
            continue;
          }
          if (!byStem.has(parsed.stem)) {
            byStem.set(parsed.stem, {});
          }
          byStem.get(parsed.stem)[parsed.ext] = file;
        }

        let chosen = null;
        if (prefs && prefs.localStem && byStem.has(prefs.localStem)) {
          const pair = byStem.get(prefs.localStem);
          if (pair.wav && pair.dat) {
            chosen = { stem: prefs.localStem, pair };
          }
        }
        if (!chosen) {
          for (const [stem, pair] of byStem.entries()) {
            if (pair.wav && pair.dat) {
              chosen = { stem, pair };
              break;
            }
          }
        }

        if (!chosen) {
          reject(UploadError("PAIR_NOT_FOUND"));
          return;
        }

        resolve({
          localStem: chosen.stem,
          wavFile: chosen.pair.wav,
          datFile: chosen.pair.dat,
          wavName: chosen.pair.wav.name,
          datName: chosen.pair.dat.name,
          directoryHandle: null,
          mode: "fallback",
        });
      };

      input.oncancel = () => reject(UploadError("CANCELLED"));
      input.click();
    });
  }

  async function verifyWithServer(wavHash, datHash, signal) {
    const response = await fetch("/api/verify-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wavHash, datHash }),
      signal,
    });

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw UploadError("SERVER_ERROR");
    }

    if (!response.ok && !payload) {
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

  async function startLocalSignalUpload() {
    setUploadUiState({
      busy: true,
      message: "Select a local ECG/PCG pair…",
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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

      try {
        const result = await Promise.race([
          runUploadPipeline(pair, controller.signal),
          new Promise((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(UploadError("VERIFY_TIMEOUT"));
            });
          }),
        ]);

        setUploadUiState({
          busy: false,
          message: `Verified as ${result.id}`,
          error: "",
        });
        await applyVerifiedUpload(result);
        return result;
      } finally {
        clearTimeout(timer);
      }
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
      throw err;
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

  // Public API
  global.PACFNetUpload = {
    startLocalSignalUpload,
    getLocalSignalBlobs,
    purgeExpired,
    getPrefs,
    getSession,
    supportsFsAccess,
    ERRORS,
  };

  // Convenience for inline onclick handlers
  global.startLocalSignalUpload = startLocalSignalUpload;
  global.getLocalSignalBlobs = getLocalSignalBlobs;

  // Cleanup expired sessions on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      purgeExpired().catch(() => {});
    });
  } else {
    purgeExpired().catch(() => {});
  }
})(window);
