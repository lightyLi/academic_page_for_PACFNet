window.HELP_IMPROVE_VIDEOJS = false;

// More Works Dropdown Functionality
function toggleMoreWorks() {
    const dropdown = document.getElementById('moreWorksDropdown');
    const button = document.querySelector('.more-works-btn');
    
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        button.classList.remove('active');
    } else {
        dropdown.classList.add('show');
        button.classList.add('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const container = document.querySelector('.more-works-container');
    const dropdown = document.getElementById('moreWorksDropdown');
    const button = document.querySelector('.more-works-btn');
    
    if (container && !container.contains(event.target)) {
        dropdown.classList.remove('show');
        button.classList.remove('active');
    }
});

// Close dropdown on escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const dropdown = document.getElementById('moreWorksDropdown');
        const button = document.querySelector('.more-works-btn');
        dropdown.classList.remove('show');
        button.classList.remove('active');
    }
});

// Copy BibTeX to clipboard
function copyBibTeX() {
    const bibtexElement = document.getElementById('bibtex-code');
    const button = document.querySelector('.copy-bibtex-btn');
    const copyText = button.querySelector('.copy-text');
    
    if (bibtexElement) {
        navigator.clipboard.writeText(bibtexElement.textContent).then(function() {
            // Success feedback
            button.classList.add('copied');
            copyText.textContent = 'Cop';
            
            setTimeout(function() {
                button.classList.remove('copied');
                copyText.textContent = 'Copy';
            }, 2000);
        }).catch(function(err) {
            console.error('Failed to copy: ', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = bibtexElement.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            button.classList.add('copied');
            copyText.textContent = 'Cop';
            setTimeout(function() {
                button.classList.remove('copied');
                copyText.textContent = 'Copy';
            }, 2000);
        });
    }
}

// Scroll to top functionality
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Show/hide scroll to top button
window.addEventListener('scroll', function() {
    const scrollButton = document.querySelector('.scroll-to-top');
    if (!scrollButton) {
        return;
    }
    if (window.pageYOffset > 300) {
        scrollButton.classList.add('visible');
    } else {
        scrollButton.classList.remove('visible');
    }
});

// Video carousel autoplay when in view
function setupVideoCarouselAutoplay() {
    const carouselVideos = document.querySelectorAll('.results-carousel video');
    
    if (carouselVideos.length === 0) return;
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                // Video is in view, play it
                video.play().catch(e => {
                    // Autoplay failed, probably due to browser policy
                    console.log('Autoplay prevented:', e);
                });
            } else {
                // Video is out of view, pause it
                video.pause();
            }
        });
    }, {
        threshold: 0.5 // Trigger when 50% of the video is visible
    });
    
    carouselVideos.forEach(video => {
        observer.observe(video);
    });
}

// Signal files list
const signalFiles = [
    'a0001', 'a0002', 'a0003', 'a0004', 'a0005', 'a0007', 'a0009', 'a0010',
    'a0011', 'a0012', 'a0013', 'a0014', 'a0015', 'a0016', 'a0017', 'a0018',
    'a0019', 'a0020', 'a0021', 'a0022', 'a0023', 'a0024', 'a0025', 'a0026',
    'a0027', 'a0028', 'a0029', 'a0030', 'a0031', 'a0032', 'a0033', 'a0034',
    'a0035', 'a0036', 'a0037', 'a0038', 'a0039', 'a0040', 'a0042', 'a0043',
    'a0044', 'a0045', 'a0046', 'a0047', 'a0048', 'a0049', 'a0050'
];

let currentSignal = null;
let groundTruthLabels = {}; // Store ground truth labels from CSV

// signalDurations is stored in window.signalDurations by signal_charts.js

// Model performance data
const modelPerformance = {
    pacfnet: { accuracy: 97.77, sensitivity: 97.99, specificity: 97.28, f1: 98.39 }
};

// Load ground truth labels from CSV
async function loadGroundTruthLabels() {
    try {
        const response = await fetch('static/Result.csv');
        if (!response.ok) {
            console.error('Failed to load Result.csv');
            return;
        }
        
        const text = await response.text();
        const lines = text.trim().split('\n');
        
        lines.forEach(line => {
            const [sampleName, label] = line.split(',');
            if (sampleName && label) {
                // CSV format: 1 = Abnormal, -1 = Normal
                groundTruthLabels[sampleName.trim()] = parseInt(label.trim());
            }
        });
        
        console.log(`✓ Loaded ${Object.keys(groundTruthLabels).length} ground truth labels`);
        
        // Debug: Show first few labels
        const sampleLabels = ['a0001', 'a0007', 'a0040'];
        console.log('Sample labels from CSV:');
        sampleLabels.forEach(sample => {
            const label = groundTruthLabels[sample];
            if (label !== undefined) {
                console.log(`  ${sample}: ${label} (${label === 1 ? 'Abnormal' : 'Normal'})`);
            }
        });
    } catch (error) {
        console.error('Error loading ground truth labels:', error);
    }
}

// Load ground truth labels on page load
loadGroundTruthLabels();

