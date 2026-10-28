// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini
// Simulação: Laboratório de Áudio e Análise Espectral
// Descrição: Captura de microfone com processamento Web Audio API, osciloscópio
//            com trigger de zero-crossing, FFT e congelamento didático (Freeze Frame).
//            Layout com Canvas Principal em destaque e Miniatura PIP alternável.
// =============================================================================

import {
    initSidebarCollapse,
    initBottomSheet,
    initKaTeXAutoRender,
    inlineSVGImages,
    initTabs,
    initFocusMirrorToolbar
} from './sim-ui.js';

// =============================================================================
// 1. ELEMENTOS DOM
// =============================================================================

// Navegação por Abas
const tabButtons         = document.querySelectorAll('.tab-btn, .tab-nav-btn');
const tabContents        = document.querySelectorAll('.tab-content');

// Controles da Aba 1 (Microfone)
const btnMicStart        = document.getElementById('btnMicStart');
const btnMicStartIcon    = document.getElementById('btnMicStartIcon');
const btnMicStartText    = document.getElementById('btnMicStartText');
const scaleBtns          = document.querySelectorAll('#scaleControl .segment-btn');

// Containers de Canvas e Visualização
const timeCanvasContainer = document.getElementById('timeCanvasContainer');
const freqCanvasContainer = document.getElementById('freqCanvasContainer');
const timeCanvas         = document.getElementById('timeCanvas');
const freqCanvas         = document.getElementById('freqCanvas');
const btnToggleTrigger   = document.getElementById('btnToggleTrigger');
const swapFocusBtns      = document.querySelectorAll('.btn-swap-focus');

// HUD de Métricas e Status
const hudPeakFreq        = document.getElementById('hudPeakFreq');
const hudMusicalNote     = document.getElementById('hudMusicalNote');
const hudRmsLevel        = document.getElementById('hudRmsLevel');
const hudInspectorValue  = document.getElementById('hudInspectorValue');
const hudStatusBadge     = document.getElementById('hudStatusBadge');

// =============================================================================
// 2. ESTADO GLOBAL DO SISTEMA DE ÁUDIO E ANÁLISE
// =============================================================================

let activeTabId        = 'tab-mic'; // 'tab-mic' | 'tab-waves' | 'tab-beats'
let audioCtx           = null;
let analyserNode       = null;
let micStream          = null;
let micSourceNode      = null;
let animationId        = null;

// Buffers de Áudio Float32 (Alta Precisão)
let timeFloatData      = null;
let freqFloatData      = null;
let bufferLength       = 1024;

// Estados de Operação e Layout
let isCapturing        = false;
let isFrozen           = false;
let isLogScale         = true;
let isTriggerActive    = true;
let isTimeMain         = false; // false = FFT é o principal, true = Osciloscópio é o principal
const visualGain       = 1.0;

// Constantes Físicas e Musicais
const MIN_FREQ   = 20;    // Hz
const MAX_FREQ   = 20000; // Hz
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// =============================================================================
// 3. FUNÇÕES UTILITÁRIAS DE CONVERSÃO E ESCALA
// =============================================================================

/** Converte frequência em Hz para nome da Nota Musical e desvio em cents */
function freqToMusicalNote(freq) {
    if (!freq || freq < 16 || freq > 20000) return '---';
    const midi = 12 * Math.log2(freq / 440) + 69;
    const roundedMidi = Math.round(midi);
    const noteIndex = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;
    const cents = Math.round((midi - roundedMidi) * 100);
    const centsSign = cents >= 0 ? `+${cents}` : `${cents}`;
    return `${NOTE_NAMES[noteIndex]}${octave} (${centsSign}¢)`;
}

/** Mapeamento de posição x normalizada [0, 1] para frequência em Hz */
function xNormToFreq(xNorm, maxFreq) {
    if (isLogScale) {
        const logMin = Math.log10(MIN_FREQ);
        const logMax = Math.log10(maxFreq);
        return Math.pow(10, logMin + xNorm * (logMax - logMin));
    }
    return xNorm * maxFreq;
}

/** Mapeamento de frequência em Hz para posição x normalizada [0, 1] */
function freqToXNorm(freq, maxFreq) {
    if (isLogScale) {
        const logMin = Math.log10(MIN_FREQ);
        const logMax = Math.log10(maxFreq);
        return (Math.log10(Math.max(freq, MIN_FREQ)) - logMin) / (logMax - logMin);
    }
    return Math.max(0, Math.min(1, freq / maxFreq));
}

