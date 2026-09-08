// ===== CONFIGURATION =====
// Saat deploy ke Vercel, API ada di domain yang sama
// Saat local, ganti ke http://localhost:8000
const API_BASE_URL = "http://localhost:8000";
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
const transcriptionEl = document.getElementById('transcriptionResult');

// --- DOM Elements ---
const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const statusText = document.getElementById('statusText');
const timer = document.getElementById('timer');
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
    syncAccumulatedFromEditor();
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
    syncAccumulatedFromEditor();
    if (!accumulatedText || !accumulatedText.trim()) {
        showToast('Tidak ada teks untuk di-generate', 'error');
        return;
    }

    const categories = getCategories();
    aiLoading.style.display = 'flex';
    narrativeResult.innerHTML = '';
    statusText.textContent = '🤖 AI sedang memproses dengan kategori yang dipilih...';
    document.getElementById('btnGenerate').disabled = true;

    try {
        const provider = document.getElementById('aiProvider').value;
        const res = await fetch(API_URL + '/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: accumulatedText,
                categories: categories,
                provider: provider
            })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
        const data = await res.json();
        const outputFormat = document.getElementById('outputFormat').value;
        if (outputFormat === 'presentation') {
            try {
                let jsonStr = data.result.trim();
                jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
                lastGeneratedJSON = JSON.parse(jsonStr);
                narrativeResult.innerHTML = `<div class="placeholder">✅ Presentasi siap diunduh (${lastGeneratedJSON.slides?.length || 0} slide)</div>
                    <pre style="text-align:left;font-size:0.85em;max-height:300px;overflow:auto;background:#f8f9fa;padding:12px;border-radius:8px">${escapeHtml(JSON.stringify(lastGeneratedJSON, null, 2))}</pre>`;
            } catch (e) {
                lastGeneratedJSON = null;
                narrativeResult.innerHTML = renderFormattedText(data.result);
            }
        } else {
            lastGeneratedJSON = null;
            narrativeResult.innerHTML = renderFormattedText(data.result);
        }
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
        document.getElementById('btnGenerate').disabled = false;
    }
}

function getFinalTranscription() {
    return transcriptionEl.innerText;
}

function updateTranscriptionDisplay() {
    const fullText = accumulatedText + interimText;
    if (fullText) {
        const paragraphs = accumulatedText.split('\n').filter(p => p.trim());
        const interimHtml = interimText ? `<span style="color:#5a6a8a">${escapeHtml(interimText)}</span>` : '';
        transcriptionEl.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') + interimHtml;
    } else {
        transcriptionEl.innerHTML = '<p class="placeholder">Teks transkripsi akan muncul di sini...</p>';
    }
}

function syncAccumulatedFromEditor() {
    const html = transcriptionEl.innerHTML;
    if (html.includes('placeholder')) {
        accumulatedText = "";
    } else {
        accumulatedText = transcriptionEl.innerText;
    }
}

function execCmd(command, value) {
    transcriptionEl.focus();
    if (command === 'formatBlock') {
        document.execCommand('formatBlock', false, '<' + value + '>');
    } else {
        document.execCommand(command, false, value || null);
    }
    syncAccumulatedFromEditor();
}

function copyRichText() {
    const html = transcriptionEl.innerHTML;
    const text = transcriptionEl.innerText;
    const blob = new Blob([html], { type: 'text/html' });
    const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([text], { type: 'text/plain' }) })];
    navigator.clipboard.write(data).then(() => showToast('Teks disalin!', 'success')).catch(() => {
        navigator.clipboard.writeText(text).then(() => showToast('Teks disalin!', 'success'));
    });
}

function pasteText() {
    navigator.clipboard.read().then(items => {
        for (const item of items) {
            for (const type of item.types) {
                if (type === 'text/html') {
                    item.getType(type).then(blob => {
                        blob.text().then(html => {
                            insertHtmlAtCursor(html);
                            syncAccumulatedFromEditor();
                            pendingNarrateText = accumulatedText;
                            document.getElementById('btnGenerate').disabled = false;
                            showToast('Teks berhasil ditempel!', 'success');
                        });
                    });
                    return;
                }
            }
        }
        navigator.clipboard.readText().then(text => {
            if (text && text.trim()) {
                insertHtmlAtCursor('<p>' + escapeHtml(text) + '</p>');
                syncAccumulatedFromEditor();
                pendingNarrateText = accumulatedText;
                document.getElementById('btnGenerate').disabled = false;
                showToast('Teks berhasil ditempel!', 'success');
            } else {
                showToast('Clipboard kosong', 'error');
            }
        }).catch(() => showToast('Clipboard kosong', 'error'));
    }).catch(err => {
        navigator.clipboard.readText().then(text => {
            if (text && text.trim()) {
                insertHtmlAtCursor('<p>' + escapeHtml(text) + '</p>');
                syncAccumulatedFromEditor();
                pendingNarrateText = accumulatedText;
                document.getElementById('btnGenerate').disabled = false;
                showToast('Teks berhasil ditempel!', 'success');
            } else {
                showToast('Clipboard kosong', 'error');
            }
        }).catch(() => showToast('Gagal membaca clipboard', 'error'));
    });
}

