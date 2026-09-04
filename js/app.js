// ===== CONFIGURATION =====
// Saat deploy ke Vercel, API ada di domain yang sama
// Saat local, ganti ke http://localhost:8000
const API_BASE_URL = ""; // Kosongkan untuk Vercel (satu domain)
const API_URL = API_BASE_URL || window.location.origin;
// =========================

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordInterval = null;
let seconds = 0;
let recognition = null;
let currentFeature = "fix";
let chatHistory = [];
let accumulatedText = "";
let interimText = "";

// --- DOM Elements ---
const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const statusText = document.getElementById('statusText');
const timer = document.getElementById('timer');
const transcriptionResult = document.getElementById('transcriptionResult');
const narrativeResult = document.getElementById('narrativeResult');
const aiLoading = document.getElementById('aiLoading');
const errorToast = document.getElementById('errorToast');
const waveCanvas = document.getElementById('waveCanvas');

// --- Tab Switching ---
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

// --- Feature Switching ---
document.querySelectorAll('.feature-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.feature-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFeature = btn.dataset.feature;
        updateFeatureUI();
    });
});

function updateFeatureUI() {
    const label = document.getElementById('featureLabel');
    const textarea = document.getElementById('assistantInput');
    const chatArea = document.getElementById('chatArea');
    const inputArea = document.querySelector('.assistant-input');
    const processBtn = document.getElementById('btnProcess');
    const resultArea = document.getElementById('assistantResultArea');

    const features = {
        fix: { label: "Masukkan teks yang ingin diperbaiki:", placeholder: "Ketik atau tempel teks yang ingin diperbaiki ejaan dan tata bahasanya..." },
        narrate: { label: "Masukkan teks mentah untuk dibuat narasi:", placeholder: "Masukkan teks mentah/hasil transkripsi yang ingin dibuatkan narasi..." },
        summarize: { label: "Masukkan teks yang ingin diringkas:", placeholder: "Masukkan teks panjang yang ingin diringkas..." },
        rewrite: { label: "Masukkan teks yang ingin ditulis ulang:", placeholder: "Masukkan teks yang ingin ditulis ulang dengan gaya berbeda..." },
        chat: { label: "", placeholder: "" }
    };

    const f = features[currentFeature];

    if (currentFeature === 'chat') {
        inputArea.style.display = 'none';
        processBtn.style.display = 'none';
        resultArea.style.display = 'none';
        chatArea.style.display = 'block';
    } else {
        inputArea.style.display = 'block';
        processBtn.style.display = 'flex';
        chatArea.style.display = 'none';
        resultArea.style.display = 'none';
        label.textContent = f.label;
        textarea.placeholder = f.placeholder;
    }
}

// --- Toast ---
function showToast(message, type = 'error') {
    errorToast.textContent = message;
    errorToast.className = 'toast ' + type;
    errorToast.style.display = 'block';
    setTimeout(() => { errorToast.style.display = 'none'; }, 4000);
}

