window.HELP_IMPROVE_VIDEOJS = false;

// More Works Dropdown Functionality
function toggleMoreWorks() {
    const dropdown = document.getElementById("moreWorksDropdown");
    const button = document.querySelector(".more-works-btn");

    if (dropdown.classList.contains("show")) {
        dropdown.classList.remove("show");
        button.classList.remove("active");
    } else {
        dropdown.classList.add("show");
        button.classList.add("active");
    }
}

// Close dropdown when clicking outside
document.addEventListener("click", function (event) {
    const container = document.querySelector(".more-works-container");
    const dropdown = document.getElementById("moreWorksDropdown");
    const button = document.querySelector(".more-works-btn");

    if (container && !container.contains(event.target)) {
        dropdown.classList.remove("show");
        button.classList.remove("active");
    }
});

// Close dropdown on escape key
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        const dropdown = document.getElementById("moreWorksDropdown");
        const button = document.querySelector(".more-works-btn");
        dropdown.classList.remove("show");
        button.classList.remove("active");
    }
});

// Copy BibTeX to clipboard
function copyBibTeX() {
    const bibtexElement = document.getElementById("bibtex-code");
    const button = document.querySelector(".copy-bibtex-btn");
    const copyText = button.querySelector(".copy-text");

    if (bibtexElement) {
        navigator.clipboard
            .writeText(bibtexElement.textContent)
            .then(function () {
                // Success feedback
                button.classList.add("copied");
                copyText.textContent = "Cop";

                setTimeout(function () {
                    button.classList.remove("copied");
                    copyText.textContent = "Copy";
                }, 2000);
            })
            .catch(function (err) {
                console.error("Failed to copy: ", err);
                // Fallback for older browsers
                const textArea = document.createElement("textarea");
                textArea.value = bibtexElement.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);

                button.classList.add("copied");
                copyText.textContent = "Cop";
                setTimeout(function () {
                    button.classList.remove("copied");
                    copyText.textContent = "Copy";
                }, 2000);
            });
    }
}

// Scroll to top functionality
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

// Show/hide scroll to top button
window.addEventListener("scroll", function () {
    const scrollButton = document.querySelector(".scroll-to-top");
    if (!scrollButton) {
        return;
    }
    if (window.pageYOffset > 300) {
        scrollButton.classList.add("visible");
    } else {
        scrollButton.classList.remove("visible");
    }
});

// Video carousel autoplay when in view
function setupVideoCarouselAutoplay() {
    const carouselVideos = document.querySelectorAll(".results-carousel video");

    if (carouselVideos.length === 0) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    // Video is in view, play it
                    video.play().catch((e) => {
                        // Autoplay failed, probably due to browser policy
                        console.log("Autoplay prevented:", e);
                    });
                } else {
                    // Video is out of view, pause it
                    video.pause();
                }
            });
        },
        {
            threshold: 0.5, // Trigger when 50% of the video is visible
        }
    );

    carouselVideos.forEach((video) => {
        observer.observe(video);
    });
}

