// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Lei de Snell (Ray Tracing Contínuo & Óptica de Meios Não-Homogêneos)
// Descrição: Os raios de luz seguem a equação diferencial d/ds(n·dr/ds) = ∇n,
//            simulando refração contínua, miragens, fibras ópticas e lentes GRIN.
// Arquivo: scripts/snell.js (ES Module com suporte ao Design System 2.0)
// =============================================================================

import {
    initToggleButton,
    syncDualSlider,
    initSidebarCollapse,
    initBottomSheet,
    initModal,
    inlineSVGImages,
    initTabs,
    initFocusMirrorToolbar,
    initKaTeXAutoRender
} from './sim-ui.js';

// =============================================================================
// 1. ESTADO GLOBAL E ELEMENTOS DA SIMULAÇÃO
// =============================================================================
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// trailCanvas: onde os rastros dos raios são acumulados de forma persistente
const trailCanvas = document.createElement('canvas');
const trailCtx = trailCanvas.getContext('2d');

let maps = null;              // { n, gx, gy, minN, maxN, dispersion } — Float32Arrays
let feixes = [];              // Raios de luz ativos na simulação
let isComputing = false;      // Flag de execução do Web Worker
let isPaused = false;         // Estado de pausa
let currentMode = 'point';    // 'point' | 'plane'
let angleDeg = 0;             // Ângulo de orientação da emissão em graus (0–359)
let isEmitting = false;       // Disparo contínuo ao arrastar o cursor
const mousePos = { x: 0, y: 0, inside: false };
let backgroundCache = null;   // ImageData do fundo n(x,y)
let playControl = null;

// =============================================================================
// 2. DISPERSÃO CROMÁTICA & CORES ESPECTRAIS
// =============================================================================
const WAVELENGTHS_NM = [700, 650, 600, 550, 500, 450, 410];
const LAMBDA_REF = 550;

function wavelengthToColor(λ) {
    let r = 0, g = 0, b = 0;
    if (λ >= 380 && λ < 440) { r = -(λ - 440) / 60; b = 1; }
    else if (λ >= 440 && λ < 490) { g = (λ - 440) / 50; b = 1; }
    else if (λ >= 490 && λ < 510) { g = 1; b = -(λ - 510) / 20; }
    else if (λ >= 510 && λ < 580) { r = (λ - 510) / 70; g = 1; }
    else if (λ >= 580 && λ < 645) { r = 1; g = -(λ - 645) / 65; }
    else if (λ >= 645 && λ <= 780) { r = 1; }

    let factor = 1.0;
    if (λ >= 380 && λ < 420) factor = 0.3 + 0.7 * (λ - 380) / 40;
    else if (λ > 680 && λ <= 700) factor = 0.3 + 0.7 * (700 - λ) / 20;

    return {
        css: `rgba(${Math.round(255 * r * factor)}, ${Math.round(255 * g * factor)}, ${Math.round(255 * b * factor)}, 0.9)`,
        r: Math.round(255 * r * factor), g: Math.round(255 * g * factor), b: Math.round(255 * b * factor)
    };
}

function dispersionFactor(λ, B) {
    return 1.0 + B * (1e6 / λ ** 2 - 1e6 / LAMBDA_REF ** 2);
}

// =============================================================================
// 3. MODELAGEM FÍSICA: CLASSE FEIXE & BUILDER
// =============================================================================
class Feixe {
    constructor(x, y, angle, colorCSS, dispFactor) {
        this.x = x;
        this.y = y;
        this.dirx = Math.cos(angle);
        this.diry = Math.sin(angle);
        this.colorCSS = colorCSS || 'rgba(255, 230, 50, 0.9)';
        this.dispFactor = dispFactor || 1.0;
        this.foraDoCanvas = false;
    }