// --- Timer ---
function startTimer() {
    seconds = 0;
    recordInterval = setInterval(() => {
        seconds++;
        const min = String(Math.floor(seconds / 60)).padStart(2, '0');
        const sec = String(seconds % 60).padStart(2, '0');
        timer.textContent = `${min}:${sec}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(recordInterval);
    timer.textContent = '00:00';
}

// --- Waveform Visualizer ---
let audioContext = null;
let analyser = null;
let animationId = null;

function initAudioVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    drawWaveform();
}

function drawWaveform() {
    const canvasCtx = waveCanvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);
        waveCanvas.width = waveCanvas.offsetWidth;
        waveCanvas.height = waveCanvas.offsetHeight;
        canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        canvasCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#00d2ff';
        canvasCtx.beginPath();
        const sliceWidth = waveCanvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * waveCanvas.height) / 2;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }
        canvasCtx.lineTo(waveCanvas.width, waveCanvas.height / 2);
        canvasCtx.stroke();
    }
    draw();
}

function stopVisualizer() {
    if (animationId) cancelAnimationFrame(animationId);
    if (audioContext) audioContext.close();
}

// --- Speech Recognition ---
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        statusText.textContent = '🔴 Sedang merekam...';
        statusText.classList.add('recording');
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let newInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalTranscript += transcript;
            else newInterim += transcript;
        }
        if (finalTranscript) {
            accumulatedText += finalTranscript;
        }
        interimText = newInterim;
        updateTranscriptionDisplay();
    };

    recognition.onerror = (event) => {
        if (event.error === 'not-allowed') showToast('Izin mikrofon ditolak.', 'error');
        else if (event.error === 'network') showToast('Kesalahan jaringan.', 'error');
    };

    recognition.onend = () => {
        if (isRecording) {
            try { recognition.start(); } catch (e) {}
        }
    };
}

// --- Recording Controls ---
btnRecord.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => { console.log('Recording stopped'); };
        mediaRecorder.start();
        isRecording = true;
        initAudioVisualizer(stream);
        startTimer();
        initSpeechRecognition();
        if (recognition) recognition.start();
        btnRecord.disabled = true;
        btnStop.disabled = false;
        statusText.textContent = '🔴 Merekam...';
        statusText.classList.add('recording');
    } catch (err) {
        if (err.name === 'NotAllowedError') showToast('Izin mikrofon ditolak.', 'error');
        else showToast('Gagal akses mikrofon: ' + err.message, 'error');
    }
});

btnStop.addEventListener('click', () => {
    isRecording = false;
    seconds = 0;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mediaRecorder && mediaRecorder.stream) mediaRecorder.stream.getTracks().forEach(t => t.stop());
    if (recognition) recognition.stop();
    stopVisualizer();
    stopTimer();
    btnRecord.disabled = false;
    btnStop.disabled = true;
    statusText.textContent = '✅ Rekaman selesai';
    statusText.classList.remove('recording');
    interimText = "";
    updateTranscriptionDisplay();

    if (accumulatedText && accumulatedText.trim()) {
        autoNarrate(accumulatedText);
    }
});

function getFinalTranscription() {
    return accumulatedText;
}

function updateTranscriptionDisplay() {
    const fullText = accumulatedText + interimText;
    if (fullText) {
        transcriptionResult.innerHTML = `<p>${fullText}</p>`;
    } else {
        transcriptionResult.innerHTML = `<p class="placeholder">Teks transkripsi akan muncul di sini...</p>`;
    }
}

// --- Auto Narrate after recording ---
async function autoNarrate(text) {
    aiLoading.style.display = 'flex';
    narrativeResult.innerHTML = '';
    statusText.textContent = '🤖 AI sedang memproses narasi...';
    try {
        const res = await fetch(API_URL + '/api/ai/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        narrativeResult.innerHTML = `<p>${data.result}</p>`;
        statusText.textContent = '✅ Narasi selesai!';
        showToast('Narasi berhasil dihasilkan!', 'success');
    } catch (err) {
        narrativeResult.innerHTML = `<p class="placeholder">Gagal: ${err.message}</p>`;
        statusText.textContent = '❌ Gagal';
        showToast('Gagal: ' + err.message, 'error');
    } finally {
        aiLoading.style.display = 'none';
    }
}

// --- AI Assistant Processing ---
async function processAssistant() {
    const input = document.getElementById('assistantInput').value.trim();
    if (!input) { showToast('Masukkan teks terlebih dahulu', 'error'); return; }

    const loading = document.getElementById('assistantLoading');
    const resultArea = document.getElementById('assistantResultArea');
    const resultDiv = document.getElementById('assistantResult');
    const processBtn = document.getElementById('btnProcess');

    loading.style.display = 'flex';
    resultArea.style.display = 'none';
    processBtn.disabled = true;

    try {
        const endpoint = '/api/ai/' + currentFeature;
        const res = await fetch(API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: input })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        resultDiv.innerHTML = `<p>${data.result}</p>`;
        resultArea.style.display = 'block';
        showToast('Berhasil diproses!', 'success');
    } catch (err) {
        resultDiv.innerHTML = `<p class="placeholder">Gagal: ${err.message}</p>`;
        resultArea.style.display = 'block';
        showToast('Gagal: ' + err.message, 'error');
    } finally {
        loading.style.display = 'none';
        processBtn.disabled = false;
    }
}

// --- Chat AI ---
async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    const messagesDiv = document.getElementById('chatMessages');

    // Add user message
    messagesDiv.innerHTML += `
        <div class="chat-message user">
            <div class="chat-bubble">${escapeHtml(msg)}</div>
        </div>`;
    input.value = '';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Add loading
    const loadingId = 'loading-' + Date.now();
    messagesDiv.innerHTML += `
        <div class="chat-message ai" id="${loadingId}">
            <div class="chat-bubble"><span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Mengetik...</div>
        </div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const context = chatHistory.slice(-4).join('\n');
        const res = await fetch(API_URL + '/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, context })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();

        document.getElementById(loadingId).remove();
        messagesDiv.innerHTML += `
            <div class="chat-message ai">
                <div class="chat-bubble">${escapeHtml(data.result)}</div>
            </div>`;

        chatHistory.push('User: ' + msg);
        chatHistory.push('AI: ' + data.result);
    } catch (err) {
        document.getElementById(loadingId).remove();
        messagesDiv.innerHTML += `
            <div class="chat-message ai">
                <div class="chat-bubble" style="color:#ff6b6b;">Maaf, terjadi kesalahan: ${escapeHtml(err.message)}</div>
            </div>`;
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Helpers ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyText(elementId) {
    const el = document.getElementById(elementId);
    const text = el.textContent || el.innerText;
    navigator.clipboard.writeText(text).then(() => showToast('Teks disalin!', 'success'));
}

function clearTranscription() {
    accumulatedText = "";
    interimText = "";
    updateTranscriptionDisplay();
    showToast('Transkripsi dihapus', 'success');
}

function copyAssistantResult() {
    const el = document.getElementById('assistantResult');
    navigator.clipboard.writeText(el.textContent).then(() => showToast('Teks disalin!', 'success'));
}

// --- Init ---
updateFeatureUI();
console.log('Speech to Narasi v2.0 initialized');