// Signal files list
const signalFiles = [
    "a0001",
    "a0002",
    "a0003",
    "a0004",
    "a0005",
    "a0007",
    "a0009",
    "a0010",
    "a0011",
    "a0012",
    "a0013",
    "a0014",
    "a0015",
    "a0016",
    "a0017",
    "a0018",
    "a0019",
    "a0020",
    "a0021",
    "a0022",
    "a0023",
    "a0024",
    "a0025",
    "a0026",
    "a0027",
    "a0028",
    "a0029",
    "a0030",
    "a0031",
    "a0032",
    "a0033",
    "a0034",
    "a0035",
    "a0036",
    "a0037",
    "a0038",
    "a0039",
    "a0040",
    "a0042",
    "a0043",
    "a0044",
    "a0045",
    "a0046",
    "a0047",
    "a0048",
    "a0049",
    "a0050",
    "a0052",
    "a0053",
    "a0054",
    "a0055",
    "a0056",
    "a0057",
    "a0058",
    "a0059",
    "a0060",
    "a0061",
    "a0062",
    "a0063",
    "a0064",
    "a0065",
    "a0066",
    "a0067",
    "a0068",
    "a0069",
    "a0070",
    "a0071",
    "a0072",
    "a0073",
    "a0075",
    "a0076",
    "a0077",
    "a0078",
    "a0079",
    "a0080",
    "a0081",
    "a0082",
    "a0083",
    "a0084",
    "a0085",
    "a0086",
    "a0087",
    "a0088",
    "a0090",
    "a0091",
    "a0092",
    "a0093",
    "a0094",
    "a0095",
    "a0096",
    "a0097",
    "a0098",
    "a0099",
    "a0100",
    "a0101",
    "a0102",
    "a0103",
    "a0104",
    "a0105",
    "a0106",
    "a0107",
    "a0108",
    "a0109",
    "a0110",
    "a0112",
    "a0113",
    "a0114",
    "a0115",
    "a0116",
    "a0118",
    "a0119",
    "a0120",
    "a0121",
    "a0122",
    "a0123",
    "a0124",
    "a0125",
    "a0126",
    "a0127",
    "a0128",
    "a0129",
    "a0130",
    "a0131",
    "a0132",
    "a0133",
    "a0134",
    "a0135",
    "a0136",
    "a0137",
    "a0139",
    "a0140",
    "a0141",
    "a0142",
    "a0143",
    "a0144",
    "a0145",
    "a0146",
    "a0148",
    "a0149",
    "a0150",
    "a0151",
    "a0152",
    "a0153",
    "a0154",
    "a0155",
    "a0156",
    "a0157",
    "a0158",
    "a0159",
    "a0160",
    "a0161",
    "a0162",
    "a0163",
    "a0165",
    "a0166",
    "a0167",
    "a0168",
    "a0169",
    "a0170",
    "a0171",
    "a0172",
    "a0173",
    "a0174",
    "a0175",
    "a0176",
    "a0177",
    "a0178",
    "a0179",
    "a0180",
    "a0181",
    "a0182",
    "a0183",
    "a0184",
    "a0185",
    "a0186",
    "a0187",
    "a0188",
    "a0189",
    "a0190",
    "a0191",
    "a0192",
    "a0193",
    "a0194",
    "a0195",
    "a0196",
    "a0197",
    "a0198",
    "a0199",
    "a0200",
    "a0201",
    "a0202",
    "a0203",
    "a0204",
    "a0205",
    "a0206",
    "a0207",
    "a0208",
    "a0209",
    "a0210",
    "a0211",
    "a0212",
    "a0213",
    "a0214",
    "a0215",
    "a0216",
    "a0217",
    "a0218",
    "a0219",
    "a0221",
    "a0222",
    "a0223",
    "a0224",
    "a0225",
    "a0226",
    "a0227",
    "a0228",
    "a0229",
    "a0230",
    "a0231",
    "a0232",
    "a0234",
    "a0235",
    "a0236",
    "a0237",
    "a0238",
    "a0239",
    "a0240",
    "a0241",
    "a0242",
    "a0243",
    "a0244",
    "a0245",
    "a0246",
    "a0247",
    "a0248",
    "a0249",
    "a0250",
    "a0252",
    "a0253",
    "a0254",
    "a0255",
    "a0256",
    "a0257",
    "a0258",
    "a0259",
    "a0260",
    "a0261",
    "a0262",
    "a0263",
    "a0264",
    "a0265",
    "a0266",
    "a0267",
    "a0268",
    "a0269",
    "a0270",
    "a0271",
    "a0272",
    "a0273",
    "a0274",
    "a0275",
    "a0276",
    "a0277",
    "a0278",
    "a0279",
    "a0280",
    "a0281",
    "a0282",
    "a0283",
    "a0284",
    "a0285",
    "a0286",
    "a0287",
    "a0288",
    "a0289",
    "a0290",
    "a0291",
    "a0292",
    "a0293",
    "a0294",
    "a0295",
    "a0296",
    "a0297",
    "a0298",
    "a0299",
    "a0300",
    "a0301",
    "a0302",
    "a0303",
    "a0304",
    "a0305",
    "a0306",
    "a0307",
    "a0308",
    "a0309",
    "a0310",
    "a0311",
    "a0312",
    "a0313",
    "a0316",
    "a0317",
    "a0319",
    "a0320",
    "a0321",
    "a0322",
    "a0323",
    "a0324",
    "a0325",
    "a0326",
    "a0327",
    "a0328",
    "a0329",
    "a0331",
    "a0332",
    "a0333",
    "a0334",
    "a0335",
    "a0336",
    "a0337",
    "a0338",
    "a0339",
    "a0340",
    "a0341",
    "a0342",
    "a0343",
    "a0344",
    "a0345",
    "a0346",
    "a0347",
    "a0348",
    "a0349",
    "a0350",
    "a0351",
    "a0352",
    "a0353",
    "a0354",
    "a0355",
    "a0356",
    "a0357",
    "a0358",
    "a0359",
    "a0360",
    "a0361",
    "a0362",
    "a0363",
    "a0364",
    "a0365",
    "a0366",
    "a0367",
    "a0368",
    "a0369",
    "a0370",
    "a0371",
    "a0372",
    "a0373",
    "a0374",
    "a0375",
    "a0376",
    "a0377",
    "a0378",
    "a0380",
    "a0381",
    "a0382",
    "a0383",
    "a0384",
    "a0385",
    "a0386",
    "a0387",
    "a0388",
    "a0389",
    "a0390",
    "a0391",
    "a0392",
    "a0393",
    "a0394",
    "a0396",
    "a0397",
    "a0398",
    "a0399",
    "a0400",
    "a0401",
    "a0402",
    "a0404",
    "a0405",
    "a0406",
    "a0407",
    "a0408",
    "a0409"
];