// =============================================================================
// 4. INICIALIZAÇÃO DO MICROFONE E WEB AUDIO API
// =============================================================================

async function initMicrophone() {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        if (!analyserNode) {
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 2048;
            analyserNode.smoothingTimeConstant = 0.75;
            analyserNode.minDecibels = -100;
            analyserNode.maxDecibels = 0;

            bufferLength = analyserNode.frequencyBinCount;
            timeFloatData = new Float32Array(analyserNode.fftSize);
            freqFloatData = new Float32Array(bufferLength);
        }

        if (!micStream) {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            micSourceNode = audioCtx.createMediaStreamSource(micStream);
            // Conecta exclusivamente ao analisador (não envia aos alto-falantes para evitar microfonia)
            micSourceNode.connect(analyserNode);
        }

        isCapturing = true;
        isFrozen = false;
        updateControlsState();
        startAnimationLoop();
    } catch (err) {
        alert('Erro ao acessar o microfone: ' + err.message);
        stopMicrophone(true);
    }
}

function stopMicrophone(cleanBuffers = false) {
    isCapturing = false;
    isFrozen = false;

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (micSourceNode) {
        try { micSourceNode.disconnect(); } catch (_) {}
        micSourceNode = null;
    }

    if (cleanBuffers && timeFloatData && freqFloatData) {
        timeFloatData.fill(0);
        freqFloatData.fill(-100);
    }

    updateControlsState();
    renderFrame();
}

function toggleFreeze() {
    if (!isCapturing && !isFrozen) return;

    isFrozen = !isFrozen;
    updateControlsState();
}

function updateControlsState() {
    const iconImg = btnMicStart?.querySelector('.icon-svg');
    if (isCapturing && !isFrozen) {
        btnMicStart?.classList.add('active');
        btnMicStart?.setAttribute('data-state', '1');
        if (iconImg) iconImg.src = '../assets/icons/pause.svg';
        if (btnMicStartText) btnMicStartText.textContent = 'Congelar Tela';

        if (hudStatusBadge) {
            hudStatusBadge.className = 'hud-badge status-live';
            hudStatusBadge.textContent = 'Ao Vivo';
        }
    } else if (isCapturing && isFrozen) {
        btnMicStart?.classList.remove('active');
        btnMicStart?.setAttribute('data-state', '0');
        if (iconImg) iconImg.src = '../assets/icons/play.svg';
        if (btnMicStartText) btnMicStartText.textContent = 'Retomar Captura';

        if (hudStatusBadge) {
            hudStatusBadge.className = 'hud-badge status-frozen';
            hudStatusBadge.textContent = 'Congelado';
        }
    } else {
        btnMicStart?.classList.remove('active');
        btnMicStart?.setAttribute('data-state', '0');
        if (iconImg) iconImg.src = '../assets/icons/play.svg';
        if (btnMicStartText) btnMicStartText.textContent = 'Iniciar Captura';

        if (hudStatusBadge) {
            hudStatusBadge.className = 'hud-badge status-idle';
            hudStatusBadge.textContent = 'Pronto';
        }
    }
}

// =============================================================================
// 5. GESTÃO DO LAYOUT PIP E ALTERNÂNCIA DE FOCO
// =============================================================================

let isPipMinimized = false;

function applyPipState() {
    const mainEl = isTimeMain ? timeCanvasContainer : freqCanvasContainer;
    const pipEl = isTimeMain ? freqCanvasContainer : timeCanvasContainer;

    mainEl.className = 'audio-canvas-container canvas-main';
    mainEl.classList.remove('pip-minimized');

    pipEl.className = 'audio-canvas-container canvas-pip' + (isPipMinimized ? ' pip-minimized' : '');

    document.querySelectorAll('.btn-toggle-pip').forEach(b => {
        b.textContent = isPipMinimized ? '▢ Exp' : '_ Min';
        b.title = isPipMinimized ? 'Expandir Miniatura' : 'Recolher Miniatura';
    });
}

function togglePipMinimized() {
    isPipMinimized = !isPipMinimized;
    applyPipState();
    renderFrame();
}

function swapFocus() {
    isTimeMain = !isTimeMain;
    applyPipState();
    renderFrame();
}

// =============================================================================
// 6. RENDERIZAÇÃO DO OSCILOSCÓPIO (DOMÍNIO DO TEMPO COM ZERO-CROSSING)
// =============================================================================

