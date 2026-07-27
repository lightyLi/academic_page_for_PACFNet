#!/usr/bin/env python3
"""Generate SHA-256 authority table for hosted PhysioNet training-a signal pairs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIGNALS_DIR = ROOT / "static" / "signals"
MANIFEST = ROOT / "static" / "signals_manifest.txt"
OUTPUT = ROOT / "static" / "signal_hashes.json"


def sha256_file(path: Path) -> tuple[str, int]:
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def main() -> None:
    if not MANIFEST.exists():
        raise SystemExit(f"Missing manifest: {MANIFEST}")

    ids = [line.strip() for line in MANIFEST.read_text().splitlines() if line.strip()]
    files: dict[str, dict[str, int | str]] = {}

    for record_id in ids:
        wav_path = SIGNALS_DIR / f"{record_id}.wav"
        dat_path = SIGNALS_DIR / f"{record_id}.dat"
        if not wav_path.exists() or not dat_path.exists():
            raise SystemExit(f"Missing pair for {record_id}")

        wav_hash, wav_bytes = sha256_file(wav_path)
        dat_hash, dat_bytes = sha256_file(dat_path)
        files[record_id] = {
            "wav": wav_hash,
            "dat": dat_hash,
            "wavBytes": wav_bytes,
            "datBytes": dat_bytes,
        }

    payload = {
        "algo": "SHA-256",
        "dataset": "physionet_2016_training-a",
        "filter": "dual_modality_and_sqi_eq_1",
        "count": len(files),
        "files": files,
    }

    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {OUTPUT} with {len(files)} records")


if __name__ == "__main__":
    main()
