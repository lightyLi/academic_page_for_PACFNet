const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATASET_DIR =
  "/Users/lighty/Documents/Papers/Researches/Dataset/physionet_2016_training-a";
const PROD = "https://pacfnet-demo.vercel.app";

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

async function postVerify(body) {
  const response = await fetch(`${PROD}/api/verify-signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

describe("production verify-signal with real dataset files", () => {
  it("verifies a0001 from dataset folder", async () => {
    const wavHash = sha256File(path.join(DATASET_DIR, "a0001.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0001.dat"));
    const { status, payload } = await postVerify({ wavHash, datHash });
    assert.equal(status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.id, "a0001");
  });

  it("verifies a0407 (Normal) from dataset folder", async () => {
    const wavHash = sha256File(path.join(DATASET_DIR, "a0407.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0407.dat"));
    const { status, payload } = await postVerify({ wavHash, datHash });
    assert.equal(status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.id, "a0407");
  });

  it("rejects mixed a0001.wav + a0407.dat", async () => {
    const wavHash = sha256File(path.join(DATASET_DIR, "a0001.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0407.dat"));
    const { status, payload } = await postVerify({ wavHash, datHash });
    assert.equal(status, 200);
    assert.equal(payload.ok, false);
    assert.equal(payload.reason, "HASH_MISMATCH");
  });

  it("rejects modified bytes", async () => {
    const wav = Buffer.from(fs.readFileSync(path.join(DATASET_DIR, "a0001.wav")));
    wav[100] = wav[100] ^ 0xff;
    const wavHash = crypto.createHash("sha256").update(wav).digest("hex");
    const datHash = sha256File(path.join(DATASET_DIR, "a0001.dat"));
    const { payload } = await postVerify({ wavHash, datHash });
    assert.equal(payload.ok, false);
    assert.ok(
      payload.reason === "HASH_MISMATCH" || payload.reason === "NOT_IN_DATASET"
    );
  });

  it("serves upload frontend assets", async () => {
    for (const asset of [
      "/static/js/upload_helpers.js",
      "/static/js/upload_signals.js",
      "/static/signal_hashes.json",
    ]) {
      const response = await fetch(`${PROD}${asset}`);
      assert.equal(response.status, 200, asset);
    }
  });
});
