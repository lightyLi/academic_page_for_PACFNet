/**
 * Inference Stageboard UI: animated phases, live strip, hover details, log sync.
 */
(function (root) {
  "use strict";

  const PHASES = ["model", "prep", "infer", "vote"];
  const TITLE = {
    model: "Model",
    prep: "Normalize & Segment",
    infer: "Classify",
    vote: "Vote",
  };
  const ICONS = {
    model: "fa-cube",
    prep: "fa-sliders-h",
    infer: "fa-microchip",
    vote: "fa-poll",
  };

  let snapshots = {
    model: null,
    prep: null,
    infer: null,
    vote: null,
  };
  let sampleId = "";
  let unsub = null;
  let lastModelLogPct = -1;
  let popoverPhase = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setBtnLabel(text) {
    const btn = $("inferenceBtn");
    if (!btn) return;
    const span = btn.querySelector("span:last-child");
    if (span) span.textContent = text;
  }

  function resetStageboard() {
    snapshots = { model: null, prep: null, infer: null, vote: null };
    lastModelLogPct = -1;
    popoverPhase = null;
    hidePopover();

    const board = $("inferenceStageboard");
    const strip = $("inferenceLiveStrip");
    if (board) {
      board.style.display = "block";
      board.classList.add("is-running");
      board.classList.remove("is-finished");
    }
    if (strip) {
      strip.style.display = "none";
      strip.innerHTML = "";
    }

    PHASES.forEach((phase) => {
      const card = document.querySelector(
        `.inference-stage-card[data-phase="${phase}"]`
      );
      if (!card) return;
      card.dataset.status = "idle";
      delete card.dataset.zLogged;
      delete card.dataset.zDoneLogged;
      delete card.dataset.segLogged;
      card.classList.remove("is-active", "is-done", "is-error");
      const summary = card.querySelector(".inference-stage-summary");
      const bar = card.querySelector(".inference-stage-bar-fill");
      if (summary) summary.textContent = "Waiting";
      if (bar) bar.style.width = "0%";
    });

    document.querySelectorAll(".inference-stage-connector").forEach((el) => {
      el.classList.remove("is-filled");
    });
  }

  function setPhaseStatus(phase, status, summaryText, progress01) {
    const card = document.querySelector(
      `.inference-stage-card[data-phase="${phase}"]`
    );
    if (!card) return;
    card.dataset.status = status;
    card.classList.toggle("is-active", status === "active");
    card.classList.toggle("is-done", status === "done");
    card.classList.toggle("is-error", status === "error");

    const summary = card.querySelector(".inference-stage-summary");
    if (summary && summaryText != null) summary.textContent = summaryText;

    const bar = card.querySelector(".inference-stage-bar-fill");
    if (bar && typeof progress01 === "number") {
      bar.style.width = `${Math.max(0, Math.min(100, progress01 * 100))}%`;
    }

    // Fill connectors before this phase when active/done
    const idx = PHASES.indexOf(phase);
    document.querySelectorAll(".inference-stage-connector").forEach((el, i) => {
      if (status === "done" && i < idx) el.classList.add("is-filled");
      if (status === "active" && i < idx) el.classList.add("is-filled");
      if (status === "done" && i === idx - 0) {
        /* no-op */
      }
      if (status === "done") {
        // fill connector after completed phase
        if (i === idx) el.classList.add("is-filled");
      }
    });
  }

  function updateLiveStrip(payload) {
    const strip = $("inferenceLiveStrip");
    if (!strip) return;
    strip.style.display = "block";
    const current = payload.current ?? 0;
    const total = payload.total ?? 0;
    const normal = payload.normal ?? 0;
    const abnormal = payload.abnormal ?? 0;
    const maxVote = Math.max(1, normal + abnormal);
    const lastLabel =
      payload.label === 1
        ? "Abnormal"
        : payload.label === -1
        ? "Normal"
        : "";
    const lastP =
      typeof payload.p === "number" ? ` (${payload.p.toFixed(2)})` : "";

    strip.innerHTML = `
      <div class="inference-live-left">
        <span class="tag is-info is-light">Segment ${current} / ${total}</span>
      </div>
      <div class="inference-live-votes">
        <div class="inference-vote-row">
          <span>Normal</span>
          <div class="inference-vote-track"><div class="inference-vote-fill is-normal" style="width:${
            (normal / maxVote) * 100
          }%"></div></div>
          <strong>${normal}</strong>
        </div>
        <div class="inference-vote-row">
          <span>Abnormal</span>
          <div class="inference-vote-track"><div class="inference-vote-fill is-abnormal" style="width:${
            (abnormal / maxVote) * 100
          }%"></div></div>
          <strong>${abnormal}</strong>
        </div>
      </div>
      <div class="inference-live-right">
        ${
          lastLabel
            ? `<span class="tag is-light">seg${current} → ${lastLabel}${lastP}</span>`
            : ""
        }
      </div>
    `;
  }

  function formatDetailHtml(phase) {
    const d = snapshots[phase];
    if (!d) return `<p class="has-text-grey">No details yet.</p>`;

    if (phase === "model") {
      return `
        <p><strong>Status</strong> ${escapeHtml(d.status || "Ready")}</p>
        <p><strong>Session</strong> ${escapeHtml(d.session || "—")}</p>
        <p><strong>Runtime</strong> ${escapeHtml(
          d.runtime || `${Number(d.loadSeconds || 0).toFixed(2)} s`
        )}</p>
        <p><strong>Weights</strong> ${Number(d.weightsMB ?? d.sizeMB ?? 153)} MB</p>
        <p><strong>Precision</strong> ${escapeHtml(d.precision || "float32")}</p>
        <p><strong>Input</strong> ${escapeHtml(
          d.inputLayout || "ECG + PCG · 1s @ 2000 Hz"
        )}</p>
      `;
    }
    if (phase === "prep") {
      return `
        <p><strong>ECG / PCG</strong> ${d.ecgSeconds.toFixed(2)}s / ${d.pcgSeconds.toFixed(2)}s</p>
        <p><strong>Effective</strong> ${d.effectiveSeconds.toFixed(2)}s @ ${d.sampleRate} Hz</p>
        <p><strong>Normalization</strong> Z-score on full effective series (per modality)</p>
        <p><strong>Order</strong> Normalize → segment</p>
        <p><strong>Windows</strong> ${d.segmentCount} × 1.0s (${d.windowSamples} samples)</p>
        <p><strong>Discarded tail</strong> ${d.discardedSeconds.toFixed(2)}s</p>
        <p><strong>Tensor shape</strong> ${escapeHtml(d.shape)}</p>
      `;
    }
    if (phase === "infer") {
      return `
        <p><strong>Progress</strong> ${d.total} / ${d.total}</p>
        <p><strong>Avg / segment</strong> ${d.avgMs.toFixed(0)} ms</p>
        <p><strong>Total infer time</strong> ${d.totalSeconds.toFixed(2)} s</p>
        <p><strong>Tally</strong> Normal ${d.normal} · Abnormal ${d.abnormal}</p>
        ${
          d.last
            ? `<p><strong>Last segment</strong> #${d.last.index + 1} → ${
                d.last.label === 1 ? "Abnormal" : "Normal"
              } (p=${d.last.p.toFixed(2)})</p>`
            : ""
        }
      `;
    }
    if (phase === "vote") {
      const cls = d.label === 1 ? "ABNORMAL" : "NORMAL";
      return `
        <p><strong>Strategy</strong> ${escapeHtml(d.strategy)}</p>
        <p><strong>Normal / Abnormal</strong> ${d.normal} / ${d.abnormal}</p>
        <p><strong>Decision</strong> ${cls}</p>
        <p><strong>Confidence</strong> ${d.confidence.toFixed(1)}% (${Math.max(
        d.normal,
        d.abnormal
      )}/${d.total})</p>
        <p><strong>Sample</strong> ${escapeHtml(sampleId)}</p>
      `;
    }
    return "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hidePopover() {
    const pop = $("inferenceStagePopover");
    if (pop) {
      pop.hidden = true;
      pop.innerHTML = "";
    }
    popoverPhase = null;
  }

  function showPopover(phase, anchor) {
    const pop = $("inferenceStagePopover");
    const board = $("inferenceStageboard");
    if (!pop || !board || !anchor) return;

    pop.hidden = false;
    pop.innerHTML = `
      <div class="inference-popover-title">
        <span class="icon has-text-info"><i class="fas ${ICONS[phase]}"></i></span>
        ${TITLE[phase]}
      </div>
      <div class="inference-popover-body">${formatDetailHtml(phase)}</div>
    `;
    popoverPhase = phase;

    const boardRect = board.getBoundingClientRect();
    const cardRect = anchor.getBoundingClientRect();
    const top = cardRect.bottom - boardRect.top + 8;
    let left = cardRect.left - boardRect.left;
    pop.style.top = `${top}px`;
    pop.style.left = `${Math.max(0, left)}px`;

    // Keep inside board
    requestAnimationFrame(() => {
      const popRect = pop.getBoundingClientRect();
      if (popRect.right > boardRect.right - 8) {
        pop.style.left = `${Math.max(
          0,
          boardRect.width - popRect.width - 8
        )}px`;
      }
    });
  }

  function bindCardInteractions() {
    document.querySelectorAll(".inference-stage-card").forEach((card) => {
      const phase = card.dataset.phase;
      card.addEventListener("mouseenter", () => {
        if (!snapshots[phase]) return;
        showPopover(phase, card);
      });
      card.addEventListener("mouseleave", () => {
        // Delay hide so user can move into popover
        setTimeout(() => {
          const pop = $("inferenceStagePopover");
          if (pop && pop.matches(":hover")) return;
          if (popoverPhase === phase) hidePopover();
        }, 120);
      });
      card.addEventListener("click", (e) => {
        e.preventDefault();
        if (!snapshots[phase]) return;
        if (popoverPhase === phase) hidePopover();
        else showPopover(phase, card);
      });
    });

    const pop = $("inferenceStagePopover");
    if (pop) {
      pop.addEventListener("mouseleave", hidePopover);
    }
  }

  function handleEvent(ev) {
    const { type, phase, payload = {} } = ev;

    if (type === "pipeline_start") {
      sampleId = payload.sampleId || "";
      resetStageboard();
      if (typeof clearLog === "function") clearLog();
      if (typeof addLogEntry === "function") {
        addLogEntry(`Initializing inference for sample: ${sampleId}`);
        addLogEntry("Input: synchronized ECG + PCG @ 2000 Hz");
      }
      setBtnLabel("Loading Model…");
      return;
    }

    if (type === "phase_start" && phase === "model") {
      setPhaseStatus("model", "active", payload.cached ? "Checking cache…" : "Loading…", 0.02);
      setBtnLabel("Loading Model…");
      if (typeof addLogEntry === "function") {
        addLogEntry(
          payload.cached
            ? "[Model] Checking PACFNet runtime (cached)..."
            : "[Model] Loading PACFNet session..."
        );
      }
      return;
    }

    if (type === "phase_progress" && phase === "model") {
      const p = payload.progress ?? 0;
      setPhaseStatus(
        "model",
        "active",
        payload.cached ? "Cached" : `Loading ${payload.percent ?? Math.round(p * 100)}%`,
        p
      );
      if (!payload.cached && typeof addLogEntry === "function") {
        const pct = payload.percent ?? Math.round(p * 100);
        if (pct >= 25 && lastModelLogPct < 25) {
          addLogEntry("[Model]   Progress 25%");
          lastModelLogPct = 25;
        } else if (pct >= 50 && lastModelLogPct < 50) {
          addLogEntry("[Model]   Progress 50%");
          lastModelLogPct = 50;
        } else if (pct >= 75 && lastModelLogPct < 75) {
          addLogEntry("[Model]   Progress 75%");
          lastModelLogPct = 75;
        }
      }
      return;
    }

    if (type === "phase_done" && phase === "model") {
      snapshots.model = payload.detail;
      {
        const d = payload.detail || {};
        const rt =
          d.runtime ||
          (d.loadSeconds != null ? `${Number(d.loadSeconds).toFixed(2)} s` : "");
        setPhaseStatus(
          "model",
          "done",
          rt ? `Ready · ${rt}` : "Ready",
          1
        );
        if (typeof addLogEntry === "function") {
          addLogEntry(
            `[Model] Session ready (${d.session || "Ready"}, runtime ${rt || "n/a"})`,
            "success"
          );
        }
      }
      return;
    }

    if (type === "phase_start" && phase === "prep") {
      setPhaseStatus("prep", "active", "Aligning…", 0.05);
      setBtnLabel("Preparing Signals…");
      if (typeof addLogEntry === "function") {
        addLogEntry("[Prep] Aligning synchronized ECG + PCG");
        if (payload.ecgSeconds != null) {
          addLogEntry(
            `  ECG: ${payload.ecgSeconds.toFixed(2)}s | PCG: ${payload.pcgSeconds.toFixed(
              2
            )}s`
          );
        }
      }
      return;
    }

    if (type === "phase_progress" && phase === "prep") {
      if (payload.step === "zscore") {
        setPhaseStatus("prep", "active", "Z-score…", payload.progress ?? 0.4);
        if (payload.progress <= 0.2 && typeof addLogEntry === "function") {
          // logged once via flag on card dataset
          const card = document.querySelector(
            '.inference-stage-card[data-phase="prep"]'
          );
          if (card && card.dataset.zLogged !== "1") {
            card.dataset.zLogged = "1";
            addLogEntry(
              "[Prep] Z-score normalizing full effective ECG and PCG..."
            );
          }
        }
        if (payload.progress >= 0.55) {
          const card = document.querySelector(
            '.inference-stage-card[data-phase="prep"]'
          );
          if (card && card.dataset.zDoneLogged !== "1") {
            card.dataset.zDoneLogged = "1";
            if (typeof addLogEntry === "function") {
              addLogEntry(
                "[Prep] Z-score done (per-modality μ/σ on full series)",
                "success"
              );
            }
          }
        }
      }
      if (payload.step === "segment") {
        setPhaseStatus(
          "prep",
          "active",
          `Slicing ${payload.segmentCount ?? ""}…`,
          payload.progress ?? 0.8
        );
        const card = document.querySelector(
          '.inference-stage-card[data-phase="prep"]'
        );
        if (card && card.dataset.segLogged !== "1") {
          card.dataset.segLogged = "1";
          if (typeof addLogEntry === "function") {
            addLogEntry(
              "[Prep] Slicing non-overlapping 1.0s windows (2000 samples)..."
            );
          }
        }
      }
      return;
    }

    if (type === "phase_done" && phase === "prep") {
      snapshots.prep = payload.detail;
      const d = payload.detail;
      setPhaseStatus(
        "prep",
        "done",
        `${d.segmentCount} segs · tail ${d.discardedSeconds.toFixed(2)}s`,
        1
      );
      if (typeof addLogEntry === "function") {
        addLogEntry(
          `  ECG: ${d.ecgSeconds.toFixed(2)}s | PCG: ${d.pcgSeconds.toFixed(
            2
          )}s | effective: ${d.effectiveSeconds.toFixed(2)}s`
        );
        addLogEntry(
          `[Prep] ${d.segmentCount} segments kept; discarded tail ${d.discardedSeconds.toFixed(
            2
          )}s`,
          "success"
        );
        addLogEntry(
          `[Prep] Tensors ready  shape ${d.shape}`,
          "success"
        );
      }
      return;
    }

    if (type === "phase_start" && phase === "infer") {
      setPhaseStatus("infer", "active", `0 / ${payload.total}`, 0);
      setBtnLabel(`Inferring 0/${payload.total}…`);
      updateLiveStrip({ current: 0, total: payload.total, normal: 0, abnormal: 0 });
      if (typeof addLogEntry === "function") {
        addLogEntry(`[Infer] Classifying ${payload.total} segments...`);
      }
      return;
    }

    if (type === "segment_result" && phase === "infer") {
      setPhaseStatus(
        "infer",
        "active",
        `${payload.current} / ${payload.total}`,
        payload.current / payload.total
      );
      setBtnLabel(`Inferring ${payload.current}/${payload.total}…`);
      updateLiveStrip(payload);
      return;
    }

    if (type === "phase_progress" && phase === "infer") {
      if (typeof addLogEntry === "function") {
        addLogEntry(
          `  Progress: ${payload.current}/${payload.total}  |  votes N=${payload.normal} A=${payload.abnormal}`
        );
      }
      return;
    }

    if (type === "phase_done" && phase === "infer") {
      snapshots.infer = payload.detail;
      const d = payload.detail;
      setPhaseStatus("infer", "done", `${d.total} / ${d.total}`, 1);
      if (typeof addLogEntry === "function") {
        addLogEntry(
          `[Infer] Finished in ${d.totalSeconds.toFixed(2)}s (avg ${d.avgMs.toFixed(
            0
          )} ms/seg)`,
          "success"
        );
      }
      return;
    }

    if (type === "phase_start" && phase === "vote") {
      setPhaseStatus("vote", "active", "Aggregating…", 0.1);
      setBtnLabel("Aggregating…");
      if (typeof addLogEntry === "function") {
        addLogEntry("[Vote] Aggregating by majority vote");
      }
      return;
    }

    if (type === "phase_progress" && phase === "vote") {
      setPhaseStatus(
        "vote",
        "active",
        `N=${payload.normal} A=${payload.abnormal}`,
        payload.progress ?? 0.5
      );
      updateLiveStrip({
        current: (payload.normal || 0) + (payload.abnormal || 0),
        total: (payload.normal || 0) + (payload.abnormal || 0),
        normal: payload.normal,
        abnormal: payload.abnormal,
      });
      return;
    }

    if (type === "phase_done" && phase === "vote") {
      snapshots.vote = payload.detail;
      const d = payload.detail;
      const cls = d.label === 1 ? "Abnormal" : "Normal";
      setPhaseStatus("vote", "done", `${cls} · ${d.confidence.toFixed(1)}%`, 1);
      if (typeof addLogEntry === "function") {
        addLogEntry(`  Normal: ${d.normal} | Abnormal: ${d.abnormal}`);
        addLogEntry(
          `[Result] ${cls.toUpperCase()}  confidence ${d.confidence.toFixed(
            1
          )}% (${Math.max(d.normal, d.abnormal)}/${d.total})`,
          "success"
        );
      }
      return;
    }

    if (type === "pipeline_done") {
      const board = $("inferenceStageboard");
      if (board) {
        board.classList.remove("is-running");
        board.classList.add("is-finished");
      }
      // Ensure all connectors filled
      document
        .querySelectorAll(".inference-stage-connector")
        .forEach((el) => el.classList.add("is-filled"));
      if (typeof addLogEntry === "function") {
        addLogEntry("Pipeline completed successfully", "success");
      }
      setBtnLabel("Run Inference");
      return;
    }

    if (type === "pipeline_error") {
      if (typeof addLogEntry === "function") {
        addLogEntry(`Error: ${payload.message}`, "error");
      }
      setBtnLabel("Run Inference");
      const board = $("inferenceStageboard");
      if (board) board.classList.remove("is-running");
    }
  }

  function attach() {
    bindCardInteractions();
  }

  function subscribeToBus(bus) {
    if (unsub) unsub();
    unsub = bus.on(handleEvent);
  }

  root.InferenceUI = {
    attach,
    subscribeToBus,
    handleEvent,
    resetStageboard,
    getSnapshots: () => snapshots,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})(typeof window !== "undefined" ? window : globalThis);