    update(ds) {
        if (!canvas || !maps || !maps.n) return;
        const xi = Math.round(this.x);
        const yi = Math.round(this.y);

        if (xi >= 0 && xi < canvas.width && yi >= 0 && yi < canvas.height) {
            const idx = yi * canvas.width + xi;
            const nVal = maps.n[idx];
            const gxVal = maps.gx[idx] * this.dispFactor;
            const gyVal = maps.gy[idx] * this.dispFactor;

            // Equação diferencial do raio luminoso: d/ds(n·dr/ds) = ∇n
            this.dirx += ds * gxVal / nVal;
            this.diry += ds * gyVal / nVal;

            // Normalizar vetor direção
            const norm = Math.sqrt(this.dirx ** 2 + this.diry ** 2);
            if (norm > 0) {
                this.dirx /= norm;
                this.diry /= norm;
            }

            // Desenha no trailCanvas (acúmulo com persistência)
            trailCtx.fillStyle = this.colorCSS;
            trailCtx.fillRect(this.x - 1, this.y - 1, 2, 2);

            // Integração de posição
            this.x += ds * this.dirx;
            this.y += ds * this.diry;
        } else {
            this.foraDoCanvas = true;
        }
    }
}

class FeixesBuilder {
    constructor() {
        this.mode = 'point';
        this.angle = 0;
        this.aperture = Math.PI / 4;
        this.width = 120;
        this.count = 100;
        this.useDispersion = false;
        this.numWavelengths = 5;
        this.dispersionB = 0.0;
    }

    build(startX, startY) {
        const feixesCriados = [];
        const angleRad = this.angle;
        const numFeixes = this.count;
        const useDisp = this.useDispersion;
        const numWav = this.numWavelengths;
        const B = this.dispersionB;

        const configs = [];
        if (useDisp) {
            const step = Math.max(1, Math.floor(WAVELENGTHS_NM.length / numWav));
            const wavs = WAVELENGTHS_NM.filter((_, i) => i % step === 0).slice(0, numWav);
            const fxPerWav = Math.max(1, Math.round(numFeixes / wavs.length));
            wavs.forEach(λ => {
                const { css } = wavelengthToColor(λ);
                const dfac = dispersionFactor(λ, B);
                configs.push({ css, dfac, subCount: fxPerWav });
            });
        } else {
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#facc15';
            configs.push({ css: accent.startsWith('#') ? `${accent}ee` : 'rgba(250, 204, 21, 0.9)', dfac: 1.0, subCount: numFeixes });
        }

        if (this.mode === 'point') {
            configs.forEach(cfg => {
                for (let i = 0; i < cfg.subCount; i++) {
                    const t = cfg.subCount > 1 ? (i / (cfg.subCount - 1) - 0.5) : 0;
                    const rayAngle = angleRad + t * this.aperture;
                    feixesCriados.push(new Feixe(startX, startY, rayAngle, cfg.css, cfg.dfac));
                }
            });
        } else {
            const nx = -Math.sin(angleRad);
            const ny = Math.cos(angleRad);

            configs.forEach(cfg => {
                for (let i = 0; i < cfg.subCount; i++) {
                    const t = cfg.subCount > 1 ? (i / (cfg.subCount - 1) - 0.5) : 0;
                    const posX = startX + nx * (t * this.width);
                    const posY = startY + ny * (t * this.width);
                    feixesCriados.push(new Feixe(posX, posY, angleRad, cfg.css, cfg.dfac));
                }
            });
        }

        return feixesCriados;
    }