let currentSignal = null;
let groundTruthLabels = {}; // Store ground truth labels from CSV

// signalDurations is stored in window.signalDurations by signal_charts.js

// Model performance data
const modelPerformance = {
    pacfnet: {
        accuracy: 97.77,
        sensitivity: 97.99,
        specificity: 97.28,
        f1: 98.39,
    },
};

// Load ground truth labels from CSV
async function loadGroundTruthLabels() {
    try {
        const response = await fetch("static/Result.csv");
        if (!response.ok) {
            console.error("Failed to load Result.csv");
            return;
        }

        const text = await response.text();
        const lines = text.trim().split("\n");

        lines.forEach((line) => {
            const [sampleName, label] = line.split(",");
            if (sampleName && label) {
                // CSV format: 1 = Abnormal, -1 = Normal
                groundTruthLabels[sampleName.trim()] = parseInt(label.trim());
            }
        });

        console.log(
            `✓ Loaded ${
                Object.keys(groundTruthLabels).length
            } ground truth labels`
        );

        // Debug: Show first few labels
        const sampleLabels = ["a0001", "a0007", "a0040"];
        console.log("Sample labels from CSV:");
        sampleLabels.forEach((sample) => {
            const label = groundTruthLabels[sample];
            if (label !== undefined) {
                console.log(
                    `  ${sample}: ${label} (${
                        label === 1 ? "Abnormal" : "Normal"
                    })`
                );
            }
        });
    } catch (error) {
        console.error("Error loading ground truth labels:", error);
    }
}

// Load ground truth labels on page load
loadGroundTruthLabels();

// Show signal selector modal
function showSignalSelector() {
    const modal = document.getElementById("signalModal");
    const signalList = document.getElementById("signalList");

    // Populate signal list
    let html = '<div class="list">';
    signalFiles.forEach((signal) => {
        html += `
            <a class="list-item signal-item" onclick="selectSignal('${signal}')">
                <div class="list-item-content">
                    <div class="list-item-title">
                        <span class="icon has-text-info">
                            <i class="fas fa-file-waveform"></i>
                        </span>
                        ${signal}
                    </div>
                    <div class="list-item-description">
                        <span class="tag is-light">ECG (.dat)</span>
                        <span class="tag is-light">PCG (.wav)</span>
                    </div>
                </div>
                <span class="icon">
                    <i class="fas fa-chevron-right"></i>
                </span>
            </a>
        `;
    });
    html += "</div>";

    signalList.innerHTML = html;
    modal.classList.add("is-active");
}

