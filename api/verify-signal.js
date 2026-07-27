const fs = require("fs");
const path = require("path");
const {
  verifyHashes,
  ERRORS,
} = require("../static/js/upload_helpers.js");

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
        message: ERRORS.INVALID_REQUEST,
      });
      return;
    }

    let table;
    try {
      table = loadHashes();
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        reason: "SERVER_ERROR",
        message: ERRORS.SERVER_ERROR,
      });
      return;
    }

    const result = verifyHashes(table, body.wavHash, body.datHash);
    if (!result.ok && result.reason === "INVALID_REQUEST") {
      sendJson(res, 400, result);
      return;
    }
    sendJson(res, 200, result);
  } catch (err) {
    console.error("[verify-signal]", err);
    sendJson(res, 500, {
      ok: false,
      reason: "SERVER_ERROR",
      message: ERRORS.SERVER_ERROR,
    });
  }
};

// Exported for unit tests
module.exports.loadHashes = loadHashes;
module.exports.verifyHashes = verifyHashes;