    drawPreview(targetCtx, x, y) {
        targetCtx.save();
        targetCtx.translate(x, y);

        const angleRad = this.angle;
        const uX = Math.cos(angleRad);
        const uY = Math.sin(angleRad);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#facc15';

        if (this.mode === 'point') {
            // Seta de direção principal
            const arrowLen = 34;
            targetCtx.strokeStyle = accent;
            targetCtx.fillStyle = accent;
            targetCtx.lineWidth = 2;

            targetCtx.beginPath();
            targetCtx.moveTo(0, 0);
            targetCtx.lineTo(uX * arrowLen, uY * arrowLen);
            targetCtx.stroke();

            // Ponta da seta
            const tipLen = 7;
            const headAngle = Math.PI / 6;
            targetCtx.beginPath();
            targetCtx.moveTo(uX * arrowLen, uY * arrowLen);
            targetCtx.lineTo(
                uX * arrowLen - tipLen * Math.cos(angleRad - headAngle),
                uY * arrowLen - tipLen * Math.sin(angleRad - headAngle)
            );
            targetCtx.lineTo(
                uX * arrowLen - tipLen * Math.cos(angleRad + headAngle),
                uY * arrowLen - tipLen * Math.sin(angleRad + headAngle)
            );
            targetCtx.closePath();
            targetCtx.fill();

            // Leque de abertura angular
            const arcRadius = 45;
            const halfAp = this.aperture / 2;
            targetCtx.beginPath();
            targetCtx.setLineDash([3, 3]);
            targetCtx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
            targetCtx.fillStyle = 'rgba(250, 204, 21, 0.08)';
            targetCtx.moveTo(0, 0);
            targetCtx.arc(0, 0, arcRadius, angleRad - halfAp, angleRad + halfAp);
            targetCtx.closePath();
            targetCtx.stroke();
            targetCtx.fill();

            // Ponto central de emissão
            targetCtx.setLineDash([]);
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 3.5, 0, Math.PI * 2);
            targetCtx.fillStyle = '#ffffff';
            targetCtx.fill();

        } else {
            // Modo Onda Plana
            const nx = -Math.sin(angleRad);
            const ny = Math.cos(angleRad);
            const halfW = this.width / 2;

            targetCtx.strokeStyle = accent;
            targetCtx.lineWidth = 2.5;
            targetCtx.beginPath();
            targetCtx.moveTo(-nx * halfW, -ny * halfW);
            targetCtx.lineTo(nx * halfW, ny * halfW);
            targetCtx.stroke();

            const numArrows = Math.max(3, Math.min(7, Math.floor(this.width / 25)));
            const arrowLen = 20;
            const tipLen = 5;
            const headAngle = Math.PI / 6;

            targetCtx.lineWidth = 1.5;
            targetCtx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
            targetCtx.fillStyle = 'rgba(250, 204, 21, 0.75)';

            for (let i = 0; i < numArrows; i++) {
                const t = numArrows > 1 ? (i / (numArrows - 1) - 0.5) : 0;
                const ax = nx * (t * this.width);
                const ay = ny * (t * this.width);

                targetCtx.beginPath();
                targetCtx.moveTo(ax, ay);
                targetCtx.lineTo(ax + uX * arrowLen, ay + uY * arrowLen);
                targetCtx.stroke();

                targetCtx.beginPath();
                targetCtx.moveTo(ax + uX * arrowLen, ay + uY * arrowLen);
                targetCtx.lineTo(
                    ax + uX * arrowLen - tipLen * Math.cos(angleRad - headAngle),
                    ay + uY * arrowLen - tipLen * Math.sin(angleRad - headAngle)
                );
                targetCtx.lineTo(
                    ax + uX * arrowLen - tipLen * Math.cos(angleRad + headAngle),
                    ay + uY * arrowLen - tipLen * Math.sin(angleRad + headAngle)
                );
                targetCtx.closePath();
                targetCtx.fill();
            }

            targetCtx.beginPath();
            targetCtx.arc(0, 0, 3, 0, Math.PI * 2);
            targetCtx.fillStyle = '#ffffff';
            targetCtx.fill();
        }

        targetCtx.restore();
    }
}

const builder = new FeixesBuilder();

// =============================================================================
// 4. GERENCIAMENTO DE TELA & WEB WORKER
// =============================================================================
let worker = null;

function resizeCanvas() {
    if (!canvas) return;
    const area = canvas.parentElement;
    if (!area) return;
    const w = area.clientWidth;
    const h = area.clientHeight;
    if (w === 0 || h === 0) return;

    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        syncTrailCanvas();
    }
}

function syncTrailCanvas() {
    if (!canvas) return;
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;
}