// Close signal selector modal
function closeSignalSelector() {
    const modal = document.getElementById("signalModal");
    modal.classList.remove("is-active");
}

// Filter signals based on search
function filterSignals() {
    const searchTerm = document
        .getElementById("signalSearch")
        .value.toLowerCase();
    const items = document.querySelectorAll(".signal-item");

    items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });
}

// Select a signal
function selectSignal(signalName, options = {}) {
    currentSignal = signalName;

    // Update UI
    const selectedTag = document.getElementById("selectedSignalName");
    const selectedContainer = document.getElementById(
        "selectedSignalContainer"
    );

    if (selectedTag && selectedContainer) {
        selectedTag.textContent = signalName;
        selectedContainer.style.display = "block";
    }

    const localMeta = document.getElementById("selectedLocalMeta");
    if (localMeta) {
        if (options && options.localUpload) {
            const hours = options.expiresAt
                ? Math.max(
                      1,
                      Math.ceil((options.expiresAt - Date.now()) / 3600000)
                  )
                : 24;
            const stem = options.localStem || signalName;
            localMeta.style.display = "inline-flex";
            localMeta.textContent = `Local · ${hours}h left · ${stem}.wav/.dat`;
        } else {
            localMeta.style.display = "none";
            localMeta.textContent = "";
        }
    }

    // Show visualization area
    const vizArea = document.getElementById("signalVisualization");
    if (vizArea) {
        vizArea.style.display = "block";
        // Force a resize so charts compute width after the container becomes visible
        setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    }

    // Load and display signals
    loadECGSignal(signalName);
    loadPCGSignal(signalName);

    // Hide results
    const results = document.getElementById("inferenceResults");
    if (results) {
        results.style.display = "none";
    }

    // Close modal
    closeSignalSelector();

    // Scroll to visualization
    if (vizArea) {
        vizArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
        setTimeout(() => window.dispatchEvent(new Event("resize")), 600);
    }
}

// ============================================================
// Signal Visualization Functions
// ============================================================
// Note: ECG and PCG signal visualization functions are now in signal_charts.js
// Using Chart.js for professional-looking charts
// - loadECGSignal(signalName)
// - loadPCGSignal(signalName)
// ============================================================

// Helper function to add log entry
function addLogEntry(message, type = "info") {
    const logContent = document.getElementById("logContent");
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    const icon = type === "success" ? "✓" : type === "error" ? "✗" : "►";
    const color =
        type === "success"
            ? "#00ff00"
            : type === "error"
            ? "#ff4444"
            : "#00ff00";

    const logEntry = document.createElement("div");
    logEntry.style.color = color;
    logEntry.innerHTML = `[${timestamp}] ${icon} ${message}`;
    logContent.appendChild(logEntry);

    // Auto-scroll to bottom
    logContent.scrollTop = logContent.scrollHeight;
}

// Helper function to clear log
function clearLog() {
    const logContent = document.getElementById("logContent");
    logContent.innerHTML = "";
}

