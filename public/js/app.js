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
let pendingNarrateText = ""; // Teks yang menunggu kategori dipilih

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

// --- Input Tab Switching ---
document.querySelectorAll('.input-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.input-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('input-' + tab.dataset.input).classList.add('active');
    });
});

// --- File Upload ---
const fileDropZone = document.getElementById('fileDropZone');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileContent = document.getElementById('fileContent');
let uploadedFile = null;

fileDropZone.addEventListener('click', () => fileInput.click());
fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.classList.add('dragover'); });
fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('dragover'));
fileDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

async function handleFile(file) {
    const allowedExts = ['.docx', '.xlsx', '.pdf', '.pptx', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowedExts.includes(ext)) {
        showToast('Format file tidak didukung!', 'error');
        return;
    }

    // Batasi ukuran file (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Ukuran file terlalu besar (maks 10MB)!', 'error');
        return;
    }

    uploadedFile = file;
    fileName.textContent = file.name;
    filePreview.style.display = 'block';
    fileDropZone.style.display = 'none';
    fileContent.textContent = 'Membaca file...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(API_URL + '/api/ai/parse-file', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        
        fileContent.textContent = data.text;
        
        const charCount = data.text.length;
        if (charCount > 10000) {
            showToast(`File berhasil dibaca! (${charCount.toLocaleString()} karakter)`, 'success');
        } else {
            showToast('File berhasil dibaca!', 'success');
        }
    } catch (err) {
        fileContent.textContent = 'Gagal membaca file: ' + err.message;
        showToast('Gagal membaca file: ' + err.message, 'error');
    }
}

function clearFile() {
    uploadedFile = null;
    fileInput.value = '';
    filePreview.style.display = 'none';
    fileDropZone.style.display = 'block';
}

// --- Image OCR ---
const imageDropZone = document.getElementById('imageDropZone');
const imageInput = document.getElementById('imageInput');
const imagePreviewEl = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const ocrLoading = document.getElementById('ocrLoading');
let uploadedImage = null;

imageDropZone.addEventListener('click', () => imageInput.click());
imageDropZone.addEventListener('dragover', (e) => { e.preventDefault(); imageDropZone.classList.add('dragover'); });
imageDropZone.addEventListener('dragleave', () => imageDropZone.classList.remove('dragover'));
imageDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleImage(e.dataTransfer.files[0]);
});
imageInput.addEventListener('change', (e) => { if (e.target.files.length) handleImage(e.target.files[0]); });