function insertHtmlAtCursor(html) {
    transcriptionEl.focus();
    const sel = window.getSelection();
    if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const frag = document.createDocumentFragment();
        let lastNode;
        while (temp.firstChild) {
            lastNode = frag.appendChild(temp.firstChild);
        }
        range.insertNode(frag);
        if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    } else {
        transcriptionEl.innerHTML += html;
    }
}

// Sync editor on input
transcriptionEl.addEventListener('input', () => {
    syncAccumulatedFromEditor();
});

transcriptionEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
        insertHtmlAtCursor(html);
    } else {
        insertHtmlAtCursor('<p>' + escapeHtml(text) + '</p>');
    }
    syncAccumulatedFromEditor();
});

transcriptionEl.addEventListener('focus', () => {
    if (transcriptionEl.querySelector('.placeholder')) {
        transcriptionEl.innerHTML = '';
    }
});

transcriptionEl.addEventListener('blur', () => {
    if (!transcriptionEl.innerText.trim()) {
        transcriptionEl.innerHTML = '<p class="placeholder">Teks transkripsi akan muncul di sini...</p>';
    }
    syncAccumulatedFromEditor();
});
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
        resultDiv.innerHTML = renderFormattedText(data.result);
        resultArea.style.display = 'block';
        handleAssistantOutputFormatChange();
        showToast('Berhasil diproses!', 'success');
    } catch (err) {
        resultDiv.innerHTML = renderFormattedText('Gagal: ' + err.message);
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
                <div class="chat-bubble">${renderFormattedText(data.result)}</div>
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

function renderFormattedText(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Heading: lines that are ALL CAPS or start with capital and are short
    html = html.replace(/^([A-Z][A-Z\s]{2,})$/gm, '<h3>$1</h3>');
    // Bold **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // Underline __text__
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');
    // Numbered list: lines starting with 1. 2. 3. etc
    html = html.replace(/^(\d+\.\s.+)$/gm, '<li class="num-item">$1</li>');
    // Bullet list: lines starting with • - or *
    html = html.replace(/^[•\-\*]\s(.+)$/gm, '<li class="bullet-item">$1</li>');
    // Wrap consecutive <li> in <ol> or <ul>
    html = html.replace(/((?:<li class="num-item">.*<\/li>\n?)+)/g, (match) => {
        return '<ol>' + match.replace(/<li class="num-item">/g, '<li>').replace(/<\/li>/g, '</li>') + '</ol>';
    });
    html = html.replace(/((?:<li class="bullet-item">.*<\/li>\n?)+)/g, (match) => {
        return '<ul>' + match.replace(/<li class="bullet-item">/g, '<li>').replace(/<\/li>/g, '</li>') + '</ul>';
    });
    // Paragraphs: double newline
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newline to <br>
    html = html.replace(/\n/g, '<br>');
    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<h') && !html.startsWith('<ol') && !html.startsWith('<ul') && !html.startsWith('<p>')) {
        html = '<p>' + html + '</p>';
    }
    return html;
}

function copyText(elementId) {
    const el = document.getElementById(elementId);
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Teks disalin!', 'success'));
}

function clearTranscription() {
    accumulatedText = "";
    interimText = "";
    transcriptionEl.innerHTML = '<p class="placeholder">Teks transkripsi akan muncul di sini...</p>';
    showToast('Transkripsi dihapus', 'success');
}

function copyAssistantResult() {
    const el = document.getElementById('assistantResult');
    navigator.clipboard.writeText(el.textContent).then(() => showToast('Teks disalin!', 'success'));
}

// --- Init ---
updateFeatureUI();
console.log('Speech to Narasi v3.1 initialized');

// ===== OUTPUT FORMAT HANDLING =====
let lastGeneratedText = '';
let lastGeneratedCategories = {};
let lastGeneratedJSON = null;

