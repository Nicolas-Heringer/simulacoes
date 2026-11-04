// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini
// Simulação: Laboratório de Áudio e Análise Espectral (Design System 2.0)
// Descrição: Captura de microfone com processamento Web Audio API, osciloscópio
//            com trigger de zero-crossing, FFT e congelamento didático (Freeze Frame).
//            Desktop: Canvas Principal + Miniatura PiP alternável ao clicar.
//            Mobile: Dois gráficos empilhados verticalmente + Gaveta sob demanda.
// =============================================================================

import {
    initSidebarCollapse,
    initKaTeXAutoRender,
    inlineSVGImages,
    initTabs,
    initFocusMirrorToolbar,
    initOnboardingModal,
    initModal,
    initToggleButton,
    syncDualSlider,
    setFieldState
} from './sim-ui.js';

// =============================================================================
// 1. ELEMENTOS DO DOM
// =============================================================================

// Containers de Canvas e Visualização
const timeCanvasContainer  = document.getElementById('timeCanvasContainer');
const freqCanvasContainer  = document.getElementById('freqCanvasContainer');
const timeCanvas          = document.getElementById('timeCanvas');
const freqCanvas          = document.getElementById('freqCanvas');
const canvasStage         = document.getElementById('canvasStage');

// Badges de Métrica Embutidos nos Cabeçalhos
const timeRmsBadge        = document.getElementById('timeRmsBadge');
const freqPeakBadge       = document.getElementById('freqPeakBadge');
const canvasInspectPill   = document.getElementById('canvasInspectPill');
const canvasInspectText   = document.getElementById('canvasInspectText');

// Botões dos Cabeçalhos dos Gráficos
const btnToggleTrigger    = document.getElementById('btnToggleTrigger');
const btnToggleScale      = document.getElementById('btnToggleScale');

// Barra de Transporte Flutuante (Canvas)
const btnTransportPlay    = document.getElementById('btn-transport-play');
const btnTransportReset   = document.getElementById('btn-transport-reset');
const btnTransportTrigger = document.getElementById('btn-transport-trigger');
const transportTriggerText = document.getElementById('transportTriggerText');
const btnTransportScale   = document.getElementById('btn-transport-scale');
const transportScaleText  = document.getElementById('transportScaleText');

// Controles do Painel Lateral
const micFieldHint        = document.getElementById('micFieldHint');
const headerStatusBadge   = document.getElementById('headerStatusBadge');
const headerStatusText    = document.getElementById('headerStatusText');
const footerStatusBadge   = document.getElementById('footerStatusBadge');
const footerStatusText    = document.getElementById('footerStatusText');
const scaleBtns           = document.querySelectorAll('#scaleControl .segment-btn');

// Leituras Numéricas (.sim-readout)
const readoutPeakFreq     = document.getElementById('readoutPeakFreq');
const readoutMusicalNote  = document.getElementById('readoutMusicalNote');
const readoutRms          = document.getElementById('readoutRms');
const readoutResolution   = document.getElementById('readoutResolution');
const readoutSampleRate   = document.getElementById('readoutSampleRate');

// Gaveta e Responsividade Mobile
const controlsPanel       = document.getElementById('controls-panel');
const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
const btnCloseDrawer      = document.getElementById('btn-close-drawer');
const btnExpandSidebar    = document.getElementById('btn-expand-sidebar');

// Modais
const btnOpenTheoryModal      = document.getElementById('btn-open-theory-modal');
const btnOpenTheoryModalInner = document.getElementById('btn-open-theory-modal-inner');

// =============================================================================
// 2. ESTADO GLOBAL DO SISTEMA DE ÁUDIO E ANÁLISE
// =============================================================================

let audioCtx            = null;
let analyserNode        = null;
let micStream           = null;
let micSourceNode       = null;
let animationId         = null;

// Buffers de Áudio Float32 (Alta Precisão)
let timeFloatData       = null;
let freqFloatData       = null;
let bufferLength        = 1024;

// Estados de Operação e Layout
let isCapturing         = false;
let isFrozen            = false;
let isLogScale          = true;
let isTriggerActive     = true;
let isTimeMain          = false; // false = FFT principal, true = Osciloscópio principal
let visualGain          = 1.00;
let fftSmoothing        = 0.75;