function drawTimeDomain() {
    const ctx = timeCanvas.getContext('2d');
    const width = timeCanvas.width;
    const height = timeCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const isPip = !isTimeMain;
    const dpr = window.devicePixelRatio || 1;
    const ML = isPip ? 8 * dpr : 50 * dpr;
    const MR = isPip ? 8 * dpr : 20 * dpr;
    const MT = isPip ? 14 * dpr : 15 * dpr;
    const MB = isPip ? 14 * dpr : 30 * dpr;
    const DW = width - ML - MR;
    const DH = height - MT - MB;

    // Grade de fundo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (!isPip) {
        // Linhas de amplitude [-1.0 a +1.0]
        ctx.fillStyle = '#64748b';
        ctx.font = `${11 * dpr}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const ampLevels = [1.0, 0.5, 0, -0.5, -1.0];
        ampLevels.forEach(amp => {
            const y = MT + (1 - (amp + 1) / 2) * DH;
            ctx.moveTo(ML, y);
            ctx.lineTo(ML + DW, y);
            ctx.fillText(amp.toFixed(1), ML - (4 * dpr), y);
        });

        // Escala de tempo (ms)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
        const totalTimeMs = (DW / sampleRate) * 1000 * 2;

        for (let s = 0; s <= 5; s++) {
            const x = ML + (s / 5) * DW;
            ctx.moveTo(x, MT);
            ctx.lineTo(x, MT + DH);
            const tVal = ((s / 5) * totalTimeMs).toFixed(1);
            ctx.fillText(`${tVal}ms`, x, MT + DH + (4 * dpr));
        }
    } else {
        // Grade sutil centralizada para miniatura PIP
        ctx.moveTo(ML, MT + DH / 2);
        ctx.lineTo(ML + DW, MT + DH / 2);
        ctx.moveTo(ML, MT);
        ctx.lineTo(ML + DW, MT);
        ctx.moveTo(ML, MT + DH);
        ctx.lineTo(ML + DW, MT + DH);
    }
    ctx.stroke();

    if (!timeFloatData) return;

    // Se estiver ao vivo, atualiza os dados do analisador
    if (isCapturing && !isFrozen && analyserNode) {
        analyserNode.getFloatTimeDomainData(timeFloatData);
    }

    // Algoritmo de Trigger de Passagem por Zero (Zero-Crossing)
    let startIndex = 0;
    if (isTriggerActive) {
        const searchLimit = Math.min(timeFloatData.length - DW, 1024);
        for (let i = 1; i < searchLimit; i++) {
            if (timeFloatData[i - 1] < 0 && timeFloatData[i] >= 0) {
                startIndex = i;
                break;
            }
        }
    }

    // Desenho da Onda
    ctx.save();
    ctx.beginPath();
    ctx.rect(ML, MT - (6 * dpr), DW, DH + (12 * dpr));
    ctx.clip();

    ctx.strokeStyle = isFrozen ? '#38bdf8' : '#00f0ff';
    ctx.lineWidth = isPip ? 1.6 * dpr : 2 * dpr;
    ctx.shadowBlur = isFrozen ? 4 : 8;
    ctx.shadowColor = '#0284c7';
    ctx.beginPath();

    const pointsToDraw = Math.min(DW, timeFloatData.length - startIndex);
    for (let x = 0; x < pointsToDraw; x++) {
        const rawSample = timeFloatData[startIndex + x];
        const sample = Math.max(-1, Math.min(1, rawSample * visualGain));
        const y = MT + (1 - (sample + 1) / 2) * DH;
        if (x === 0) ctx.moveTo(ML + x, y);
        else ctx.lineTo(ML + x, y);
    }
    ctx.stroke();
    ctx.restore();
}

// =============================================================================
// 7. RENDERIZAÇÃO DO ESPECTRO DE FREQUÊNCIA (FFT COM PICOS)
// =============================================================================

function drawFrequencySpectrum() {
    const ctx = freqCanvas.getContext('2d');
    const width = freqCanvas.width;
    const height = freqCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const isPip = isTimeMain;
    const dpr = window.devicePixelRatio || 1;
    const ML = isPip ? 10 * dpr : 55 * dpr;
    const MR = isPip ? 10 * dpr : 20 * dpr;
    const MT = isPip ? 10 * dpr : 15 * dpr;
    const MB = isPip ? 10 * dpr : 35 * dpr;
    const DW = width - ML - MR;
    const DH = height - MT - MB;
    const maxFreq = audioCtx ? audioCtx.sampleRate / 2 : 22050;

    // Eixos e Grade
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (!isPip) {
        // Ticks de Frequência
        ctx.fillStyle = '#64748b';
        ctx.font = `${11 * dpr}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const fullTicks = isLogScale
            ? [20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000].filter(f => f <= maxFreq)
            : [0, 4000, 8000, 12000, 16000, 20000].filter(f => f <= maxFreq);

        fullTicks.forEach(freq => {
            const xPos = ML + freqToXNorm(freq, maxFreq) * DW;
            ctx.moveTo(xPos, MT);
            ctx.lineTo(xPos, MT + DH);
            const label = freq >= 1000 ? `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k` : `${freq}`;
            ctx.fillText(label, xPos, MT + DH + (4 * dpr));
        });

        // Ticks de Intensidade [-100 dB a 0 dB]
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let dB = -100; dB <= 0; dB += 20) {
            const yPos = MT + DH - ((dB + 100) / 100) * DH;
            ctx.moveTo(ML, yPos);
            ctx.lineTo(ML + DW, yPos);
            ctx.fillText(`${dB}dB`, ML - (4 * dpr), yPos);
        }

        // Rótulo do Eixo
        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${11 * dpr}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Frequência (Hz)', ML + DW / 2, height - (12 * dpr));
    } else {
        // Grade sutil para miniatura PIP
        for (let i = 1; i <= 3; i++) {
            const y = MT + (i / 4) * DH;
            ctx.moveTo(ML, y);
            ctx.lineTo(ML + DW, y);
        }
    }
    ctx.stroke();

    if (!freqFloatData) return;

    // Se estiver ao vivo, atualiza os dados do FFT
    if (isCapturing && !isFrozen && analyserNode) {
        analyserNode.getFloatFrequencyData(freqFloatData);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(ML, MT, DW, DH);
    ctx.clip();

    // Curva FFT
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < bufferLength; i++) {
        const freq = (i * maxFreq) / bufferLength;
        if (freq < MIN_FREQ && isLogScale) continue;
        const xN = freqToXNorm(freq, maxFreq);
        const bx = ML + xN * DW;
        const dB = Math.max(-100, Math.min(0, freqFloatData[i]));
        const y = MT + DH - ((dB + 100) / 100) * DH;

        if (first) { ctx.moveTo(bx, y); first = false; }
        else ctx.lineTo(bx, y);
    }

    ctx.strokeStyle = isFrozen ? '#38bdf8' : '#00f0ff';
    ctx.lineWidth = isPip ? 1.4 * dpr : 1.8 * dpr;
    ctx.stroke();

    // Preenchimento gradiente suave
    ctx.lineTo(ML + DW, MT + DH);
    ctx.lineTo(ML, MT + DH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, MT, 0, MT + DH);
    fillGrad.addColorStop(0, isFrozen ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0, 240, 255, 0.3)');
    fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    ctx.restore();
}