function handleOutputFormatChange() {
    const format = document.getElementById('outputFormat').value;
    const actions = document.getElementById('outputActions');
    const btnPreview = document.getElementById('btnPreviewWeb');
    const btnDownloadWeb = document.getElementById('btnDownloadWeb');
    const btnDownloadWord = document.getElementById('btnDownloadWord');
    const btnPreviewPPTX = document.getElementById('btnPreviewPPTX');
    const btnDownloadPPTX = document.getElementById('btnDownloadPPTX');

    if (format === 'text') {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'block';
        btnPreview.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWeb.style.display = format === 'web' ? 'flex' : 'none';
        btnDownloadWord.style.display = (format === 'word' || format === 'news' || format === 'executive') ? 'flex' : 'none';
        btnPreviewPPTX.style.display = format === 'presentation' ? 'flex' : 'none';
        btnDownloadPPTX.style.display = format === 'presentation' ? 'flex' : 'none';
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
        btnDownloadWord.style.display = (format === 'word' || format === 'news' || format === 'executive' || format === 'presentation') ? 'flex' : 'none';
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

// --- Download PPTX ---
function tryParsePresentationJSON(text) {
    if (!text) { console.log('PPTX: no text'); return null; }
    let s = text.trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) {
        s = s.substring(start, end + 1);
    }
    console.log('PPTX parse attempt:', s.substring(0, 100));
    try { const r = JSON.parse(s); console.log('PPTX parse OK:', r.slides?.length, 'slides'); return r; } catch(e) { console.log('PPTX parse FAILED:', e.message); return null; }
}

function previewPPTX() {
    console.log('PPTX preview clicked. lastGeneratedJSON:', lastGeneratedJSON ? 'exists' : 'null', 'lastGeneratedText:', lastGeneratedText ? lastGeneratedText.substring(0, 100) : 'null');
    if (!lastGeneratedJSON) {
        lastGeneratedJSON = tryParsePresentationJSON(lastGeneratedText);
    }
    if (!lastGeneratedJSON) return showToast('Hasil generate bukan JSON Presentasi. Generate ulang dengan format 📽️ Presentasi.', 'error');
    const container = document.getElementById('pptxPreviewContainer');
    const slides = lastGeneratedJSON.slides || [];
    let html = `<div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:#1a1a1a;margin-bottom:5px;">${escapeHtml(lastGeneratedJSON.title || 'Presentasi')}</h2>
        ${lastGeneratedJSON.subtitle ? `<p style="color:#666;font-size:0.9em;">${escapeHtml(lastGeneratedJSON.subtitle)}</p>` : ''}
        <p style="color:#999;font-size:0.8em;margin-top:10px;">${slides.length} slide</p>
    </div>`;
    slides.forEach((slide, i) => {
        html += `<div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <span style="background:#3a7bd5;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:0.8em;font-weight:bold;">${i + 1}</span>
                <h3 style="color:#1a1a1a;margin:0;">${escapeHtml(slide.title || '')}</h3>
            </div>
            <ul style="margin:0;padding-left:20px;">
                ${(slide.bullets || []).map(b => `<li style="color:#444;margin:6px 0;line-height:1.5;">${escapeHtml(b.replace(/^\u2022\s*/, '').replace(/^\*\*?/, '').replace(/\*\*?$/, ''))}</li>`).join('')}
            </ul>
        </div>`;
    });
    container.innerHTML = html;
    document.getElementById('pptxPreviewModal').style.display = 'flex';
}

function closePPTXPreview() {
    document.getElementById('pptxPreviewModal').style.display = 'none';
}

function downloadPPTX() {
    if (!lastGeneratedJSON) {
        lastGeneratedJSON = tryParsePresentationJSON(lastGeneratedText);
    }
    if (!lastGeneratedJSON) return showToast('Hasil generate bukan JSON Presentasi. Generate ulang dengan format 📽️ Presentasi.', 'error');
    try {
        showToast('Membuat file PPTX...', 'success');
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = 'Speech to Narasi';
        pptx.title = lastGeneratedJSON.title || 'Presentasi';

        const slides = lastGeneratedJSON.slides || [];
        slides.forEach((slide, i) => {
            const s = pptx.addSlide();
            if (i === 0) {
                s.addText(slide.title || '', { x: 0.5, y: 1.5, w: '90%', fontSize: 32, bold: true, color: '1a1a1a', align: 'center' });
                if (lastGeneratedJSON.subtitle) {
                    s.addText(lastGeneratedJSON.subtitle, { x: 0.5, y: 2.5, w: '90%', fontSize: 18, color: '555555', align: 'center' });
                }
            } else {
                s.addText(slide.title || '', { x: 0.5, y: 0.3, w: '90%', fontSize: 24, bold: true, color: '1a1a1a' });
                const bullets = (slide.bullets || []).map(b => ({ text: b, options: { bullet: true, fontSize: 16, color: '333333', breakLine: true } }));
                if (bullets.length) {
                    s.addText(bullets, { x: 0.8, y: 1.0, w: '85%', valign: 'top', lineSpacingMultiple: 1.5 });
                }
            }
        });

        pptx.writeFile({ fileName: (lastGeneratedJSON.title || 'presentasi') + '.pptx' });
        showToast('File PPTX berhasil didownload!', 'success');
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

// --- Server Status & Restart ---
async function checkLocalServer() {
    try {
        const res = await fetch('http://localhost:8000/api/health', { method: 'GET' });
        if (res.ok) {
            document.getElementById('btnRestart').style.display = 'inline-block';
            return true;
        }
    } catch (e) {}
    document.getElementById('btnRestart').style.display = 'none';
    return false;
}

async function restartServer() {
    if (!confirm('Restart uvicorn server?')) return;
    try {
        await fetch(API_URL + '/api/restart', { method: 'POST' });
        showToast('Server sedang restart... tunggu 3 detik', 'success');
        setTimeout(() => {
            checkLocalServer();
            showToast('Server sudah aktif!', 'success');
        }, 3000);
    } catch (e) {
        showToast('Gagal restart: ' + e.message, 'error');
    }
}

// Cek server lokal saat load
checkLocalServer();
