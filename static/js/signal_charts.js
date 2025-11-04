/**
 * Signal Visualization using Chart.js
 * ECG and PCG waveform display with Chart.js library
 */

// Chart instances
let ecgChart = null;
let pcgChart = null;
let combinedChart = null;

// Data storage for combined chart
let ecgData = null;
let pcgData = null;
let signalDurationData = { ecg: 0, pcg: 0 };

// Constants
const INITIAL_VIEW_SECONDS = 5;
const MAX_POINTS = 6000;
const DEFAULT_ECG_SAMPLE_RATE = 2000;
const DEFAULT_PCG_SAMPLE_RATE = 2000;

// Register zoom/pan plugin if available
if (typeof Chart !== "undefined" && Chart.register) {
    let zoomPlugin = null;

    if (typeof ChartZoom !== "undefined") {
        zoomPlugin = ChartZoom;
    } else if (typeof window !== "undefined") {
        zoomPlugin =
            window.ChartZoom ||
            window.chartjsPluginZoom ||
            window["chartjs-plugin-zoom"];
    }

    if (zoomPlugin) {
        Chart.register(zoomPlugin.default ? zoomPlugin.default : zoomPlugin);
        if (typeof console !== "undefined") {
            console.log("[SignalCharts] Chart.js zoom plugin registered");
        }
    } else if (typeof console !== "undefined") {
        console.warn(
            "[SignalCharts] chartjs-plugin-zoom not found. Pan/zoom will be disabled."
        );
    }
}

// Composite axes + vertical crosshair plugin
const verticalLinePlugin = {
    id: "verticalLine",
    afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const yScale = chart.scales.y;
        const { left, right } = chart.chartArea;

        // Separation line between ECG (top) and PCG (bottom)
        const sepY = yScale.getPixelForValue(1.1);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(left, sepY);
        ctx.lineTo(right, sepY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.stroke();
        ctx.restore();

        // Common left axis x-position (inside chart area)
        const axisX = left + 12;

        // Helper to draw axis for a panel
        function drawPanelAxis({
            color,
            label,
            compositeMin,
            compositeMax,
            tickValues,
            valueToDisplay,
        }) {
            const yTop = yScale.getPixelForValue(compositeMax);
            const yBottom = yScale.getPixelForValue(compositeMin);

            // Axis line
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(axisX, yTop);
            ctx.lineTo(axisX, yBottom);
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.stroke();

            // Ticks + numeric labels
            ctx.font = "10px Arial";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            tickValues.forEach((tv) => {
                const yPix = yScale.getPixelForValue(tv);
                ctx.beginPath();
                ctx.moveTo(axisX - 5, yPix);
                ctx.lineTo(axisX, yPix);
                ctx.lineWidth = 1;
                ctx.stroke();
                const labelText = valueToDisplay(tv);
                ctx.fillText(labelText, axisX - 8, yPix);
            });

            // Axis title (vertical)
            ctx.save();
            ctx.translate(axisX - 28, (yTop + yBottom) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "center";
            ctx.fillStyle = color;
            ctx.fillText(label, 0, 0);
            ctx.restore();
            ctx.restore();
        }

        // ECG axis (top): composite 1.15..2.15, ticks step 0.2
        drawPanelAxis({
            color: "#28a745",
            label: "ECG (mV)",
            compositeMin: 1.15,
            compositeMax: 2.15,
            tickValues: [1.15, 1.35, 1.55, 1.75, 1.95, 2.15],
            valueToDisplay: (tv) => (tv - 1.15).toFixed(1),
        });

        // PCG axis (bottom): composite -1..1
        drawPanelAxis({
            color: "#17a2b8",
            label: "PCG",
            compositeMin: -1.0,
            compositeMax: 1.0,
            tickValues: [-1.0, -0.5, 0, 0.5, 1.0],
            valueToDisplay: (tv) => tv.toFixed(1),
        });

        // Vertical crosshair line on hover
        if (chart.tooltip?._active?.length) {
            const activePoint = chart.tooltip._active[0];
            const x = activePoint.element.x;
            const topY = yScale.top;
            const bottomY = yScale.bottom;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(128, 128, 128, 0.8)";
            ctx.stroke();
            ctx.restore();
        }
    },
};

// Register the custom plugin
if (typeof Chart !== "undefined" && Chart.register) {
    Chart.register(verticalLinePlugin);
}

/**
 * decodeAudioData helper that supports older browsers (Safari)
 */
function decodeAudioBuffer(audioContext, buffer) {
    if (audioContext.decodeAudioData.length === 1) {
        // Promise-based signature supported
        return audioContext.decodeAudioData(buffer);
    }

    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(buffer, resolve, reject);
    });
}

