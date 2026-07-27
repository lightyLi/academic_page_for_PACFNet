const fs = require("fs");
const path = require("path");

const HASH_HEX_RE = /^[0-9a-f]{64}$/;

const MESSAGES = {
  INVALID_REQUEST:
    "Invalid request: wavHash and datHash must be 64-character lowercase hex SHA-256 digests",
  NOT_IN_DATASET:
    "These files do not match any hosted PhysioNet 2016 training-a sample",
  HASH_MISMATCH:
    "ECG and PCG do not match the same hosted record (or content was modified)",
  SERVER_ERROR: "Verification service unavailable",
};

function loadHashes() {
  const candidates = [
    path.join(process.cwd(), "static", "signal_hashes.json"),
    path.join(__dirname, "..", "static", "signal_hashes.json"),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  }

  throw new Error("signal_hashes.json not found");
}

function findMatch(table, wavHash, datHash) {
  const files = table.files || {};
  let wavOnlyId = null;
  let datOnlyId = null;

  for (const [id, entry] of Object.entries(files)) {
    const wavMatch = entry.wav === wavHash;
    const datMatch = entry.dat === datHash;

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

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      ok: false,
      reason: "INVALID_REQUEST",
      message: "Method not allowed; use POST",
    });
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        reason: "INVALID_REQUEST",
        message: MESSAGES.INVALID_REQUEST,
      });
      return;
    }

    const wavHash =
      typeof body.wavHash === "string" ? body.wavHash.toLowerCase() : "";
    const datHash =
      typeof body.datHash === "string" ? body.datHash.toLowerCase() : "";

    if (!HASH_HEX_RE.test(wavHash) || !HASH_HEX_RE.test(datHash)) {
      sendJson(res, 400, {
        ok: false,
        reason: "INVALID_REQUEST",
        message: MESSAGES.INVALID_REQUEST,
      });
      return;
    }

    const table = loadHashes();
    const match = findMatch(table, wavHash, datHash);

    if (match.kind === "exact") {
      sendJson(res, 200, {
        ok: true,
        id: match.id,
        algo: table.algo || "SHA-256",
      });
      return;
    }

    if (match.kind === "partial") {
      sendJson(res, 200, {
        ok: false,
        reason: "HASH_MISMATCH",
        message: MESSAGES.HASH_MISMATCH,
      });
      return;
    }

    sendJson(res, 200, {
      ok: false,
      reason: "NOT_IN_DATASET",
      message: MESSAGES.NOT_IN_DATASET,
    });
  } catch (err) {
    console.error("[verify-signal]", err);
    sendJson(res, 500, {
      ok: false,
      reason: "SERVER_ERROR",
      message: MESSAGES.SERVER_ERROR,
    });
  }
};