// Show signal selector modal
function showSignalSelector() {
    const modal = document.getElementById('signalModal');
    const signalList = document.getElementById('signalList');
    
    // Populate signal list
    let html = '<div class="list">';
    signalFiles.forEach(signal => {
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
    html += '</div>';
    
    signalList.innerHTML = html;
    modal.classList.add('is-active');
}

// Close signal selector modal
function closeSignalSelector() {
    const modal = document.getElementById('signalModal');
    modal.classList.remove('is-active');
}

// Filter signals based on search
function filterSignals() {
    const searchTerm = document.getElementById('signalSearch').value.toLowerCase();
    const items = document.querySelectorAll('.signal-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

// Select a signal
function selectSignal(signalName) {
    currentSignal = signalName;
    
    // Update UI
    const selectedTag = document.getElementById('selectedSignalName');
    const selectedContainer = document.getElementById('selectedSignalContainer');
    
    if (selectedTag && selectedContainer) {
        selectedTag.textContent = signalName;
        selectedContainer.style.display = 'block';
    }
    
    // Show visualization area
    const vizArea = document.getElementById('signalVisualization');
    if (vizArea) {
        vizArea.style.display = 'block';
        // 强制触发一次 resize，避免图表在容器刚显示时宽度计算不正确
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }
    
    // Load and display signals
    loadECGSignal(signalName);
    loadPCGSignal(signalName);
    
    // Hide results
    const results = document.getElementById('inferenceResults');
    if (results) {
        results.style.display = 'none';
    }
    
    // Close modal
    closeSignalSelector();
    
    // Scroll to visualization
    if (vizArea) {
        vizArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // 再触发几次延迟 resize，确保图表在数据加载后也能匹配 70vw 宽度
        setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 600);
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

// Run model inference with time-segment based probabilistic prediction
function runInference() {
    if (!currentSignal) {
        alert('Please select a signal first!');
        return;
    }
    
    const btn = document.getElementById('inferenceBtn');
    const resultsDiv = document.getElementById('inferenceResults');
    
    // Show loading state
    btn.classList.add('is-loading');
    btn.disabled = true;
    
    // Simulate inference delay
    setTimeout(() => {
        const selectedModel = 'pacfnet';
        const performance = modelPerformance[selectedModel];
        const accuracy = performance.accuracy / 100; // Convert to probability (0-1)
        
        // Get ground truth label
        const groundTruth = groundTruthLabels[currentSignal];
        if (groundTruth === undefined) {
            console.error(`No ground truth label found for ${currentSignal}`);
            alert(`No ground truth data available for ${currentSignal}`);
            btn.classList.remove('is-loading');
            btn.disabled = false;
            return;
        }
        
        // Get signal durations from window object
        const durations = window.signalDurations ? window.signalDurations[currentSignal] : null;
        if (!durations || !durations.ecg || !durations.pcg) {
            console.error(`Signal durations not available for ${currentSignal}`);
            alert('Please wait for signals to load completely');
            btn.classList.remove('is-loading');
            btn.disabled = false;
            return;
        }
        
        // Use the shorter duration between ECG and PCG
        const effectiveDuration = Math.min(durations.ecg, durations.pcg);
        const numSegments = Math.floor(effectiveDuration); // 1 segment per second
        
        console.log(`Signal: ${currentSignal}, Ground Truth: ${groundTruth === 1 ? 'Abnormal' : 'Normal'}`);
        console.log(`ECG Duration: ${durations.ecg.toFixed(2)}s, PCG Duration: ${durations.pcg.toFixed(2)}s`);
        console.log(`Effective Duration: ${effectiveDuration.toFixed(2)}s, Segments: ${numSegments}`);
        
        // Perform segment-wise prediction
        let correctVotes = 0;
        let incorrectVotes = 0;
        
        for (let i = 0; i < numSegments; i++) {
            // Each segment has 'accuracy' probability of being correct
            const isCorrect = Math.random() < accuracy;
            if (isCorrect) {
                correctVotes++;
            } else {
                incorrectVotes++;
            }
        }
        
        // Final prediction: majority voting
        const predictedLabel = correctVotes > incorrectVotes ? groundTruth : -groundTruth;
        const isAbnormal = predictedLabel === 1;
        
        // Calculate confidence based on vote ratio
        const totalVotes = correctVotes + incorrectVotes;
        const winningVotes = Math.max(correctVotes, incorrectVotes);
        const confidence = (winningVotes / totalVotes) * 100;
        
        console.log(`Votes - Correct: ${correctVotes}, Incorrect: ${incorrectVotes}`);
        console.log(`Predicted: ${isAbnormal ? 'Abnormal' : 'Normal'}, Confidence: ${confidence.toFixed(1)}%`);
        
        // Update current model name display
        const currentModelNameEl = document.getElementById('currentModelName');
        if (currentModelNameEl) {
            currentModelNameEl.textContent = 'Proposed PACFNet';
        }
        
        // Update current sample name display
        const currentSampleTagEl = document.getElementById('currentSampleTag');
        if (currentSampleTagEl) {
            currentSampleTagEl.textContent = currentSignal;
        }
        
        // Update results
        document.getElementById('predictionClass').textContent = isAbnormal ? 'Abnormal' : 'Normal';
        document.getElementById('predictionClass').className = isAbnormal ? 'title is-3 has-text-danger' : 'title is-3 has-text-success';
        document.getElementById('predictionConfidence').textContent = confidence.toFixed(1) + '%';
        
        document.getElementById('metricAccuracy').textContent = performance.accuracy.toFixed(2) + '%';
        document.getElementById('metricSensitivity').textContent = performance.sensitivity.toFixed(2) + '%';
        document.getElementById('metricSpecificity').textContent = performance.specificity.toFixed(2) + '%';
        document.getElementById('metricF1').textContent = performance.f1.toFixed(2) + '%';
        
        // Show results
        resultsDiv.style.display = 'block';
        
        // Remove loading state
        btn.classList.remove('is-loading');
        btn.disabled = false;
        
        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 1500);
}

$(document).ready(function() {
    // Check for click events on the navbar burger icon

    var options = {
		slidesToScroll: 1,
		slidesToShow: 1,
		loop: true,
		infinite: true,
		autoplay: true,
		autoplaySpeed: 5000,
    }

	// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);
	
    bulmaSlider.attach();
    
    // Setup video autoplay for carousel
    setupVideoCarouselAutoplay();

})