// Estado da Inspeção sob o Cursor (Retículo no Espectro)
let inspectActive       = false;
let inspectX            = 0;
let inspectY            = 0;
let inspectFreq         = 0;
let inspectDb           = -100;

// Constantes Físicas e Musicais
const MIN_FREQ   = 20;    // Hz
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// =============================================================================
// 3. FUNÇÕES UTILITÁRIAS DE ESCALA E CONVERSÃO
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
            analyserNode.smoothingTimeConstant = fftSmoothing;
            analyserNode.minDecibels = -100;
            analyserNode.maxDecibels = 0;

            bufferLength = analyserNode.frequencyBinCount;
            timeFloatData = new Float32Array(analyserNode.fftSize);
            freqFloatData = new Float32Array(bufferLength);

            if (readoutSampleRate) {
                readoutSampleRate.textContent = `${(audioCtx.sampleRate / 1000).toFixed(1)} kHz`;
            }
            if (readoutResolution) {
                const res = (audioCtx.sampleRate / 2 / bufferLength).toFixed(1);
                readoutResolution.textContent = `~${res} Hz/bin`;
            }
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
            // Conecta exclusivamente ao analisador (sem retorno nos alto-falantes para evitar microfonia)
            micSourceNode.connect(analyserNode);
        }

        isCapturing = true;
        isFrozen = false;
        setFieldState(micFieldHint, 'valid', 'Microfone conectado e transmitindo.');
        updateControlsState();
        startAnimationLoop();
    } catch (err) {
        console.error('Falha ao acessar microfone:', err);
        setFieldState(micFieldHint, 'invalid', 'Permissão de microfone necessária para capturar o áudio.');
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
    if (!isCapturing && !isFrozen) {
        initMicrophone();
        return;
    }

    isFrozen = !isFrozen;
    updateControlsState();
}

function resetBuffers() {
    if (timeFloatData) timeFloatData.fill(0);
    if (freqFloatData) freqFloatData.fill(-100);

    inspectActive = false;
    if (canvasInspectPill) canvasInspectPill.classList.add('hidden');

    if (timeRmsBadge) timeRmsBadge.textContent = 'RMS: -∞ dBFS';
    if (freqPeakBadge) freqPeakBadge.textContent = 'Pico: --- Hz';
    if (readoutPeakFreq) readoutPeakFreq.textContent = '--- Hz';
    if (readoutMusicalNote) readoutMusicalNote.textContent = '---';
    if (readoutRms) readoutRms.textContent = '-∞ dBFS';

    renderFrame();
}

function updateControlsState() {
    const playBtn = btnTransportPlay;
    const iconImg = playBtn?.querySelector('.icon-svg');
    const playText = playBtn?.querySelector('.btn-text');

    if (isCapturing && !isFrozen) {
        playBtn?.classList.add('is-active');
        playBtn?.setAttribute('data-state', '1');
        if (iconImg) iconImg.src = '../assets/icons/pause.svg';
        if (playText) playText.textContent = 'Congelar Tela';

        if (headerStatusBadge) {
            headerStatusBadge.className = 'sim-badge status-live';
            if (headerStatusText) headerStatusText.textContent = 'Ao Vivo';
        }
        if (footerStatusBadge) {
            footerStatusBadge.className = 'sim-badge';
            if (footerStatusText) footerStatusText.textContent = 'Captura Ativa';
        }
    } else if (isCapturing && isFrozen) {
        playBtn?.classList.remove('is-active');
        playBtn?.setAttribute('data-state', '0');
        if (iconImg) iconImg.src = '../assets/icons/play.svg';
        if (playText) playText.textContent = 'Retomar Captura';

        if (headerStatusBadge) {
            headerStatusBadge.className = 'sim-badge tone-cyan';
            if (headerStatusText) headerStatusText.textContent = 'Congelado';
        }
        if (footerStatusBadge) {
            footerStatusBadge.className = 'sim-badge tone-cyan';
            if (footerStatusText) footerStatusText.textContent = 'Tela Congelada';
        }
    } else {
        playBtn?.classList.remove('is-active');
        playBtn?.setAttribute('data-state', '0');
        if (iconImg) iconImg.src = '../assets/icons/play.svg';
        if (playText) playText.textContent = 'Capturar Áudio';

        if (headerStatusBadge) {
            headerStatusBadge.className = 'sim-badge idle';
            if (headerStatusText) headerStatusText.textContent = 'Pronto';
        }
        if (footerStatusBadge) {
            footerStatusBadge.className = 'sim-badge idle';
            if (footerStatusText) footerStatusText.textContent = 'Simulação Pronta';
        }
    }
}

