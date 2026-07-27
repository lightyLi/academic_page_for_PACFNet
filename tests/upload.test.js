const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const helpers = require("../static/js/upload_helpers.js");
const verifyHandler = require("../api/verify-signal.js");

const ROOT = path.join(__dirname, "..");
const HASHES_PATH = path.join(ROOT, "static", "signal_hashes.json");
const MANIFEST_PATH = path.join(ROOT, "static", "signals_manifest.txt");
const SIGNALS_DIR = path.join(ROOT, "static", "signals");
const DATASET_DIR =
  "/Users/lighty/Documents/Papers/Researches/Dataset/physionet_2016_training-a";

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function mockReq(body, method = "POST") {
  const data = Buffer.from(
    typeof body === "string" ? body : JSON.stringify(body || {})
  );
  return {
    method,
    async *[Symbol.asyncIterator]() {
      yield data;
    },
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    payload: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.body = s || "";
      this.payload = s ? JSON.parse(s) : null;
    },
  };
}

describe("upload_helpers.parseSignalName", () => {
  it("parses wav/dat case-insensitively", () => {
    assert.deepEqual(helpers.parseSignalName("MySample.WAV"), {
      stem: "MySample",
      ext: "wav",
      fileName: "MySample.WAV",
    });
    assert.equal(helpers.parseSignalName("a0001.dat").ext, "dat");
  });

  it("rejects invalid extensions", () => {
    assert.equal(helpers.parseSignalName("a0001.hea"), null);
    assert.equal(helpers.parseSignalName(""), null);
  });
});

describe("upload_helpers.pairFilesByStem", () => {
  it("pairs same-stem files even when renamed", () => {
    const files = [{ name: "foo.wav" }, { name: "foo.dat" }];
    const result = helpers.pairFilesByStem(files, null);
    assert.equal(result.ok, true);
    assert.equal(result.localStem, "foo");
  });

  it("fails when peer is missing", () => {
    const result = helpers.pairFilesByStem([{ name: "foo.wav" }], null);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "PAIR_NOT_FOUND");
  });

  it("prefers remembered stem when multiple pairs exist", () => {
    const files = [
      { name: "a.wav" },
      { name: "a.dat" },
      { name: "b.wav" },
      { name: "b.dat" },
    ];
    const result = helpers.pairFilesByStem(files, { localStem: "b" });
    assert.equal(result.ok, true);
    assert.equal(result.localStem, "b");
  });

  it("fails when stems do not correspond", () => {
    const result = helpers.pairFilesByStem(
      [{ name: "a.wav" }, { name: "b.dat" }],
      null
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "PAIR_NOT_FOUND");
  });
});

describe("upload_helpers.resolvePeerFileName", () => {
  it("resolves peer case-insensitively", () => {
    const result = helpers.resolvePeerFileName(
      ["sample.WAV", "sample.DAT"],
      "sample.wav"
    );
    assert.equal(result.ok, true);
    assert.equal(result.peerName, "sample.DAT");
  });

  it("fails when peer absent", () => {
    const result = helpers.resolvePeerFileName(["sample.wav"], "sample.wav");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "PAIR_NOT_FOUND");
  });
});

describe("upload_helpers.verifyHashes", () => {
  const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));

  it("accepts exact hosted pair", () => {
    const a0001 = table.files.a0001;
    const result = helpers.verifyHashes(table, a0001.wav, a0001.dat);
    assert.equal(result.ok, true);
    assert.equal(result.id, "a0001");
  });

  it("rejects cross-record mix", () => {
    const result = helpers.verifyHashes(
      table,
      table.files.a0001.wav,
      table.files.a0002.dat
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "HASH_MISMATCH");
  });

  it("rejects unknown hashes", () => {
    const result = helpers.verifyHashes(table, "a".repeat(64), "b".repeat(64));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "NOT_IN_DATASET");
  });

  it("rejects invalid hash format", () => {
    const result = helpers.verifyHashes(table, "nope", table.files.a0001.dat);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_REQUEST");
  });
});