/**
 * Normalize data to [-1, 1] range
 */
function normalizeData(data) {
    if (!data || data.length === 0) return [];

    const dataMin = Math.min(...data);
    const dataMax = Math.max(...data);

    if (dataMax === dataMin) {
        return new Array(data.length).fill(0);
    }

    return data.map(
        (value) => (2 * (value - dataMin)) / (dataMax - dataMin) - 1
    );
}

/**
 * Normalize data to [0, 1] range (for ECG signals)
 */
function normalizeDataPositive(data) {
    if (!data || data.length === 0) return [];

    const dataMin = Math.min(...data);
    const dataMax = Math.max(...data);

    if (dataMax === dataMin) {
        return new Array(data.length).fill(0.5);
    }

    return data.map((value) => (value - dataMin) / (dataMax - dataMin));
}

/**
 * Replace all leading zeros with the first non-zero value
 * This prevents an artificial vertical jump at the start of ECG plots.
 */
function replaceLeadingZeros(values, epsilon = 1e-9) {
    if (!Array.isArray(values) || values.length === 0) return values;
    let firstIdx = 0;
    while (firstIdx < values.length && Math.abs(values[firstIdx]) <= epsilon) {
        firstIdx++;
    }
    if (firstIdx === 0 || firstIdx >= values.length) return values;
    const v = values[firstIdx];
    for (let i = 0; i < firstIdx; i++) {
        values[i] = v;
    }
    return values;
}

/**
 * Replace leading zeros for time-series points (objects with .y)
 */
function replaceLeadingZerosPoints(points, epsilon = 1e-9) {
    if (!Array.isArray(points) || points.length === 0) return points;
    let firstIdx = 0;
    while (
        firstIdx < points.length &&
        Math.abs(points[firstIdx]?.y ?? 0) <= epsilon
    ) {
        firstIdx++;
    }
    if (firstIdx === 0 || firstIdx >= points.length) return points;
    const v = points[firstIdx].y;
    for (let i = 0; i < firstIdx; i++) {
        points[i].y = v;
    }
    return points;
}

/**
 * Flatten initial ramp: from x=0 开始，直到第一个显著非零点（> threshold）为止，
 * 将这段的 y 统一设置为该显著非零点的 y。用于 ECG 去除起始“竖线”。
 */
function fixECGInitialSegment(points, threshold = 0.02) {
    if (!Array.isArray(points) || points.length === 0) return points;
    // 找到第一个显著非零点（归一化后 > threshold）
    let idx = 0;
    while (
        idx < points.length &&
        !(typeof points[idx]?.y === "number" && points[idx].y > threshold)
    ) {
        idx++;
    }
    if (idx === 0 || idx >= points.length) return points;
    const v = points[idx].y;
    for (let i = 0; i <= idx; i++) {
        points[i].y = v;
    }
    return points;
}

/**
 * Create Chart.js configuration for combined ECG and PCG display
 */
