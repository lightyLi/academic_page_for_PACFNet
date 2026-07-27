/**
 * Pure helpers shared by the browser upload flow and Node tests.
 * Keep this file free of DOM / IndexedDB / fetch side effects.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PACFNetUploadHelpers = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ERRORS = {
    INVALID_EXTENSION: "Please select a .wav (PCG) or .dat (ECG) file",
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
    INVALID_REQUEST:
      "Invalid request: wavHash and datHash must be 64-character lowercase hex SHA-256 digests",
  };

  const HASH_HEX_RE = /^[0-9a-f]{64}$/;

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

  function normalizeHash(value) {
    return typeof value === "string" ? value.toLowerCase() : "";
  }

  function isValidHash(value) {
    return HASH_HEX_RE.test(normalizeHash(value));
  }

  /**
   * Pair files that share the same stem and provide both .wav and .dat.
   * @param {Array<{name: string}>} files
   * @param {{localStem?: string}|null} prefs
   */
  function pairFilesByStem(files, prefs) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) {
      return { ok: false, reason: "CANCELLED" };
    }

    if (list.length === 1) {
      const parsed = parseSignalName(list[0].name);
      if (!parsed) {
        return { ok: false, reason: "INVALID_EXTENSION" };
      }
      return { ok: false, reason: "PAIR_NOT_FOUND" };
    }

    const byStem = new Map();
    for (const file of list) {
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
      return { ok: false, reason: "PAIR_NOT_FOUND" };
    }

    return {
      ok: true,
      localStem: chosen.stem,
      wavFile: chosen.pair.wav,
      datFile: chosen.pair.dat,
      wavName: chosen.pair.wav.name,
      datName: chosen.pair.dat.name,
    };
  }

  /**
   * Resolve a peer filename from a list of directory entry names (case-insensitive).
   */
  function resolvePeerFileName(entryNames, selectedName) {
    const parsed = parseSignalName(selectedName);
    if (!parsed) {
      return { ok: false, reason: "INVALID_EXTENSION" };
    }
    const wanted = `${parsed.stem}.${otherExt(parsed.ext)}`.toLowerCase();
    const names = Array.isArray(entryNames) ? entryNames : [];
    const hit = names.find((n) => String(n).toLowerCase() === wanted);
    if (!hit) {
      return { ok: false, reason: "PAIR_NOT_FOUND" };
    }
    return {
      ok: true,
      selectedName,
      peerName: hit,
      localStem: parsed.stem,
      selectedExt: parsed.ext,
    };
  }

  function findHashMatch(table, wavHash, datHash) {
    const files = (table && table.files) || {};
    const wav = normalizeHash(wavHash);
    const dat = normalizeHash(datHash);
    let wavOnlyId = null;
    let datOnlyId = null;

    for (const [id, entry] of Object.entries(files)) {
      const wavMatch = entry.wav === wav;
      const datMatch = entry.dat === dat;
      if (wavMatch && datMatch) {
        return { kind: "exact", id };
      }
      if (wavMatch) {
        wavOnlyId = id;
      }
      if (datMatch) {
        datOnlyId = id;
      }
    }

    if (wavOnlyId || datOnlyId) {
      return { kind: "partial", wavOnlyId, datOnlyId };
    }
    return { kind: "none" };
  }

  function verifyHashes(table, wavHash, datHash) {
    if (!isValidHash(wavHash) || !isValidHash(datHash)) {
      return {
        ok: false,
        reason: "INVALID_REQUEST",
        message: ERRORS.INVALID_REQUEST,
      };
    }

    const match = findHashMatch(table, wavHash, datHash);
    if (match.kind === "exact") {
      return {
        ok: true,
        id: match.id,
        algo: (table && table.algo) || "SHA-256",
      };
    }
    if (match.kind === "partial") {
      return {
        ok: false,
        reason: "HASH_MISMATCH",
        message: ERRORS.HASH_MISMATCH,
      };
    }
    return {
      ok: false,
      reason: "NOT_IN_DATASET",
      message: ERRORS.NOT_IN_DATASET,
    };
  }

  function hoursLeft(expiresAt, now) {
    const ms = Math.max(0, Number(expiresAt) - Number(now || Date.now()));
    return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  }

  return {
    ERRORS,
    HASH_HEX_RE,
    parseSignalName,
    otherExt,
    normalizeHash,
    isValidHash,
    pairFilesByStem,
    resolvePeerFileName,
    findHashMatch,
    verifyHashes,
    hoursLeft,
  };
});