describe("signal_hashes.json integrity", () => {
  it("has 388 records matching manifest", () => {
    const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
    const manifest = fs
      .readFileSync(MANIFEST_PATH, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.equal(table.count, 388);
    assert.equal(Object.keys(table.files).length, 388);
    assert.equal(manifest.length, 388);
    for (const id of manifest) {
      assert.ok(table.files[id], `missing hash for ${id}`);
      assert.match(table.files[id].wav, helpers.HASH_HEX_RE);
      assert.match(table.files[id].dat, helpers.HASH_HEX_RE);
    }
  });

  it("matches on-disk hosted signal bytes for sampled ids", () => {
    const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
    for (const id of ["a0001", "a0002", "a0407", "a0409"]) {
      const wavHash = sha256File(path.join(SIGNALS_DIR, `${id}.wav`));
      const datHash = sha256File(path.join(SIGNALS_DIR, `${id}.dat`));
      assert.equal(wavHash, table.files[id].wav);
      assert.equal(datHash, table.files[id].dat);
    }
  });
});

describe("dataset folder vs hosted hashes", () => {
  it("dataset a0001/a0407 match hosted authority hashes", () => {
    assert.ok(fs.existsSync(DATASET_DIR), "dataset folder missing");
    const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
    for (const id of ["a0001", "a0407"]) {
      const wavHash = sha256File(path.join(DATASET_DIR, `${id}.wav`));
      const datHash = sha256File(path.join(DATASET_DIR, `${id}.dat`));
      const result = helpers.verifyHashes(table, wavHash, datHash);
      assert.equal(result.ok, true);
      assert.equal(result.id, id);
    }
  });

  it("renamed copies still match by content hash", () => {
    const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
    const wavHash = sha256File(path.join(DATASET_DIR, "a0002.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0002.dat"));
    const result = helpers.verifyHashes(table, wavHash, datHash);
    assert.equal(result.ok, true);
    assert.equal(result.id, "a0002");

    const paired = helpers.pairFilesByStem(
      [{ name: "PatientX.wav" }, { name: "PatientX.dat" }],
      null
    );
    assert.equal(paired.ok, true);
    assert.equal(paired.localStem, "PatientX");
  });

  it("excludes unpaired and SQI=0 samples from authority table", () => {
    const table = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
    for (const id of ["a0041", "a0117", "a0220", "a0233", "a0006", "a0008"]) {
      assert.equal(table.files[id], undefined);
    }
  });
});

describe("api/verify-signal handler", () => {
  it("returns exact match for dataset bytes", async () => {
    const wavHash = sha256File(path.join(DATASET_DIR, "a0001.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0001.dat"));
    const res = mockRes();
    await verifyHandler(mockReq({ wavHash, datHash }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.id, "a0001");
  });

  it("returns HASH_MISMATCH for mixed records", async () => {
    const wavHash = sha256File(path.join(DATASET_DIR, "a0001.wav"));
    const datHash = sha256File(path.join(DATASET_DIR, "a0407.dat"));
    const res = mockRes();
    await verifyHandler(mockReq({ wavHash, datHash }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, false);
    assert.equal(res.payload.reason, "HASH_MISMATCH");
  });

  it("returns 400 for invalid body", async () => {
    const res = mockRes();
    await verifyHandler(mockReq({ wavHash: "x", datHash: "y" }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.reason, "INVALID_REQUEST");
  });

  it("rejects non-POST", async () => {
    const res = mockRes();
    await verifyHandler(mockReq({}, "GET"), res);
    assert.equal(res.statusCode, 405);
  });
});

describe("hoursLeft", () => {
  it("rounds up remaining hours", () => {
    const now = 1_000_000;
    assert.equal(helpers.hoursLeft(now + 1, now), 1);
    assert.equal(helpers.hoursLeft(now + 3_600_000, now), 1);
    assert.equal(helpers.hoursLeft(now + 3_600_001, now), 2);
  });
});