function handleImage(file) {
    if (!file.type.startsWith('image/')) {
        showToast('File bukan gambar!', 'error');
        return;
    }
    uploadedImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        imagePreviewEl.style.display = 'block';
        imageDropZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function extractTextFromImage() {
    if (!uploadedImage) return;

    ocrLoading.style.display = 'flex';
    const formData = new FormData();
    formData.append('file', uploadedImage);

    try {
        const res = await fetch(API_URL + '/api/ai/ocr', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        document.getElementById('assistantInput').value = data.text;
        // Switch to text tab
        document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.input-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.input-tab[data-input="text"]').classList.add('active');
        document.getElementById('input-text').classList.add('active');
        showToast('Teks berhasil diekstrak dari gambar!', 'success');
    } catch (err) {
        showToast('Gagal ekstrak teks: ' + err.message, 'error');
    } finally {
        ocrLoading.style.display = 'none';
    }
}

function clearImage() {
    uploadedImage = null;
    imageInput.value = '';
    imagePreviewEl.style.display = 'none';
    imageDropZone.style.display = 'block';
}

function updateFeatureUI() {
    const label = document.getElementById('featureLabel');
    const textarea = document.getElementById('assistantInput');
    const chatArea = document.getElementById('chatArea');
    const inputTabs = document.querySelector('.input-tabs');
    const inputContents = document.querySelectorAll('.input-content');
    const processBtn = document.getElementById('btnProcess');
    const resultArea = document.getElementById('assistantResultArea');
    const categorySection = document.querySelector('.category-section');

    const features = {
        fix: { label: "Masukkan teks yang ingin diperbaiki:", placeholder: "Ketik atau tempel teks yang ingin diperbaiki ejaan dan tata bahasanya..." },
        narrate: { label: "Masukkan teks mentah untuk dibuat narasi:", placeholder: "Masukkan teks mentah/hasil transkripsi yang ingin dibuatkan narasi..." },
        summarize: { label: "Masukkan teks yang ingin diringkas:", placeholder: "Masukkan teks panjang yang ingin diringkas..." },
        rewrite: { label: "Masukkan teks yang ingin ditulis ulang:", placeholder: "Masukkan teks yang ingin ditulis ulang dengan gaya berbeda..." },
        chat: { label: "", placeholder: "" }
    };

    const f = features[currentFeature];

    if (currentFeature === 'chat') {
        inputTabs.style.display = 'none';
        inputContents.forEach(c => c.classList.remove('active'));
        processBtn.style.display = 'none';
        resultArea.style.display = 'none';
        categorySection.style.display = 'none';
        chatArea.style.display = 'block';
    } else {
        inputTabs.style.display = 'flex';
        // Show the active input tab content
        const activeTab = document.querySelector('.input-tab.active');
        if (activeTab) {
            document.getElementById('input-' + activeTab.dataset.input).classList.add('active');
        }
        processBtn.style.display = 'flex';
        chatArea.style.display = 'none';
        resultArea.style.display = 'none';
        categorySection.style.display = 'block';
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
    statusText.textContent = '✅ Rekaman selesai - Pilih kategori lalu Generate';
    statusText.classList.remove('recording');
    interimText = "";
    updateTranscriptionDisplay();

    // Simpan teks untuk menunggu pemilihan kategori
    if (accumulatedText && accumulatedText.trim()) {
        pendingNarrateText = accumulatedText;
        document.getElementById('btnGenerate').disabled = false;
    }
});

// --- Get Categories from Dropdowns ---
function getCategories() {
    return {
        writing_style: document.getElementById('writingStyle').value,
        text_format: document.getElementById('textFormat').value,
        tone: document.getElementById('tone').value,
        audience: document.getElementById('audience').value,
        language_level: document.getElementById('languageLevel').value
    };
}

function getAssistantCategories() {
    return {
        writing_style: document.getElementById('assistantWritingStyle').value,
        text_format: document.getElementById('assistantTextFormat').value,
        tone: document.getElementById('assistantTone').value,
        audience: document.getElementById('assistantAudience').value,
        language_level: document.getElementById('assistantLanguageLevel').value
    };
}

// --- Generate Narasi dengan Kategori ---
async function generateWithCategory() {
    if (!pendingNarrateText) {
        showToast('Tidak ada teks untuk di-generate', 'error');
        return;
    }

    const categories = getCategories();
    aiLoading.style.display = 'flex';
    narrativeResult.innerHTML = '';
    statusText.textContent = '🤖 AI sedang memproses dengan kategori yang dipilih...';
    document.getElementById('btnGenerate').disabled = true;

    try {
        const res = await fetch(API_URL + '/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: pendingNarrateText,
                categories: categories
            })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        narrativeResult.innerHTML = `<p>${data.result}</p>`;
        lastGeneratedText = data.result;
        lastGeneratedCategories = categories;
        handleOutputFormatChange();
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

// --- AI Assistant Processing ---
async function processAssistant() {
    // Get text from active input method
    let input = '';
    const activeInput = document.querySelector('.input-tab.active').dataset.input;
    
    if (activeInput === 'text') {
        input = document.getElementById('assistantInput').value.trim();
    } else if (activeInput === 'file') {
        input = document.getElementById('fileContent').textContent.trim();
    } else if (activeInput === 'image') {
        input = document.getElementById('assistantInput').value.trim();
    }
    
    if (!input) { showToast('Masukkan teks terlebih dahulu', 'error'); return; }

    const categories = getAssistantCategories();
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
            body: JSON.stringify({ 
                text: input,
                categories: categories
            })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        resultDiv.innerHTML = `<p>${data.result}</p>`;
        resultArea.style.display = 'block';
        handleAssistantOutputFormatChange();
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

// ===== OUTPUT FORMAT HANDLING =====
let lastGeneratedText = '';
let lastGeneratedCategories = {};

function handleOutputFormatChange() {
    const format = document.getElementById('outputFormat').value;
    const actions = document.getElementById('outputActions');
    const btnPreview = document.getElementById('btnPreviewWeb');
    const btnDownloadWeb = document.getElementById('btnDownloadWeb');
    const btnDownloadWord = document.getElementById('btnDownloadWord');

    if (format === 'text') {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'block';
        btnPreview.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWeb.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWord.style.display = format === 'word' ? 'flex' : 'none';
    }
}

function handleAssistantOutputFormatChange() {
    const format = document.getElementById('assistantOutputFormat').value;
    const actions = document.getElementById('assistantOutputActions');
    const btnPreview = document.getElementById('assistantBtnPreviewWeb');
    const btnDownloadWeb = document.getElementById('assistantBtnDownloadWeb');
    const btnDownloadWord = document.getElementById('assistantBtnDownloadWord');

    if (format === 'text') {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'block';
        btnPreview.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWeb.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWord.style.display = format === 'word' ? 'flex' : 'none';
    }
}

// --- Generate Web HTML ---
async function generateWebHTML(text, categories) {
    const res = await fetch(API_URL + '/api/ai/generate-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, categories })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    return await res.json();
}

// --- Generate Word DOCX ---
async function generateWordDOCX(text, categories) {
    const res = await fetch(API_URL + '/api/ai/generate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, categories })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    return res;
}

// --- Preview Web (Record tab) ---
async function previewWeb() {
    if (!lastGeneratedText) return showToast('Belum ada hasil generate', 'error');
    try {
        showToast('Membuat preview web...', 'success');
        const data = await generateWebHTML(lastGeneratedText, lastGeneratedCategories);
        const modal = document.getElementById('webPreviewModal');
        const frame = document.getElementById('webPreviewFrame');
        frame.srcdoc = data.html;
        modal.style.display = 'flex';
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

function closeWebPreview() {
    document.getElementById('webPreviewModal').style.display = 'none';
}

// --- Download Web (Record tab) ---
async function downloadWeb() {
    if (!lastGeneratedText) return showToast('Belum ada hasil generate', 'error');
    try {
        showToast('Membuat file HTML...', 'success');
        const data = await generateWebHTML(lastGeneratedText, lastGeneratedCategories);
        const blob = new Blob([data.html], { type: 'text/html' });
        downloadBlob(blob, 'narasi-web.html');
        showToast('File HTML berhasil didownload!', 'success');
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

// --- Download Word (Record tab) ---
async function downloadWord() {
    if (!lastGeneratedText) return showToast('Belum ada hasil generate', 'error');
    try {
        showToast('Membuat file Word...', 'success');
        const res = await generateWordDOCX(lastGeneratedText, lastGeneratedCategories);
        const blob = await res.blob();
        downloadBlob(blob, 'narasi-laporan.docx');
        showToast('File Word berhasil didownload!', 'success');
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

// --- Preview Web (Assistant tab) ---
async function previewWebAssistant() {
    const text = document.getElementById('assistantResult').textContent;
    if (!text) return showToast('Belum ada hasil', 'error');
    try {
        showToast('Membuat preview web...', 'success');
        const categories = getAssistantCategories();
        const data = await generateWebHTML(text, categories);
        const modal = document.getElementById('webPreviewModalAssistant');
        const frame = document.getElementById('webPreviewFrameAssistant');
        frame.srcdoc = data.html;
        modal.style.display = 'flex';
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

function closeWebPreviewAssistant() {
    document.getElementById('webPreviewModalAssistant').style.display = 'none';
}

// --- Download Web (Assistant tab) ---
async function downloadWebAssistant() {
    const text = document.getElementById('assistantResult').textContent;
    if (!text) return showToast('Belum ada hasil', 'error');
    try {
        showToast('Membuat file HTML...', 'success');
        const categories = getAssistantCategories();
        const data = await generateWebHTML(text, categories);
        const blob = new Blob([data.html], { type: 'text/html' });
        downloadBlob(blob, 'narasi-web.html');
        showToast('File HTML berhasil didownload!', 'success');
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

// --- Download Word (Assistant tab) ---
async function downloadWordAssistant() {
    const text = document.getElementById('assistantResult').textContent;
    if (!text) return showToast('Belum ada hasil', 'error');
    try {
        showToast('Membuat file Word...', 'success');
        const categories = getAssistantCategories();
        const res = await generateWordDOCX(text, categories);
        const blob = await res.blob();
        downloadBlob(blob, 'narasi-laporan.docx');
        showToast('File Word berhasil didownload!', 'success');
    } catch (err) {
        showToast('Gagal: ' + err.message, 'error');
    }
}

// --- Helper: Download Blob ---
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
