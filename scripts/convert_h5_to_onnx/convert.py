#!/usr/bin/env python3
"""Rebuild PACFNet from source, load H5 weights, export ONNX. Cloud/CI only."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
import tf2onnx
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from model import dual_stream_model  # noqa: E402


def main() -> None:
    h5_path = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp_convert/b2b_20241216_204934_fold_4_model.h5")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "tmp_convert")
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "b2b_20241216_204934_fold_4_model.onnx"
    meta_path = out_dir / "b2b_20241216_204934_fold_4_model.onnx.json"

    print("TF", tf.__version__)
    print("Building dual_stream_model() ...")
    model = dual_stream_model()
    model.summary()

    print("Loading weights from", h5_path)
    # Full-model H5 may include optimizer; load_weights by name is more robust.
    try:
        model.load_weights(h5_path)
    except Exception as exc:
        print("load_weights(path) failed:", exc)
        print("Retry load_weights(..., by_name=True, skip_mismatch=True)")
        model.load_weights(h5_path, by_name=True, skip_mismatch=True)

    print("inputs:", [(i.name, list(i.shape), i.dtype) for i in model.inputs])
    print("outputs:", [(o.name, list(o.shape), o.dtype) for o in model.outputs])

    input_signature = [
        tf.TensorSpec([None, 2000, 1], tf.float32, name="ECG_Input"),
        tf.TensorSpec([None, 2000, 1], tf.float32, name="PCG_Input"),
    ]
    print("Converting with tf2onnx opset 17 ...")
    tf2onnx.convert.from_keras(
        model,
        input_signature=input_signature,
        opset=17,
        output_path=str(onnx_path),
    )
    print("Wrote", onnx_path, "bytes", onnx_path.stat().st_size)

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feeds = {}
    inputs_meta = []
    for inp in sess.get_inputs():
        shape = [1 if (d is None or isinstance(d, str)) else int(d) for d in inp.shape]
        if len(shape) == 3:
            shape = [1, 2000, 1]
        feeds[inp.name] = np.zeros(shape, dtype=np.float32)
        inputs_meta.append(
            {"name": inp.name, "shape": list(inp.shape), "dtype": inp.type, "feed_shape": shape}
        )

    outs = sess.run(None, feeds)
    outputs_meta = []
    for out, arr in zip(sess.get_outputs(), outs):
        outputs_meta.append(
            {
                "name": out.name,
                "shape": list(out.shape),
                "dtype": out.type,
                "value_shape": list(arr.shape),
                "sample": arr.reshape(-1)[:8].astype(float).tolist(),
            }
        )
        print("output", out.name, arr.shape, arr.reshape(-1)[:8])

    meta = {
        "source_h5": h5_path.name,
        "onnx": onnx_path.name,
        "opset": 17,
        "bytes": onnx_path.stat().st_size,
        "method": "rebuild_dual_stream_model + load_weights + tf2onnx.from_keras",
        "keras_inputs": [
            {
                "name": i.name,
                "shape": [None if d is None else int(d) for d in i.shape],
                "dtype": str(i.dtype),
            }
            for i in model.inputs
        ],
        "keras_outputs": [
            {
                "name": o.name,
                "shape": [None if d is None else int(d) for d in o.shape],
                "dtype": str(o.dtype),
            }
            for o in model.outputs
        ],
        "ort_inputs": inputs_meta,
        "ort_outputs": outputs_meta,
        "tensorflow": tf.__version__,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print("Wrote", meta_path)


if __name__ == "__main__":
    main()