function clearTrails() {
    feixes = [];
    if (trailCanvas.width > 0 && trailCanvas.height > 0) {
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
    const hudRays = document.getElementById('hudRaysCount');
    if (hudRays) hudRays.textContent = '0';
    const footerInfo = document.getElementById('footer-sim-info');
    if (footerInfo) footerInfo.textContent = 'Raios: 0';
}

function drawBackground() {
    if (!maps || !ctx || !canvas) return;
    const { n, minN, maxN } = maps;
    const W = canvas.width, H = canvas.height;
    const range = (maxN - minN) || 1;

    const imageData = ctx.createImageData(W, H);
    const d = imageData.data;

    for (let i = 0; i < W * H; i++) {
        const t = Math.max(0, Math.min(1, (n[i] - minN) / range));
        const p = i * 4;
        const luma = Math.round(15 + 40 * t);
        d[p] = luma;
        d[p + 1] = luma;
        d[p + 2] = luma;
        d[p + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    backgroundCache = ctx.getImageData(0, 0, W, H);
}

function redrawBackground() {
    clearTrails();
    drawBackground();
}

function requestMaps(funcName) {
    if (!worker || !canvas) return;
    isComputing = true;
    clearTrails();
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    worker.postMessage({ funcName, canvasWidth: canvas.width, canvasHeight: canvas.height });
}

function getFadeAlpha() {
    const sliderPersistencia = document.getElementById('persistenciaSlider');
    const val = parseInt(sliderPersistencia?.value || '100', 10);
    if (val >= 100) return 0;
    return 0.005 + ((100 - val) / 100) * 0.145;
}

// =============================================================================
// 5. INTERATIVIDADE DO CURSOR & DISPARO
// =============================================================================
function emitAt(x, y) {
    if (!maps || isComputing) return;

    const sliderAbertura = document.getElementById('aberturaSlider');
    const sliderNumFeixes = document.getElementById('numFeixesSlider');
    const toggleDispersao = document.getElementById('toggleDispersao');
    const sliderNumWav = document.getElementById('numWavelengthsSlider');

    builder.mode = currentMode;
    builder.angle = angleDeg * (Math.PI / 180);
    if (currentMode === 'point') {
        builder.aperture = parseInt(sliderAbertura?.value || '45', 10) * (Math.PI / 180);
    } else {
        builder.width = parseInt(sliderAbertura?.value || '120', 10);
    }
    builder.count = parseInt(sliderNumFeixes?.value || '100', 10);
    builder.useDispersion = toggleDispersao ? toggleDispersao.checked : false;
    builder.numWavelengths = parseInt(sliderNumWav?.value || '5', 10);
    builder.dispersionB = maps.dispersion;

    const novosFeixes = builder.build(x, y);
    feixes.push(...novosFeixes);

    const hudRays = document.getElementById('hudRaysCount');
    if (hudRays) hudRays.textContent = `${feixes.length}`;
    const footerInfo = document.getElementById('footer-sim-info');
    if (footerInfo) footerInfo.textContent = `Raios: ${feixes.length}`;
}

function updateHudAt(clientX, clientY) {
    if (!maps || !maps.n || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.floor((clientX - rect.left) * scaleX);
    const py = Math.floor((clientY - rect.top) * scaleY);

    const hudNValue = document.getElementById('hudNValue');
    const hudCoords = document.getElementById('hudCoords');

    if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
        const idx = py * canvas.width + px;
        const nVal = maps.n[idx];
        if (hudNValue) hudNValue.textContent = `n = ${nVal.toFixed(3)}`;
        if (hudCoords) hudCoords.textContent = `(x: ${px}, y: ${py})`;
    }
}

function updateHudAngle() {
    const hudAngle = document.getElementById('hudAngle');
    if (hudAngle) hudAngle.textContent = `θ = ${Math.round(angleDeg)}°`;
}

// =============================================================================
// 6. SETUP DE CONTROLADORES & EVENTOS
// =============================================================================
function setupEventListeners() {
    // --- MODO FOCO / RECOLHIMENTO DA SIDEBAR (DESKTOP) ---
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => {
            resizeCanvas();
            const selectPerfil = document.getElementById('refractiveIndexFunction');
            if (selectPerfil?.value) requestMaps(selectPerfil.value);
        }
    });

    // --- BOTTOM SHEET MOBILE (<= 900PX) ---
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // --- NAVEGAÇÃO ENTRE ABAS DO PAINEL ---
    initTabs('.controls-panel');

    // --- BARRA DE CONTEXTO EM MODO FOCO ---
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // --- PLAY / PAUSE COM TOGGLE BUTTON ---
    playControl = initToggleButton('#btnPlayPause', (active) => {
        isPaused = !active;
        const headerBadge = document.getElementById('header-status-badge');
        const footerBadge = document.getElementById('footer-status-badge');
        const footerText = document.getElementById('footer-status-text');

        if (active) {
            if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Ativo</span>';
            if (footerText) footerText.textContent = 'Simulação Ativa';
            if (footerBadge) footerBadge.classList.add('badge-accent');
        } else {
            if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Pausado</span>';
            if (footerText) footerText.textContent = 'Simulação Pausada';
            if (footerBadge) footerBadge.classList.remove('badge-accent');
        }
    });

    // --- BOTÕES DE LIMPAR RASTROS ---
    const btnLimpar = document.getElementById('btnLimparFeixes');
    const btnQuickClear = document.getElementById('btn-quick-clear');
    if (btnLimpar) btnLimpar.addEventListener('click', clearTrails);
    if (btnQuickClear) btnQuickClear.addEventListener('click', clearTrails);

    // --- SELETOR DE PERFIL N(X,Y) ---
    const selectPerfil = document.getElementById('refractiveIndexFunction');
    if (selectPerfil) {
        selectPerfil.addEventListener('change', () => requestMaps(selectPerfil.value));
    }

    // --- SELETOR SEGMENTADO DE MODO DE EMISSÃO (PONTO / PLANO) ---
    const segmentBtns = document.querySelectorAll('#emissionModeControl .segment-btn');
    const sliderAbertura = document.getElementById('aberturaSlider');
    const numAbertura = document.getElementById('numAbertura');
    const spanAberturaLabel = document.getElementById('aberturaLabel');
    const spanAberturaUnit = document.getElementById('aberturaUnit');

    segmentBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            segmentBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;

            if (currentMode === 'point') {
                if (spanAberturaLabel) spanAberturaLabel.textContent = 'Abertura Angular';
                if (spanAberturaUnit) spanAberturaUnit.textContent = '°';
                if (sliderAbertura) {
                    sliderAbertura.min = '0';
                    sliderAbertura.max = '360';
                    sliderAbertura.step = '2';
                    sliderAbertura.value = '45';
                }
                if (numAbertura) {
                    numAbertura.min = '0';
                    numAbertura.max = '360';
                    numAbertura.step = '2';
                    numAbertura.value = '45';
                }
            } else {
                if (spanAberturaLabel) spanAberturaLabel.textContent = 'Largura da Frente';
                if (spanAberturaUnit) spanAberturaUnit.textContent = 'px';
                if (sliderAbertura) {
                    sliderAbertura.min = '10';
                    sliderAbertura.max = '400';
                    sliderAbertura.step = '5';
                    sliderAbertura.value = '120';
                }
                if (numAbertura) {
                    numAbertura.min = '10';
                    numAbertura.max = '400';
                    numAbertura.step = '5';
                    numAbertura.value = '120';
                }
            }
        });
    });

    // --- SLIDERS SINCRONIZADOS (DUAL-INPUT) ---
    syncDualSlider('#aberturaSlider', '#numAbertura');
    syncDualSlider('#numFeixesSlider', '#numFeixesInput');
    syncDualSlider('#persistenciaSlider', '#persistenciaInput');
    syncDualSlider('#numWavelengthsSlider', '#numWavelengthsInput');

    // --- SWITCH DE DISPERSÃO CROMÁTICA ---
    const toggleDispersao = document.getElementById('toggleDispersao');
    const wavelengthControl = document.getElementById('wavelengthControl');
    if (toggleDispersao && wavelengthControl) {
        toggleDispersao.addEventListener('change', () => {
            wavelengthControl.style.display = toggleDispersao.checked ? 'block' : 'none';
        });
    }

    // --- MODAL DE TEORIA ---
    const theoryModal = initModal('#modal-theory-snell');
    const btnOpenTheoryModal = document.getElementById('btn-open-theory-modal');
    if (btnOpenTheoryModal && theoryModal) {
        btnOpenTheoryModal.addEventListener('click', () => {
            theoryModal.open();
        });
    }

    // --- EVENTOS DO CANVAS (POINTER EVENTS UNIFICADOS) ---
    if (canvas) {
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const step = e.shiftKey ? 1 : 5;
            const delta = e.deltaY < 0 ? -step : step;
            angleDeg = (angleDeg + delta + 360) % 360;
            updateHudAngle();
        }, { passive: false });

        canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            isEmitting = true;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            emitAt(mx, my);
        });

        window.addEventListener('pointerup', () => {
            isEmitting = false;
        });

        canvas.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const px = (e.clientX - rect.left) * scaleX;
            const py = (e.clientY - rect.top) * scaleY;

            mousePos.x = px;
            mousePos.y = py;
            mousePos.inside = true;

            updateHudAt(e.clientX, e.clientY);

            if (isEmitting) {
                emitAt(px, py);
            }
        });

        canvas.addEventListener('pointerleave', () => {
            mousePos.inside = false;
            isEmitting = false;
            const hudCoords = document.getElementById('hudCoords');
            if (hudCoords) hudCoords.textContent = '(fora da área)';
        });
    }
}