function createCombinedChartConfig(
    ecgPoints,
    pcgPoints,
    signalName,
    totalDuration,
    initialSeconds = INITIAL_VIEW_SECONDS
) {
    const initialMax = Math.min(initialSeconds, totalDuration);

    // Composite panel ranges
    const COMPOSITE_PCG_MIN = -1.0; // bottom of PCG panel
    const COMPOSITE_PCG_MAX = 1.0; // top of PCG panel
    const COMPOSITE_ECG_MIN = 1.15; // bottom of ECG panel (reduced gap)
    const COMPOSITE_ECG_MAX = 2.15; // top of ECG panel

    // Map ECG normalized values (may be <0 or >1) to panel height without剪裁
    const ecgYVals = ecgPoints.map((p) => p.y);
    const ecgNormMin = Math.min(...ecgYVals);
    const ecgNormMax = Math.max(...ecgYVals);
    const ecgNormRange = Math.max(1e-6, ecgNormMax - ecgNormMin);
    const ecgTransformed = ecgPoints.map((p) => ({
        x: p.x,
        y:
            COMPOSITE_ECG_MIN +
            ((p.y - ecgNormMin) / ecgNormRange) *
                (COMPOSITE_ECG_MAX - COMPOSITE_ECG_MIN),
    }));

    // Map PCG [-1,1] -> [-1,1] (unchanged)
    const pcgTransformed = pcgPoints.map((p) => ({
        x: p.x,
        y: p.y,
    }));

    return {
        type: "line",
        data: {
            datasets: [
                {
                    label: `ECG Signal: ${signalName}`,
                    data: ecgTransformed,
                    borderColor: "#dc3545",
                    backgroundColor: "rgba(0,0,0,0)",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0,
                    fill: false,
                    parsing: false,
                    yAxisID: "y",
                },
                {
                    label: `PCG Signal: ${signalName}`,
                    data: pcgTransformed,
                    borderColor: "#17a2b8",
                    backgroundColor: "rgba(0,0,0,0)",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0,
                    fill: false,
                    parsing: false,
                    yAxisID: "y",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: "nearest",
                axis: "x",
            },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        font: {
                            size: 12,
                            weight: "bold",
                        },
                    },
                },
                title: {
                    display: true,
                    text: `${signalName} - ECG & PCG Signals`,
                    font: {
                        size: 14,
                        weight: "bold",
                    },
                    padding: {
                        bottom: 15,
                    },
                },
                tooltip: {
                    enabled: true,
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        title: function (context) {
                            if (!context || !context.length) return "";
                            const time = context[0].parsed.x;
                            return `Time: ${time.toFixed(3)} s`;
                        },
                        label: function (context) {
                            const label = context.dataset.label || "";
                            const value = context.parsed.y;
                            return `${label}: ${value.toFixed(3)}`;
                        },
                    },
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "x",
                        limits: {
                            x: { min: 0, max: totalDuration },
                        },
                    },
                },
            },
            layout: {
                padding: { left: 56, right: 12, top: 8, bottom: 8 },
            },
            scales: {
                x: {
                    type: "linear",
                    display: true,
                    min: 0,
                    max: initialMax,
                    title: {
                        display: true,
                        text: "Time (s)",
                        font: {
                            size: 13,
                            weight: "bold",
                        },
                    },
                    ticks: {
                        callback: function (value) {
                            return value.toFixed(1);
                        },
                        font: {
                            size: 11,
                        },
                    },
                    grid: {
                        display: true,
                        color: "rgba(0, 0, 0, 0.05)",
                    },
                },
                y: {
                    type: "linear",
                    display: false,
                    position: "left",
                    min: COMPOSITE_PCG_MIN - 0.1,
                    max: COMPOSITE_ECG_MAX + 0.1,
                    grid: { display: false },
                },
            },
        },
    };
}

/**
 * Create Chart.js configuration for signal display
 */