// =============================================================================
// 5. GESTÃO DO LAYOUT PIP E ALTERNÂNCIA DE FOCO
// =============================================================================

function applyPipState() {
    const isMobile = window.innerWidth <= 900;
    const mainEl = isTimeMain ? timeCanvasContainer : freqCanvasContainer;
    const pipEl = isTimeMain ? freqCanvasContainer : timeCanvasContainer;

    if (!isMobile) {
        mainEl.className = 'audio-canvas-container canvas-main';
        pipEl.className = 'audio-canvas-container canvas-pip';
    } else {
        // No mobile: ambos são normais no fluxo vertical
        timeCanvasContainer.className = 'audio-canvas-container canvas-pip';
        freqCanvasContainer.className = 'audio-canvas-container canvas-main';
    }
}

function swapFocus() {
    if (window.innerWidth <= 900) return;
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

    const isMobile = window.innerWidth <= 900;
    const isPip = !isTimeMain && !isMobile;
    const dpr = window.devicePixelRatio || 1;
    const ML = isPip ? 8 * dpr : 45 * dpr;
    const MR = isPip ? 8 * dpr : 18 * dpr;
    const MT = isPip ? 14 * dpr : 14 * dpr;
    const MB = isPip ? 14 * dpr : (isMobile ? 24 * dpr : 28 * dpr);
    const DW = width - ML - MR;
    const DH = height - MT - MB;

    // Grade de fundo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (!isPip) {
        // Linhas de amplitude [-1.0 a +1.0]
        ctx.fillStyle = '#64748b';
        ctx.font = `${10 * dpr}px monospace`;
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

        const timeSteps = isMobile ? 3 : 5;
        for (let s = 0; s <= timeSteps; s++) {
            const x = ML + (s / timeSteps) * DW;
            ctx.moveTo(x, MT);
            ctx.lineTo(x, MT + DH);
            const tVal = ((s / timeSteps) * totalTimeMs).toFixed(1);
            ctx.fillText(`${tVal}ms`, x, MT + DH + (3 * dpr));
        }
    } else {
        // Grade sutil para miniatura PiP
        ctx.moveTo(ML, MT + DH / 2);
        ctx.lineTo(ML + DW, MT + DH / 2);
        ctx.moveTo(ML, MT);
        ctx.lineTo(ML + DW, MT);
        ctx.moveTo(ML, MT + DH);
        ctx.lineTo(ML + DW, MT + DH);
    }
    ctx.stroke();

    if (!timeFloatData) return;

    // Se estiver ao vivo, busca dados do analisador
    if (isCapturing && !isFrozen && analyserNode) {
        analyserNode.getFloatTimeDomainData(timeFloatData);
    }

    // Cálculo do Nível RMS
    let sumSq = 0;
    for (let i = 0; i < timeFloatData.length; i++) {
        sumSq += timeFloatData[i] * timeFloatData[i];
    }
    const rms = Math.sqrt(sumSq / timeFloatData.length);
    const dbfs = 20 * Math.log10(Math.max(rms, 1e-5));
    const rmsString = (isCapturing || isFrozen) && dbfs > -85
        ? `${dbfs.toFixed(1)} dBFS`
        : '-∞ dBFS';

    if (timeRmsBadge) timeRmsBadge.textContent = `RMS: ${rmsString}`;
    if (readoutRms) readoutRms.textContent = rmsString;

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
    ctx.rect(ML, MT - (4 * dpr), DW, DH + (8 * dpr));
    ctx.clip();

    ctx.strokeStyle = isFrozen ? '#38bdf8' : '#facc15';
    ctx.lineWidth = isPip ? 1.5 * dpr : 2 * dpr;
    ctx.shadowBlur = isFrozen ? 4 : 8;
    ctx.shadowColor = isFrozen ? 'rgba(56, 189, 248, 0.4)' : 'rgba(250, 204, 21, 0.4)';
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
// 7. RENDERIZAÇÃO DO ESPECTRO DE FREQUÊNCIA (FFT COM PICOS E RETÍCULO)
// =============================================================================