// =============================================================================
// 7. LOOP DE ANIMAÇÃO PRINCIPAL
// =============================================================================
function animate() {
    requestAnimationFrame(animate);
    if (!ctx || !maps || !backgroundCache) return;

    if (!isPaused) {
        const fadeAlpha = getFadeAlpha();
        if (fadeAlpha > 0) {
            trailCtx.globalCompositeOperation = 'destination-out';
            trailCtx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
            trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
            trailCtx.globalCompositeOperation = 'source-over';
        }

        trailCtx.globalCompositeOperation = 'lighter';
        for (let i = feixes.length - 1; i >= 0; i--) {
            const f = feixes[i];
            f.update(1.5);
            if (f.foraDoCanvas) feixes.splice(i, 1);
        }
        trailCtx.globalCompositeOperation = 'source-over';

        const hudRays = document.getElementById('hudRaysCount');
        if (hudRays) hudRays.textContent = `${feixes.length}`;
        const footerInfo = document.getElementById('footer-sim-info');
        if (footerInfo) footerInfo.textContent = `Raios: ${feixes.length}`;
    }

    ctx.putImageData(backgroundCache, 0, 0);
    ctx.drawImage(trailCanvas, 0, 0);

    if (mousePos.inside && !isComputing) {
        const sliderAbertura = document.getElementById('aberturaSlider');
        const sliderNumFeixes = document.getElementById('numFeixesSlider');

        builder.mode = currentMode;
        builder.angle = angleDeg * (Math.PI / 180);
        if (currentMode === 'point') {
            builder.aperture = parseInt(sliderAbertura?.value || '45', 10) * (Math.PI / 180);
        } else {
            builder.width = parseInt(sliderAbertura?.value || '120', 10);
        }
        builder.count = parseInt(sliderNumFeixes?.value || '100', 10);
        builder.drawPreview(ctx, mousePos.x, mousePos.y);
    }
}

// =============================================================================
// 8. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    resizeCanvas();
    syncTrailCanvas();
    setupEventListeners();
    updateHudAngle();

    // Inicializa o Web Worker
    worker = new Worker('scripts/snell.worker.js?v=' + Date.now());
    worker.onmessage = (e) => {
        if (e.data.error) {
            console.error('[Worker]', e.data.error);
            return;
        }
        maps = e.data;
        isComputing = false;
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        redrawBackground();
    };

    const selectPerfil = document.getElementById('refractiveIndexFunction');
    if (selectPerfil) {
        requestMaps(selectPerfil.value);
    }

    animate();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
});