function createChartConfig(
    timeSeriesData,
    signalInfo,
    color,
    totalDuration,
    initialSeconds = INITIAL_VIEW_SECONDS,
    yMin = -1.1,
    yMax = 1.1
) {
    const initialMax = Math.min(initialSeconds, totalDuration);

    return {
        type: "line",
        data: {
            datasets: [
                {
                    label: signalInfo.label,
                    data: timeSeriesData,
                    borderColor: color,
                    backgroundColor: "rgba(0,0,0,0)",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0,
                    fill: false,
                    parsing: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: "nearest",
                axis: "x",
            },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: {
                        font: {
                            size: 12,
                            weight: "bold",
                        },
                    },
                },
                title: {
                    display: true,
                    text: signalInfo.title,
                    font: {
                        size: 14,
                        weight: "bold",
                    },
                    padding: {
                        bottom: 15,
                    },
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        title: function (context) {
                            if (!context || !context.length) return "";
                            const time = context[0].parsed.x;
                            return `Time: ${time.toFixed(3)} s`;
                        },
                        label: function (context) {
                            return `Amplitude: ${context.parsed.y.toFixed(3)}`;
                        },
                    },
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "x",
                        limits: {
                            x: { min: 0, max: totalDuration },
                        },
                    },
                },
            },
            scales: {
                x: {
                    type: "linear",
                    display: true,
                    min: 0,
                    max: initialMax,
                    title: {
                        display: true,
                        text: "Time (s)",
                        font: {
                            size: 13,
                            weight: "bold",
                        },
                    },
                    ticks: {
                        callback: function (value) {
                            return value.toFixed(1);
                        },
                        font: {
                            size: 11,
                        },
                    },
                    grid: {
                        display: true,
                        color: "rgba(0, 0, 0, 0.05)",
                    },
                },
                y: {
                    display: true,
                    min: yMin,
                    max: yMax,
                    title: {
                        display: true,
                        text: "Normalized Amplitude",
                        font: {
                            size: 13,
                            weight: "bold",
                        },
                    },
                    ticks: {
                        stepSize: yMax > 1 ? 0.5 : 0.2,
                        font: {
                            size: 11,
                        },
                        callback: function (value) {
                            return value.toFixed(1);
                        },
                    },
                    grid: {
                        display: true,
                        color: "rgba(0, 0, 0, 0.1)",
                    },
                },
            },
        },
    };
}

/**
 * Downsample samples and convert to {x, y} time series points
 */
function buildTimeSeries(
    samples,
    sampleRate,
    maxPoints = MAX_POINTS,
    usePositiveNormalization = false
) {
    if (!samples || !samples.length) {
        return {
            points: [],
            normalizedSamples: [],
            totalDuration: 0,
            downsampledCount: 0,
        };
    }

    const safeSampleRate =
        sampleRate > 0 ? sampleRate : DEFAULT_ECG_SAMPLE_RATE;
    const step = Math.max(1, Math.floor(samples.length / maxPoints));

    const downsampledSamples = [];
    const downsampledIndices = [];

    for (let i = 0; i < samples.length; i += step) {
        downsampledSamples.push(samples[i]);
        downsampledIndices.push(i);
    }

    // Use appropriate normalization based on signal type
    const normalizedSamples = usePositiveNormalization
        ? normalizeDataPositive(downsampledSamples)
        : normalizeData(downsampledSamples);

    const points = normalizedSamples.map((value, idx) => ({
        x: downsampledIndices[idx] / safeSampleRate,
        y: value,
    }));

    return {
        points,
        normalizedSamples,
        totalDuration: samples.length / safeSampleRate,
        downsampledCount: normalizedSamples.length,
        sampleRate: safeSampleRate,
    };
}