// =============================================================================
// 8. CÁLCULO DE MÉTRICAS DO HUD
// =============================================================================

function updateMetricsHud() {
    if (!freqFloatData || !timeFloatData || (!isCapturing && !isFrozen)) {
        if (!isFrozen) {
            hudPeakFreq.textContent = '--- Hz';
            hudMusicalNote.textContent = '---';
            hudRmsLevel.textContent = '-∞ dBFS';
        }
        return;
    }

    // 1. Frequência de Pico com Interpolação Parabólica Sub-Bin
    let maxVal = -Infinity;
    let peakBin = -1;
    for (let i = 1; i < bufferLength - 1; i++) {
        if (freqFloatData[i] > maxVal) {
            maxVal = freqFloatData[i];
            peakBin = i;
        }
    }

    const maxFreq = audioCtx ? audioCtx.sampleRate / 2 : 22050;
    if (maxVal > -75 && peakBin > 0) {
        const alpha = freqFloatData[peakBin - 1];
        const beta = freqFloatData[peakBin];
        const gamma = freqFloatData[peakBin + 1];
        const denom = 2 * (alpha - 2 * beta + gamma);
        const delta = denom !== 0 ? (alpha - gamma) / denom : 0;
        const preciseFreq = (peakBin + delta) * (maxFreq / bufferLength);

        hudPeakFreq.textContent = `${preciseFreq.toFixed(1)} Hz`;
        hudMusicalNote.textContent = freqToMusicalNote(preciseFreq);
    } else {
        hudPeakFreq.textContent = '--- Hz';
        hudMusicalNote.textContent = '---';
    }

    // 2. RMS e dBFS
    let sumSq = 0;
    for (let i = 0; i < timeFloatData.length; i++) {
        sumSq += timeFloatData[i] * timeFloatData[i];
    }
    const rms = Math.sqrt(sumSq / timeFloatData.length);
    const dbfs = 20 * Math.log10(Math.max(rms, 1e-5));
    hudRmsLevel.textContent = dbfs > -85 ? `${dbfs.toFixed(1)} dBFS` : '-∞ dBFS';
}

