import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initFocusMirrorToolbar,
    initBottomSheet,
    initTabs,
    initKaTeXAutoRender,
    inlineSVGImages,
    initOnboardingModal
} from './sim-ui.js';

// =============================================================================
// 1. CONFIGURAÇÕES & ESTADO FÍSICO
// =============================================================================
const PIXELS_POR_METRO = 50; // Escala: 50px = 1 metro
const ESCALA_FORCA_PX_POR_N = 5.0; // Escala unificada: 5px por Newton para forças físicas (P e F_arrasto)

const state = {
    isRunning: false,    // Inicia estritamente pausada (idle)
    speed: 1.0,
    time: 0.0,
    g: 9.8,              // m/s²
    restituicao: 0.75,    // adimensional [0, 1]
    arrasto: 0.02,       // kg/s
    massa: 2.0,          // kg
    raio: 28             // px
};

// Objeto Físico
const ball = {
    x: 200,
    y: 120,
    vx: 0,
    vy: 0,
    isDragging: false,
    dragPointerId: null,
    dragHistory: []
};

// Canvas e Contexto
const canvas = document.getElementById('simulacao');
const ctx = canvas.getContext('2d');

let plotEnergia = null;
let playControl = null;

// =============================================================================
// 2. REDIMENSIONAMENTO FLUIDO DO CANVAS
// =============================================================================
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const prevH = getCanvasLogicalHeight();
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w > 0 && h > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
        const wasOnGround = prevH > 0 && Math.abs(ball.y - (prevH - state.raio)) <= 2 && Math.abs(ball.vy) < 1;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Manter a bola dentro dos limites válidos (e colada ao solo se já estava em repouso no chão)
        ball.x = Math.max(state.raio, Math.min(w - state.raio, ball.x));
        if (wasOnGround) {
            ball.y = h - state.raio;
        } else {
            ball.y = Math.max(state.raio, Math.min(h - state.raio, ball.y));
        }
    }
}

function getCanvasLogicalWidth() {
    return canvas.clientWidth || (canvas.width / (window.devicePixelRatio || 1));
}

function getCanvasLogicalHeight() {
    return canvas.clientHeight || (canvas.height / (window.devicePixelRatio || 1));
}

// =============================================================================
// 3. FÍSICA E INTEGRAÇÃO TEMPORAL (EDO)
// =============================================================================
function stepPhysics(dt) {
    if (ball.isDragging) return;

    const w = getCanvasLogicalWidth();
    const h = getCanvasLogicalHeight();
    const gPixels = state.g * PIXELS_POR_METRO;
    const r = state.raio;

    // Sub-stepping numérico (4 passos por frame para fidelidade de impacto)
    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
        // Força de arrasto linear: F_drag = -b * v
        const dragAccX = -(state.arrasto / state.massa) * ball.vx;
        const dragAccY = -(state.arrasto / state.massa) * ball.vy;

        // Aceleração total
        const ax = dragAccX;
        const ay = gPixels + dragAccY;

        // Integração semi-implícita (Euler-Cromer)
        ball.vx += ax * subDt;
        ball.vy += ay * subDt;

        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;

        // --- Colisão com o Solo ---
        if (ball.y + r >= h) {
            ball.y = h - r;
            ball.vy = -ball.vy * state.restituicao;
            ball.vx = ball.vx * 0.98; // Atrito superficial com o piso

            // Repouso se a velocidade for imperceptível
            if (Math.abs(ball.vy) < 18) {
                ball.vy = 0;
            }
        }

        // --- Colisão com o Teto ---
        if (ball.y - r <= 0) {
            ball.y = r;
            ball.vy = -ball.vy * state.restituicao;
        }

        // --- Colisão com Paredes Laterais ---
        if (ball.x - r <= 0) {
            ball.x = r;
            ball.vx = -ball.vx * state.restituicao;
        } else if (ball.x + r >= w) {
            ball.x = w - r;
            ball.vx = -ball.vx * state.restituicao;
        }
    }
}

// Calcula grandezas físicas e telemetria
function computeMetrics() {
    const h = getCanvasLogicalHeight();
    const r = state.raio;

    // Altura em metros relativa ao solo
    const alturaPx = Math.max(0, h - r - ball.y);
    const alturaM = alturaPx / PIXELS_POR_METRO;

    // Velocidade escalar em m/s
    const velPx = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const velM = velPx / PIXELS_POR_METRO;

    // Energias instantâneas (Joules)
    const K = 0.5 * state.massa * velM * velM;
    const U = state.massa * state.g * alturaM;
    const E = K + U;

    return { alturaM, velM, K, U, E };
}