function clamp(value, min, max) {
    if (max <= min) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

/**
 * Sync x-axis range between two charts
 */
function syncChartXAxis(sourceChart, targetChart) {
    if (!sourceChart || !targetChart) return;

    const sourceScale = sourceChart.scales.x;
    const targetScale = targetChart.scales.x;

    if (sourceScale && targetScale) {
        targetScale.options.min = sourceScale.options.min;
        targetScale.options.max = sourceScale.options.max;
        targetChart.update("none");
    }
}

function attachPanHandlers(chart, totalDuration) {
    if (!chart || !chart.canvas) return;

    const canvas = chart.canvas;

    if (chart._panHandlers) {
        canvas.removeEventListener("pointerdown", chart._panHandlers.down);
        window.removeEventListener("pointermove", chart._panHandlers.move);
        window.removeEventListener("pointerup", chart._panHandlers.up);
        window.removeEventListener("pointercancel", chart._panHandlers.up);
    }

    let dragging = false;
    let startX = 0;
    let startMin = 0;
    let startMax = 0;
    let viewSpan = 0;

    const getClientX = (event) => {
        if (event.touches && event.touches.length) {
            return event.touches[0].clientX;
        }
        return event.clientX;
    };

    const onPointerDown = (event) => {
        const scale = chart.scales.x;
        if (!scale) return;

        dragging = true;
        startX = getClientX(event);
        startMin = scale.min ?? scale.options.min ?? 0;
        startMax = scale.max ?? scale.options.max ?? totalDuration;
        viewSpan = startMax - startMin;

        canvas.style.cursor = "grabbing";
        event.preventDefault();
    };

    const onPointerMove = (event) => {
        if (!dragging) return;
        const scale = chart.scales.x;
        if (!scale) return;

        const chartArea = chart.chartArea;
        if (!chartArea) return;

        const currentX = getClientX(event);
        const deltaPx = currentX - startX;
        const width = chartArea.right - chartArea.left;
        if (width <= 0) return;

        const valuePerPixel = viewSpan / width;
        const deltaValue = deltaPx * valuePerPixel;

        let newMin = startMin - deltaValue;
        let newMax = startMax - deltaValue;

        if (viewSpan >= totalDuration) {
            newMin = 0;
            newMax = totalDuration;
        } else {
            newMin = clamp(newMin, 0, totalDuration - viewSpan);
            newMax = newMin + viewSpan;
        }

        scale.options.min = newMin;
        scale.options.max = newMax;
        chart.update("none");

        // Sync with the other chart
        if (chart === ecgChart && pcgChart) {
            syncChartXAxis(ecgChart, pcgChart);
        } else if (chart === pcgChart && ecgChart) {
            syncChartXAxis(pcgChart, ecgChart);
        }
    };

    const onPointerUp = () => {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    chart._panHandlers = {
        down: onPointerDown,
        move: onPointerMove,
        up: onPointerUp,
    };

    canvas.style.cursor = "grab";
}

/**
 * Update or create the combined chart with ECG and PCG data
 */
function updateCombinedChart(signalName) {
    if (!ecgData || !pcgData) {
        console.log("Waiting for both ECG and PCG data...");
        return;
    }

    const canvas = document.getElementById("combinedSignalCanvas");
    if (!canvas) {
        console.error("❌ Combined canvas not found");
        return;
    }

    const totalDuration = Math.min(
        signalDurationData.ecg,
        signalDurationData.pcg
    );

    console.log(
        `✓ Creating combined chart with ECG (${ecgData.points.length} points) and PCG (${pcgData.points.length} points)`
    );
    console.log(`  Total duration: ${totalDuration.toFixed(2)}s`);

    // Destroy existing chart if exists
    if (combinedChart) {
        combinedChart.destroy();
    }

    // Contrast-stretch ECG to enlarge vertical dynamic range (make panel heights visually similar)
    function contrastStretchPoints01(points, lowQ = 0.1, highQ = 0.95) {
        const ys = points
            .map((p) => p.y)
            .slice()
            .sort((a, b) => a - b);
        if (ys.length < 4) return points;
        const q = (arr, qf) =>
            arr[
                Math.max(
                    0,
                    Math.min(arr.length - 1, Math.floor(qf * (arr.length - 1)))
                )
            ];
        const minV = q(ys, lowQ);
        const maxV = q(ys, highQ);
        const denom = Math.max(1e-6, maxV - minV);
        return points.map((p) => ({
            x: p.x,
            // 不再夹紧到 [0,1]，保留极值，避免峰值被削顶
            y: (p.y - minV) / denom,
        }));
    }

    let ecgStretched = contrastStretchPoints01(ecgData.points, 0.1, 0.95);

    // 拉伸后再次修复起始段，确保左侧没有竖线
    ecgStretched = fixECGInitialSegment(ecgStretched, 0.05);

    // Create combined chart
    const ctx = canvas.getContext("2d");
    const config = createCombinedChartConfig(
        ecgStretched,
        pcgData.points,
        signalName,
        totalDuration
    );
    combinedChart = new Chart(ctx, config);
    attachPanHandlers(combinedChart, totalDuration);
    // 主动请求一次 resize，防止在容器可见性刚变化时宽度为旧值
    try {
        combinedChart.resize();
    } catch (e) {}

    // 监听父容器尺寸变化，自动 resize（兼容部分浏览器）
    try {
        const parentEl = canvas.parentElement;
        if (parentEl && typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => {
                if (combinedChart) {
                    combinedChart.resize();
                }
            });
            ro.observe(parentEl);
        }
    } catch (e) {}
}

/**
 * Load and visualize ECG signal from .dat file (binary format)
 */
async function loadECGSignal(signalName) {
    try {
        // Load .dat file as binary (ArrayBuffer)
        const response = await fetch(`static/signals/${signalName}.dat`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Parse binary data as 16-bit signed integers (PhysioNet format)
        // PhysioNet 2016 uses 16-bit signed integers in little-endian format
        const dataView = new DataView(arrayBuffer);
        const numSamples = arrayBuffer.byteLength / 2; // 2 bytes per sample
        const rawSamples = [];

        for (let i = 0; i < numSamples; i++) {
            // Read 16-bit signed integer in little-endian format
            const adcValue = dataView.getInt16(i * 2, true); // true = little-endian
            rawSamples.push(adcValue);
        }

        if (rawSamples.length === 0) {
            throw new Error("No data found in .dat file");
        }

        // Convert ADC values to physical values using .hea file parameters
        // From .hea: a0011.dat 16 1000 16 0 -1 25685 0 ECG
        // Format: bits gain base units adcZero adcGain
        // Physical value = (ADC value - baseline) / gain
        const gain = 1000; // From .hea file
        const baseline = 0; // From .hea file

        const samples = rawSamples.map(
            (adcValue) => (adcValue - baseline) / gain
        );

        console.log(
            `✓ Parsed ${samples.length} samples as 16-bit signed integers`
        );
        console.log(
            `  ADC range: [${Math.min(...rawSamples)}, ${Math.max(
                ...rawSamples
            )}]`
        );
        console.log(
            `  Physical range: [${Math.min(...samples).toFixed(3)}, ${Math.max(
                ...samples
            ).toFixed(3)}] mV`
        );

        // Assume sample rate is 2000 Hz (PhysioNet 2016 dataset reference)
        const sampleRate = DEFAULT_ECG_SAMPLE_RATE;
        let { points, totalDuration, downsampledCount } = buildTimeSeries(
            samples,
            sampleRate,
            MAX_POINTS,
            true // Use [0, 1] normalization for ECG
        );

        // 修复起始段：把 x=0 开始直到第一个显著非零点之间的 y 设置为该点的 y
        points = fixECGInitialSegment(points, 0.02);

        console.log(
            `✓ Loaded ECG: ${downsampledCount} points (downsampled from ${samples.length})`
        );
        console.log(
            `  Sample rate ~${sampleRate} Hz, duration ≈ ${totalDuration.toFixed(
                2
            )} s`
        );

        // Store ECG data for combined chart
        ecgData = {
            points: points,
            totalDuration: totalDuration,
            downsampledCount: downsampledCount,
        };
        signalDurationData.ecg = totalDuration;

        // Store ECG duration for inference
        if (typeof window.signalDurations === "undefined") {
            window.signalDurations = {};
        }
        if (!window.signalDurations[signalName]) {
            window.signalDurations[signalName] = {};
        }
        window.signalDurations[signalName].ecg = totalDuration;
        console.log(
            `✓ Stored ECG duration for ${signalName}: ${totalDuration.toFixed(
                2
            )}s`
        );

        // Update combined chart
        updateCombinedChart(signalName);
    } catch (error) {
        console.error("❌ Error loading ECG signal:", error);
        alert(`Error loading ECG signal: ${error.message}`);
    }
}

/**
 * Parse WAV file header and extract PCM data directly
 */
function parseWavFile(arrayBuffer) {
    const view = new DataView(arrayBuffer);

    // Check RIFF header
    const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
    );
    if (riff !== "RIFF") {
        throw new Error("Not a valid WAV file (missing RIFF header)");
    }

    // Check WAVE format
    const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
    );
    if (wave !== "WAVE") {
        throw new Error("Not a valid WAV file (missing WAVE format)");
    }

    // Find data chunk (skip fmt chunk)
    let offset = 12;
    let dataOffset = -1;
    let dataSize = 0;
    let sampleRate = 2000; // default
    let bitsPerSample = 16; // default

    while (offset + 8 <= view.byteLength) {
        const chunkId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
        );
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === "fmt ") {
            // Read sample rate and bits per sample from fmt chunk
            sampleRate = view.getUint32(offset + 12, true);
            bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === "data") {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }

        offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (dataOffset === -1) {
        throw new Error("No data chunk found in WAV file");
    }

    // Read PCM data
    const samples = [];
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = dataSize / bytesPerSample;

    for (let i = 0; i < numSamples; i++) {
        let sample;
        if (bitsPerSample === 16) {
            // 16-bit signed PCM
            sample = view.getInt16(dataOffset + i * 2, true) / 32768.0;
        } else if (bitsPerSample === 8) {
            // 8-bit unsigned PCM
            sample = (view.getUint8(dataOffset + i) - 128) / 128.0;
        } else {
            throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
        }
        samples.push(sample);
    }

    return {
        samples: samples,
        sampleRate: sampleRate,
        duration: numSamples / sampleRate,
    };
}