// Toggle inference log visibility
function toggleInferenceLog() {
    const logContent = document.getElementById("logContent");
    const toggleIcon = document.getElementById("logToggleIcon");

    if (logContent.style.display === "none") {
        logContent.style.display = "block";
        toggleIcon.innerHTML = '<i class="fas fa-chevron-up"></i>';
    } else {
        logContent.style.display = "none";
        toggleIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

// Helper function to create random delay
function randomDelay(min, max) {
    return new Promise((resolve) => {
        const delay = Math.random() * (max - min) + min;
        setTimeout(resolve, delay * 1000);
    });
}

// Run staged inference pipeline (UI stageboard + synced log)
async function runInference() {
    if (!currentSignal) {
        alert("Please select a signal first!");
        return;
    }

    if (
        typeof InferencePipeline === "undefined" ||
        typeof InferenceUI === "undefined"
    ) {
        alert("Inference modules failed to load. Please refresh the page.");
        return;
    }

    const btn = document.getElementById("inferenceBtn");
    const resultsDiv = document.getElementById("inferenceResults");
    const logDiv = document.getElementById("inferenceLog");
    const logContent = document.getElementById("logContent");
    const stageboard = document.getElementById("inferenceStageboard");

    // Keep button label visible across phases (avoid Bulma is-loading hide).
    btn.classList.remove("is-loading");
    btn.disabled = true;
    resultsDiv.style.display = "none";
    logDiv.style.display = "block";
    logContent.style.display = "block";
    document.getElementById("logToggleIcon").innerHTML =
        '<i class="fas fa-chevron-up"></i>';
    if (stageboard) stageboard.style.display = "block";

    const bus = InferencePipeline.createEmitter();
    InferenceUI.subscribeToBus(bus);

    try {
        const performance = modelPerformance.pacfnet;
        const groundTruth = groundTruthLabels[currentSignal];
        if (groundTruth === undefined) {
            throw new Error(
                `No ground truth data available for ${currentSignal}`
            );
        }

        const raw = window.currentSignalRaw;
        if (
            !raw ||
            raw.signalName !== currentSignal ||
            !raw.ecg?.length ||
            !raw.pcg?.length
        ) {
            throw new Error(
                "Please wait for ECG and PCG signals to finish loading."
            );
        }

        const result = await InferencePipeline.runPipeline({
            emit: (event) => bus.emit(event),
            raw,
            sampleId: currentSignal,
            groundTruth,
            accuracy: performance.accuracy / 100,
        });

        const pred = result.prediction;
        const isAbnormal = pred.isAbnormal;

        const currentModelNameEl = document.getElementById("currentModelName");
        if (currentModelNameEl) {
            currentModelNameEl.textContent = "Proposed PACFNet";
        }
        const currentSampleTagEl = document.getElementById("currentSampleTag");
        if (currentSampleTagEl) {
            currentSampleTagEl.textContent = currentSignal;
        }

        document.getElementById("predictionClass").textContent = isAbnormal
            ? "Abnormal"
            : "Normal";
        document.getElementById("predictionClass").className = isAbnormal
            ? "title is-3 has-text-danger"
            : "title is-3 has-text-success";
        document.getElementById("predictionConfidence").textContent =
            pred.confidence.toFixed(1) + "%";

        const voteSummary = document.getElementById("predictionVoteSummary");
        if (voteSummary) {
            voteSummary.textContent = `${pred.total} segments · Abnormal ${pred.abnormal} · Normal ${pred.normal}`;
        }

        document.getElementById("metricAccuracy").textContent =
            performance.accuracy.toFixed(2) + "%";
        document.getElementById("metricSensitivity").textContent =
            performance.sensitivity.toFixed(2) + "%";
        document.getElementById("metricSpecificity").textContent =
            performance.specificity.toFixed(2) + "%";
        document.getElementById("metricF1").textContent =
            performance.f1.toFixed(2) + "%";

        await randomDelay(0.35, 0.55);
        logContent.style.display = "none";
        document.getElementById("logToggleIcon").innerHTML =
            '<i class="fas fa-chevron-down"></i>';

        resultsDiv.style.display = "block";
        resultsDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        bus.emit({
            type: "pipeline_error",
            phase: null,
            payload: { message: error.message },
        });
        alert(error.message);
    } finally {
        btn.classList.remove("is-loading");
        btn.disabled = false;
        const label = btn.querySelector("span:last-child");
        if (label) label.textContent = "Run Inference";
    }
}

$(document).ready(function () {
    // Check for click events on the navbar burger icon

    var options = {
        slidesToScroll: 1,
        slidesToShow: 1,
        loop: true,
        infinite: true,
        autoplay: true,
        autoplaySpeed: 5000,
    };

    // Initialize all div with carousel class
    var carousels = bulmaCarousel.attach(".carousel", options);

    bulmaSlider.attach();

    // Setup video autoplay for carousel
    setupVideoCarouselAutoplay();
});