function drawFrequencySpectrum() {
    const ctx = freqCanvas.getContext('2d');
    const width = freqCanvas.width;
    const height = freqCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const isMobile = window.innerWidth <= 900;
    const isPip = isTimeMain && !isMobile;
    const dpr = window.devicePixelRatio || 1;
    const ML = isPip ? 8 * dpr : 50 * dpr;
    const MR = isPip ? 8 * dpr : 18 * dpr;
    const MT = isPip ? 10 * dpr : 14 * dpr;
    const MB = isPip ? 10 * dpr : (isMobile ? 26 * dpr : 30 * dpr);
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
        ctx.font = `${10 * dpr}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const fullTicks = isLogScale
            ? (isMobile ? [50, 250, 1000, 5000, 20000] : [20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000]).filter(f => f <= maxFreq)
            : (isMobile ? [0, 5000, 10000, 20000] : [0, 4000, 8000, 12000, 16000, 20000]).filter(f => f <= maxFreq);

        fullTicks.forEach(freq => {
            const xPos = ML + freqToXNorm(freq, maxFreq) * DW;
            ctx.moveTo(xPos, MT);
            ctx.lineTo(xPos, MT + DH);
            const label = freq >= 1000 ? `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k` : `${freq}`;
            ctx.fillText(label, xPos, MT + DH + (3 * dpr));
        });

        // Ticks de Intensidade [-100 dB a 0 dB]
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const dbStep = isMobile ? 30 : 20;
        for (let dB = -100; dB <= 0; dB += dbStep) {
            const yPos = MT + DH - ((dB + 100) / 100) * DH;
            ctx.moveTo(ML, yPos);
            ctx.lineTo(ML + DW, yPos);
            ctx.fillText(`${dB}dB`, ML - (4 * dpr), yPos);
        }
    } else {
        // Grade sutil para miniatura PiP
        for (let i = 1; i <= 3; i++) {
            const y = MT + (i / 4) * DH;
            ctx.moveTo(ML, y);
            ctx.lineTo(ML + DW, y);
        }
    }
    ctx.stroke();

    if (!freqFloatData) return;

    // Se estiver ao vivo, atualiza dados da FFT
    if (isCapturing && !isFrozen && analyserNode) {
        analyserNode.getFloatFrequencyData(freqFloatData);
    }

    // Cálculo da Frequência de Pico com Interpolação Parabólica Sub-Bin
    let maxVal = -Infinity;
    let peakBin = -1;
    for (let i = 1; i < bufferLength - 1; i++) {
        if (freqFloatData[i] > maxVal) {
            maxVal = freqFloatData[i];
            peakBin = i;
        }
    }

    if ((isCapturing || isFrozen) && maxVal > -75 && peakBin > 0) {
        const alpha = freqFloatData[peakBin - 1];
        const beta = freqFloatData[peakBin];
        const gamma = freqFloatData[peakBin + 1];
        const denom = 2 * (alpha - 2 * beta + gamma);
        const delta = denom !== 0 ? (alpha - gamma) / denom : 0;
        const preciseFreq = (peakBin + delta) * (maxFreq / bufferLength);
        const note = freqToMusicalNote(preciseFreq);

        const peakDisplay = `${preciseFreq.toFixed(1)} Hz (${note})`;
        if (freqPeakBadge) freqPeakBadge.textContent = `Pico: ${peakDisplay}`;
        if (readoutPeakFreq) readoutPeakFreq.textContent = `${preciseFreq.toFixed(1)} Hz`;
        if (readoutMusicalNote) readoutMusicalNote.textContent = note;
    } else if (!isCapturing && !isFrozen) {
        if (freqPeakBadge) freqPeakBadge.textContent = 'Pico: --- Hz';
        if (readoutPeakFreq) readoutPeakFreq.textContent = '--- Hz';
        if (readoutMusicalNote) readoutMusicalNote.textContent = '---';
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
    fillGrad.addColorStop(0, isFrozen ? 'rgba(56, 189, 248, 0.22)' : 'rgba(0, 240, 255, 0.25)');
    fillGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Retículo de Inspeção sob o Cursor/Touch
    if (inspectActive && !isPip) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.lineWidth = 1 * dpr;

        // Linha vertical
        ctx.beginPath();
        ctx.moveTo(inspectX, MT);
        ctx.lineTo(inspectX, MT + DH);
        ctx.stroke();

        // Linha horizontal
        ctx.beginPath();
        ctx.moveTo(ML, inspectY);
        ctx.lineTo(ML + DW, inspectY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ponto de destaque no cruzamento
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(inspectX, inspectY, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// =============================================================================
// 8. LOOP DE ANIMAÇÃO E RENDERIZAÇÃO
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
    if (document.hidden) {
        requestAnimationFrame(renderFrame);
        return;
    }
    resizeCanvases();
    drawTimeDomain();
    drawFrequencySpectrum();
}

function startAnimationLoop() {
    if (animationId) cancelAnimationFrame(animationId);

    function loop() {
        if (document.hidden) {
            animationId = requestAnimationFrame(loop);
            return;
        }
        renderFrame();
        if (isCapturing || isFrozen) {
            animationId = requestAnimationFrame(loop);
        }
    }
    animationId = requestAnimationFrame(loop);
}

// =============================================================================
// 9. EVENTOS DE INTERFACE E CONTROLADORES
// =============================================================================

function toggleScale() {
    isLogScale = !isLogScale;
    const label = isLogScale ? 'Log' : 'Lin';

    if (btnToggleScale) btnToggleScale.textContent = `Escala: ${label}`;
    if (transportScaleText) transportScaleText.textContent = label;

    scaleBtns.forEach(b => {
        b.classList.toggle('active', (b.dataset.scale === 'log') === isLogScale);
    });

    renderFrame();
}

function toggleTrigger() {
    isTriggerActive = !isTriggerActive;
    const label = isTriggerActive ? 'Zero-Cross' : 'Livre';

    if (btnToggleTrigger) {
        btnToggleTrigger.classList.toggle('active', isTriggerActive);
        btnToggleTrigger.textContent = `Trigger: ${label}`;
    }
    if (transportTriggerText) {
        transportTriggerText.textContent = `Trigger: ${isTriggerActive ? 'On' : 'Off'}`;
    }

    renderFrame();
}

// Eventos de Inspeção sob o Cursor e Toque (Pointer Events)
function handlePointerInspect(e) {
    const rect = freqCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left) * dpr;
    const cy = (e.clientY - rect.top) * dpr;

    const isMobile = window.innerWidth <= 900;
    const isPip = isTimeMain && !isMobile;
    if (isPip) return;

    const ML = 50 * dpr;
    const MR = 18 * dpr;
    const MT = 14 * dpr;
    const MB = (isMobile ? 26 * dpr : 30 * dpr);
    const DW = freqCanvas.width - ML - MR;
    const DH = freqCanvas.height - MT - MB;
    const maxFreq = audioCtx ? audioCtx.sampleRate / 2 : 22050;

    if (cx >= ML && cx <= ML + DW && cy >= MT && cy <= MT + DH) {
        inspectActive = true;
        inspectX = cx;
        inspectY = cy;

        const xNorm = (cx - ML) / DW;
        inspectFreq = xNormToFreq(xNorm, maxFreq);
        const yNorm = 1 - (cy - MT) / DH;
        inspectDb = yNorm * 100 - 100;

        if (canvasInspectPill && canvasInspectText) {
            canvasInspectPill.classList.remove('hidden');
            canvasInspectText.textContent = `${inspectFreq.toFixed(0)} Hz | ${inspectDb.toFixed(0)} dB (${freqToMusicalNote(inspectFreq)})`;
        }
        renderFrame();
    } else {
        clearInspect();
    }
}

function clearInspect() {
    if (inspectActive) {
        inspectActive = false;
        if (canvasInspectPill) canvasInspectPill.classList.add('hidden');
        renderFrame();
    }
}

// =============================================================================
// 10. INICIALIZAÇÃO DA PÁGINA (DESIGN SYSTEM 2.0)
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializa abas no painel lateral
    initTabs('.controls-panel', () => {
        renderFrame();
    });

    // 2. Recolhimento da Barra Lateral no Desktop (F)
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => renderFrame()
    });

    // 3. Espelhamento Dinâmico para Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // 4. Barra de Transporte na Base (initToggleButton)
    initToggleButton('#btn-transport-play', () => {
        toggleFreeze();
    });

    btnTransportReset?.addEventListener('click', () => {
        resetBuffers();
    });

    btnTransportTrigger?.addEventListener('click', () => {
        toggleTrigger();
    });

    btnTransportScale?.addEventListener('click', () => {
        toggleScale();
    });

    // 6. Cabeçalho dos Gráficos: Trigger e Escala
    btnToggleTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTrigger();
    });

    btnToggleScale?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScale();
    });

    // 7. Sliders de Ajuste Físico (Dual Sliders)
    syncDualSlider('#slider-visual-gain', '#input-visual-gain', (v) => {
        visualGain = v;
        renderFrame();
    });

    syncDualSlider('#slider-fft-smoothing', '#input-fft-smoothing', (v) => {
        fftSmoothing = v;
        if (analyserNode) analyserNode.smoothingTimeConstant = v;
    });

    // 8. Chave Segmentada da Escala de Frequência
    scaleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const scale = btn.getAttribute('data-scale');
            isLogScale = (scale === 'log');
            toggleScale();
        });
    });

    // 9. PiP: Alternar Foco com Clique na Miniatura (Desktop)
    [timeCanvasContainer, freqCanvasContainer].forEach(container => {
        container.addEventListener('click', (e) => {
            if (window.innerWidth <= 900) return;
            if (e.target.closest('button')) return; // Permite clicar nos botões do cabeçalho
            if (container.classList.contains('canvas-pip')) {
                swapFocus();
            }
        });
    });


    // 10. Inspeção no Canvas FFT (Pointer Events com suporte unificado a Mouse e Touch)
    freqCanvas.addEventListener('pointerdown', (e) => {
        freqCanvas.setPointerCapture(e.pointerId);
        handlePointerInspect(e);
    });

    freqCanvas.addEventListener('pointermove', handlePointerInspect);

    freqCanvas.addEventListener('pointerup', (e) => {
        try { freqCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        clearInspect();
    });

    freqCanvas.addEventListener('pointercancel', clearInspect);
    freqCanvas.addEventListener('pointerleave', clearInspect);

    // 11. Gaveta Lateral no Mobile (Substitui o Bottom Sheet)
    btnExpandSidebar?.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
            controlsPanel?.classList.add('mobile-drawer-open');
            mobileDrawerBackdrop?.classList.add('active');
        }
    });

    const closeMobileDrawer = () => {
        controlsPanel?.classList.remove('mobile-drawer-open');
        mobileDrawerBackdrop?.classList.remove('active');
    };

    btnCloseDrawer?.addEventListener('click', closeMobileDrawer);
    mobileDrawerBackdrop?.addEventListener('click', closeMobileDrawer);

    // 12. Modais
    initOnboardingModal('#modal-onboarding', { triggerSelector: '#btn-open-onboarding' });

    const theoryModal = initModal('#modal-theory');
    btnOpenTheoryModal?.addEventListener('click', () => theoryModal?.open());
    btnOpenTheoryModalInner?.addEventListener('click', () => theoryModal?.open());

    // 13. Redimensionamento e Inicialização de Estilos
    window.addEventListener('resize', () => {
        applyPipState();
        renderFrame();
    });

    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
    applyPipState();
    updateControlsState();
    renderFrame();
});