// =============================================================================
// 4. RENDERIZAÇÃO GRÁFICA & PASS DE APRESENTAÇÃO DESACOPLADO
// =============================================================================
function drawArrow(ctx, fromX, fromY, toX, toY, color, width = 2.5, headLength = 9) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;

    // Linha principal
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Cabeça da seta
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function render() {
    const w = getCanvasLogicalWidth();
    const h = getCanvasLogicalHeight();
    const r = state.raio;

    ctx.clearRect(0, 0, w, h);

    // 1. Grade sutil de referência métrica
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let y = h; y >= 0; y -= PIXELS_POR_METRO) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // 2. Linha do solo com gradiente de profundidade
    const groundGrad = ctx.createLinearGradient(0, h - 8, 0, h);
    groundGrad.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
    groundGrad.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h - 6, w, 6);

    // 3. Sombra projetada no piso
    const distSolo = Math.max(0, h - r - ball.y);
    const shadowScale = Math.max(0.2, 1 - distSolo / 350);
    const shadowAlpha = Math.max(0.08, 0.45 * (1 - distSolo / 350));
    ctx.beginPath();
    ctx.ellipse(ball.x, h - 2, r * shadowScale * 1.2, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha.toFixed(2)})`;
    ctx.fill();

    // 4. Vetores Físicos (Peso, Arrasto e Velocidade)
    // O comprimento total é sempre Raio (r) + Módulo do vetor, garantindo visibilidade além da borda da esfera
    const velM_x = ball.vx / PIXELS_POR_METRO;
    const velM_y = ball.vy / PIXELS_POR_METRO;

    // Força Peso: P = m * g (orientada verticalmente para baixo, θ = π/2)
    const Fg = state.massa * state.g;
    if (Fg > 0.01) {
        const fgMag = Math.min(150, Fg * ESCALA_FORCA_PX_POR_N);
        const totalFgLen = r + fgMag;
        const targetY = ball.y + totalFgLen;
        const fgHeadLen = Math.min(8, Math.max(4, fgMag * 0.6));
        drawArrow(ctx, ball.x, ball.y, ball.x, targetY, '#f43f5e', 2.5, fgHeadLen);
        ctx.fillStyle = '#f43f5e';
        ctx.font = '11px monospace';
        ctx.fillText(`P = ${Fg.toFixed(1)} N`, ball.x + 8, targetY);
    }

    // Força de Arrasto: F_arrasto = -b * v (sentido oposto ao vetor velocidade, calculado via atan2)
    // Compartilha rigorosamente a mesma constante ESCALA_FORCA_PX_POR_N do peso para fidelidade na 1ª Lei de Newton
    const Fdrag_x = -state.arrasto * velM_x;
    const Fdrag_y = -state.arrasto * velM_y;
    const FdragMag = Math.hypot(Fdrag_x, Fdrag_y);

    if (FdragMag > 0.005) {
        const angleDrag = Math.atan2(Fdrag_y, Fdrag_x);
        const dragMag = Math.min(150, FdragMag * ESCALA_FORCA_PX_POR_N);
        const totalDragLen = r + dragMag;
        const dragArrowX = ball.x + totalDragLen * Math.cos(angleDrag);
        const dragArrowY = ball.y + totalDragLen * Math.sin(angleDrag);
        const dragHeadLen = Math.min(8, Math.max(4, dragMag * 0.6));
        drawArrow(ctx, ball.x, ball.y, dragArrowX, dragArrowY, '#38bdf8', 2.5, dragHeadLen);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '11px monospace';
        ctx.fillText(`F_arrasto = ${FdragMag.toFixed(2)} N`, dragArrowX + 6, dragArrowY - 4);
    }

    // Vetor Velocidade (Amarelo, na direção e sentido do vetor velocidade instantâneo)
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!ball.isDragging && speed > 5) {
        const angleVel = Math.atan2(ball.vy, ball.vx);
        const velMag = Math.min(140, Math.max(14, speed * 0.15));
        const totalVelLen = r + velMag;
        const velArrowX = ball.x + totalVelLen * Math.cos(angleVel);
        const velArrowY = ball.y + totalVelLen * Math.sin(angleVel);
        drawArrow(ctx, ball.x, ball.y, velArrowX, velArrowY, 'rgba(250, 204, 21, 0.85)', 2, 7);
    }

    // 5. Renderização da Esfera Física com Efeito Glow
    const ballGrad = ctx.createRadialGradient(
        ball.x - r * 0.35, ball.y - r * 0.35, r * 0.1,
        ball.x, ball.y, r
    );

    if (ball.isDragging) {
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.4, '#38bdf8');
        ballGrad.addColorStop(1, '#0284c7');
    } else {
        ballGrad.addColorStop(0, '#fef08a');
        ballGrad.addColorStop(0.35, '#facc15');
        ballGrad.addColorStop(0.85, '#ca8a04');
        ballGrad.addColorStop(1, '#713f12');
    }

    // Glow suave
    ctx.shadowColor = ball.isDragging ? 'rgba(56, 189, 248, 0.6)' : 'rgba(250, 204, 21, 0.45)';
    ctx.shadowBlur = ball.isDragging ? 22 : 14;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();

    // Contorno estético
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ball.isDragging ? '#bae6fd' : '#fef08a';
    ctx.stroke();
}

function updateReadouts() {
    const metrics = computeMetrics();
    const elVel = document.getElementById('readout-vel');
    const elAlt = document.getElementById('readout-altura');
    const elK = document.getElementById('readout-energia-k');
    const elU = document.getElementById('readout-energia-u');
    const elE = document.getElementById('readout-energia-total');
    const plotVal = document.getElementById('plot-valor-e');

    if (elVel) elVel.textContent = `${metrics.velM.toFixed(2)} m/s`;
    if (elAlt) elAlt.textContent = `${metrics.alturaM.toFixed(2)} m`;
    if (elK) elK.textContent = `${metrics.K.toFixed(1)} J`;
    if (elU) elU.textContent = `${metrics.U.toFixed(1)} J`;
    if (elE) elE.textContent = `${metrics.E.toFixed(1)} J`;
    if (plotVal) plotVal.textContent = `${metrics.E.toFixed(1)} J`;
}

function updateVisualScene() {
    render();
    updateReadouts();
}

// =============================================================================
// 5. INTERAÇÃO TÁTIL UNIFICADA VIA POINTER EVENTS (TOUCH & MOUSE)
// =============================================================================
function setupPointerEvents() {
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function isInsideBall(pos) {
        const dx = pos.x - ball.x;
        const dy = pos.y - ball.y;
        return (dx * dx + dy * dy) <= (state.raio * 1.3) ** 2;
    }

    canvas.addEventListener('pointerdown', (e) => {
        const pos = getPointerPos(e);
        if (isInsideBall(pos)) {
            ball.isDragging = true;
            ball.dragPointerId = e.pointerId;
            ball.vx = 0;
            ball.vy = 0;
            ball.dragHistory = [{ x: pos.x, y: pos.y, t: performance.now() }];
            canvas.setPointerCapture(e.pointerId);
            canvas.style.cursor = 'grabbing';
            updateVisualScene();
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const pos = getPointerPos(e);

        if (ball.isDragging && e.pointerId === ball.dragPointerId) {
            const w = getCanvasLogicalWidth();
            const h = getCanvasLogicalHeight();
            const r = state.raio;

            ball.x = Math.max(r, Math.min(w - r, pos.x));
            ball.y = Math.max(r, Math.min(h - r, pos.y));

            const now = performance.now();
            ball.dragHistory.push({ x: ball.x, y: ball.y, t: now });

            // Manter apenas os últimos 80ms de histórico
            while (ball.dragHistory.length > 2 && (now - ball.dragHistory[0].t) > 80) {
                ball.dragHistory.shift();
            }

            updateVisualScene();
        } else {
            canvas.style.cursor = isInsideBall(pos) ? 'grab' : 'default';
        }
    });

    const endDrag = (e) => {
        if (!ball.isDragging || e.pointerId !== ball.dragPointerId) return;
        ball.isDragging = false;
        ball.dragPointerId = null;
        canvas.style.cursor = 'default';

        if (ball.dragHistory.length >= 2) {
            const first = ball.dragHistory[0];
            const last = ball.dragHistory[ball.dragHistory.length - 1];
            const dtSec = Math.max(0.016, (last.t - first.t) / 1000);

            // Calcula velocidade de arremesso
            ball.vx = (last.x - first.x) / dtSec;
            ball.vy = (last.y - first.y) / dtSec;

            // Limitar velocidade máxima de arremesso para estabilidade numérica
            const maxSpeed = 2500;
            const curSpeed = Math.hypot(ball.vx, ball.vy);
            if (curSpeed > maxSpeed) {
                ball.vx = (ball.vx / curSpeed) * maxSpeed;
                ball.vy = (ball.vy / curSpeed) * maxSpeed;
            }
        }
        ball.dragHistory = [];
        updateVisualScene();
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
}

// Reposiciona a bola no topo central
function resetBall() {
    const w = getCanvasLogicalWidth();
    ball.x = w / 2;
    ball.y = 100;
    ball.vx = 0;
    ball.vy = 0;
}

// =============================================================================
// 6. INTEGRAÇÃO COM DESIGN SYSTEM 2.0 (sim-ui.js)
// =============================================================================
function setupUI() {
    // Modo Foco Desktop (F)
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => {
            resizeCanvas();
            updateVisualScene();
        }
    });

    // Mobile Bottom Sheet
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // Barra flutuante de contexto para Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // Modal de Instruções Iniciais / Guia Rápido
    initOnboardingModal('#modal-onboarding', {
        triggerSelector: '#btn-open-onboarding'
    });

    // Barra Flutuante de Transporte: Play / Pause com toggle canônico
    playControl = initToggleButton('#btn-play-sim', (active) => {
        state.isRunning = active;
        const statusBadge = document.getElementById('footer-status-badge');
        const statusEl = document.getElementById('footer-status-text');
        if (statusBadge) {
            if (active) {
                statusBadge.classList.remove('idle');
            } else {
                statusBadge.classList.add('idle');
            }
        }
        if (statusEl) {
            statusEl.textContent = active ? 'Simulação Ativa' : 'Pausada (Em Espera)';
        }
    });

    // Botão de Avanço Passo a Passo (Passo Único Δt)
    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning && playControl) {
            playControl.setState(0);
        }
        const dtStep = 0.016 * state.speed;
        stepPhysics(dtStep);
        state.time += dtStep;

        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;

        const metrics = computeMetrics();
        if (plotEnergia) {
            plotEnergia.push(metrics.E, state.time);
        }
        updateVisualScene();
    });

    // Botões de Reinício (Reset)
    const handleReset = () => {
        state.time = 0;
        resetBall();
        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = 't = 0.00s';
        if (plotEnergia) {
            plotEnergia.clear();
        }
        updateVisualScene();
    };
    document.getElementById('btn-reset-sim')?.addEventListener('click', handleReset);
    document.getElementById('btn-quick-reset')?.addEventListener('click', handleReset);

    // Botão Cíclico de Velocidade na Barra Flutuante [0.5, 1.0, 2.0, 5.0]×
    const speedCycleSteps = [0.5, 1.0, 2.0, 5.0];
    const btnSpeedCycle = document.getElementById('btn-speed-cycle');
    if (btnSpeedCycle) {
        btnSpeedCycle.addEventListener('click', () => {
            const currentIdx = speedCycleSteps.indexOf(state.speed);
            const nextSpeed = speedCycleSteps[(currentIdx + 1) % speedCycleSteps.length];
            state.speed = nextSpeed;
            btnSpeedCycle.dataset.speed = nextSpeed.toFixed(1);
            btnSpeedCycle.textContent = `${nextSpeed.toFixed(1)}×`;
        });
    }

    // Sliders Sincronizados com Feedback Visual Imediato
    syncDualSlider('#slider-gravidade', '#num-gravidade', (val) => {
        state.g = val;
        updateVisualScene();
    });

    syncDualSlider('#slider-restituicao', '#num-restituicao', (val) => {
        state.restituicao = val;
        updateVisualScene();
    });

    syncDualSlider('#slider-arrasto', '#num-arrasto', (val) => {
        state.arrasto = val;
        updateVisualScene();
    });

    syncDualSlider('#slider-massa', '#num-massa', (val) => {
        state.massa = val;
        state.raio = Math.max(16, Math.min(45, Math.round(28 * Math.cbrt(state.massa / 2.0))));
        const w = getCanvasLogicalWidth();
        const h = getCanvasLogicalHeight();
        ball.x = Math.max(state.raio, Math.min(w - state.raio, ball.x));
        ball.y = Math.max(state.raio, Math.min(h - state.raio, ball.y));
        updateVisualScene();
    });

    // Navegação de Abas via Design System
    initTabs();

    // Inicialização do Mini-Gráfico RealtimePlot para Energia Mecânica
    plotEnergia = new RealtimePlot('#canvas-plot-energia', {
        maxPoints: 100,
        minVal: 0,
        maxVal: 400,
        autoScale: true,
        minSpan: 5.0,
        maxLabelSelector: '#plot-max-label',
        minLabelSelector: '#plot-min-label',
        color: '#facc15'
    });
}

// =============================================================================
// 7. LOOP PRINCIPAL DE ANIMAÇÃO
// =============================================================================
let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    // Otimização de Abas em Background
    if (document.hidden) {
        lastTime = currentTime;
        return;
    }

    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    // REGRA DE OURO: EDO e plotagem executam estritamente quando rodando
    if (state.isRunning) {
        stepPhysics(dt * state.speed);
        state.time += dt * state.speed;

        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;

        const metrics = computeMetrics();
        if (plotEnergia) {
            plotEnergia.push(metrics.E, state.time);
        }
    }

    // Pass de Apresentação Gráfica e Leituras Numéricas
    updateVisualScene();
}

// =============================================================================
// 8. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    inlineSVGImages();
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        updateVisualScene();
    });
    if (typeof ResizeObserver !== 'undefined' && canvas?.parentElement) {
        new ResizeObserver(() => {
            resizeCanvas();
            updateVisualScene();
        }).observe(canvas.parentElement);
    }
    setupPointerEvents();
    setupUI();
    resetBall();
    updateVisualScene();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});