// =============================================================================
// 9. LOOP DE ANIMAÇÃO E RENDERIZAÇÃO
// =============================================================================

function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    [timeCanvas, freqCanvas].forEach(c => {
        const rect = c.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const width = Math.floor(rect.width * dpr);
            const height = Math.floor(rect.height * dpr);
            if (c.width !== width || c.height !== height) {
                c.width = width;
                c.height = height;
            }
        }
    });
}

function renderFrame() {
    resizeCanvases();
    drawTimeDomain();
    drawFrequencySpectrum();
    updateMetricsHud();
}

function startAnimationLoop() {
    if (animationId) cancelAnimationFrame(animationId);

    function loop() {
        renderFrame();
        if (isCapturing || isFrozen) {
            animationId = requestAnimationFrame(loop);
        }
    }
    animationId = requestAnimationFrame(loop);
}

// =============================================================================
// 10. GESTÃO DE ABAS E EVENTOS DE INTERFACE
// =============================================================================

initTabs('.controls-panel', (targetTabId) => {
    if (activeTabId === 'tab-mic' && targetTabId !== 'tab-mic') {
        stopMicrophone(false);
    }
    activeTabId = targetTabId;
    renderFrame();
});

// Chave de 2 posições para escala de frequência (Logarítmica / Linear)
scaleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const scale = btn.getAttribute('data-scale');
        isLogScale = (scale === 'log');
        scaleBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderFrame();
    });
});

// Eventos da Aba 1 (Microfone - Botão Único)
btnMicStart.addEventListener('click', () => {
    if (!isCapturing) {
        initMicrophone();
    } else {
        toggleFreeze();
    }
});

// Botão Trigger do Osciloscópio
btnToggleTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isTriggerActive = !isTriggerActive;
    btnToggleTrigger.classList.toggle('active', isTriggerActive);
    btnToggleTrigger.textContent = `Trigger: ${isTriggerActive ? 'Zero-Cross' : 'Livre'}`;
    renderFrame();
});

// Botões de Alternância de Foco PIP (exclusivos da miniatura)
swapFocusBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        swapFocus();
    });
});

// Inspetor sob o Cursor no Gráfico de Frequência
freqCanvas.addEventListener('pointermove', e => {
    const rect = freqCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left) * dpr;
    const cy = (e.clientY - rect.top) * dpr;

    const isPip = isTimeMain;
    const ML = isPip ? 35 * dpr : 55 * dpr;
    const MR = isPip ? 10 * dpr : 20 * dpr;
    const MT = isPip ? 10 * dpr : 15 * dpr;
    const MB = isPip ? 22 * dpr : 35 * dpr;
    const DW = freqCanvas.width - ML - MR;
    const DH = freqCanvas.height - MT - MB;
    const maxFreq = audioCtx ? audioCtx.sampleRate / 2 : 22050;

    if (cx >= ML && cx <= ML + DW && cy >= MT && cy <= MT + DH) {
        const xNorm = (cx - ML) / DW;
        const freq = xNormToFreq(xNorm, maxFreq);
        const yNorm = 1 - (cy - MT) / DH;
        const dB = (yNorm * 100 - 100).toFixed(0);
        hudInspectorValue.textContent = `${freq.toFixed(0)} Hz | ${dB} dB (${freqToMusicalNote(freq)})`;
    } else {
        hudInspectorValue.textContent = 'Passe o mouse no gráfico';
    }
});

freqCanvas.addEventListener('pointerleave', () => {
    hudInspectorValue.textContent = 'Passe o mouse no gráfico';
});

// Redimensionamento de janela
window.addEventListener('resize', () => {
    renderFrame();
});

// =============================================================================
// 11. INICIALIZAÇÃO DA PÁGINA (DESIGN SYSTEM 2.0)
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => renderFrame()
    });

    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle'
    });

    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    document.querySelectorAll('.btn-toggle-pip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePipMinimized();
        });
    });

    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
    updateControlsState();
    renderFrame();
});