/**
 * Load and visualize PCG signal from .wav file
 */
async function loadPCGSignal(signalName) {
    try {
        // Load audio file as array buffer
        const response = await fetch(`static/signals/${signalName}.wav`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const originalBuffer = await response.arrayBuffer();
        const decodeBuffer = originalBuffer.slice(0); // copy for Web Audio API

        // Try Web Audio API first, fallback to manual parsing
        let samples;
        let sampleRate;
        let duration;
        let decoderMethod = "WebAudio";

        try {
            // Method 1: Web Audio API (preferred, handles various formats)
            const audioContext = new (window.AudioContext ||
                window.webkitAudioContext)();
            const audioBuffer = await decodeAudioBuffer(
                audioContext,
                decodeBuffer
            );

            const channelData = audioBuffer.getChannelData(0);
            samples = Array.from(channelData);
            sampleRate = DEFAULT_PCG_SAMPLE_RATE;
            duration = samples.length / sampleRate;

            console.log("✓ Using Web Audio API for decoding");
        } catch (webAudioError) {
            // Method 2: Manual WAV parsing (fallback)
            console.warn(
                "⚠ Web Audio API failed, using manual WAV parser:",
                webAudioError.message
            );
            const wavData = parseWavFile(originalBuffer);
            samples = wavData.samples;
            sampleRate = DEFAULT_PCG_SAMPLE_RATE;
            duration = samples.length / sampleRate;
            decoderMethod = "Manual PCM Parser";

            console.log("✓ Using manual WAV parser");
        }

        const { points, totalDuration, downsampledCount } = buildTimeSeries(
            samples,
            sampleRate
        );

        console.log(
            `✓ Loaded PCG: ${downsampledCount} points (from ${samples.length}) via ${decoderMethod}`
        );
        console.log(
            `  Sample rate ${sampleRate} Hz, duration ${totalDuration.toFixed(
                2
            )} s`
        );

        // Store PCG data for combined chart
        pcgData = {
            points: points,
            totalDuration: totalDuration,
            downsampledCount: downsampledCount,
        };
        signalDurationData.pcg = totalDuration;

        // Store PCG duration for inference
        if (typeof window.signalDurations === "undefined") {
            window.signalDurations = {};
        }
        if (!window.signalDurations[signalName]) {
            window.signalDurations[signalName] = {};
        }
        window.signalDurations[signalName].pcg = totalDuration;
        console.log(
            `✓ Stored PCG duration for ${signalName}: ${totalDuration.toFixed(
                2
            )}s`
        );

        // Update combined chart
        updateCombinedChart(signalName);
    } catch (error) {
        console.error("❌ Error loading PCG signal:", error);
        console.error("Error details:", error.name, error.message);
        alert(`Error loading PCG signal: ${error.message}`);
    }
}
