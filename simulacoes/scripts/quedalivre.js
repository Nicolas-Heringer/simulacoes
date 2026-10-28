import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initFocusMirrorToolbar,
    initBottomSheet,
    initTabs,
    initKaTeXAutoRender,
    inlineSVGImages
} from './sim-ui.js';

// =============================================================================
// 1. CONFIGURAÇÕES & ESTADO FÍSICO
// =============================================================================
const PIXELS_POR_METRO = 50; // Escala: 50px = 1 metro

const state = {
    isRunning: true,
    speed: 1.0,
    time: 0.0,
    g: 9.8,             // m/s²
    restituicao: 0.75,   // adimensional [0, 1]
    arrasto: 0.02,      // kg/s
    massa: 2.0,         // kg
    raio: 28            // px
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

// =============================================================================
// 2. REDIMENSIONAMENTO FLUIDO DO CANVAS
// =============================================================================
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        // Manter a bola dentro dos limites válidos após resize
        ball.x = Math.max(state.raio, Math.min(w - state.raio, ball.x));
        ball.y = Math.max(state.raio, Math.min(h - state.raio, ball.y));
    }
}

function getCanvasLogicalWidth() {
    return canvas.clientWidth || (canvas.width / (window.devicePixelRatio || 1));
}

function getCanvasLogicalHeight() {
    return canvas.clientHeight || (canvas.height / (window.devicePixelRatio || 1));
}

// =============================================================================
// 3. FÍSICA E INTEGRAÇÃO TEMPORAL
// =============================================================================
function stepPhysics(dt) {
    if (ball.isDragging) return;

    const w = getCanvasLogicalWidth();
    const h = getCanvasLogicalHeight();
    const gPixels = state.g * PIXELS_POR_METRO;
    const r = state.raio;

    // Sub-stepping numérico (4 passos por frame para precisão de impacto)
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
            ball.vx = ball.vx * 0.98; // Atrito de contato com o chão

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

    // Energias (Joules)
    const K = 0.5 * state.massa * velM * velM;
    const U = state.massa * state.g * alturaM;
    const E = K + U;

    return { alturaM, velM, K, U, E };
}

// =============================================================================
// 4. RENDERIZAÇÃO GRÁFICA (CANVAS 2D)
// =============================================================================
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

    // 2. Linha do solo com gradiente
    const groundGrad = ctx.createLinearGradient(0, h - 8, 0, h);
    groundGrad.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
    groundGrad.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h - 6, w, 6);

    // 3. Sombra projetada no solo
    const distSolo = Math.max(0, h - r - ball.y);
    const shadowScale = Math.max(0.2, 1 - distSolo / 350);
    const shadowAlpha = Math.max(0.08, 0.45 * (1 - distSolo / 350));
    ctx.beginPath();
    ctx.ellipse(ball.x, h - 2, r * shadowScale * 1.2, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha.toFixed(2)})`;
    ctx.fill();

    // 4. Trajetória / Vetor Velocidade
    if (!ball.isDragging && (Math.abs(ball.vx) > 5 || Math.abs(ball.vy) > 5)) {
        const arrowScale = 0.15;
        const arrowX = ball.x + ball.vx * arrowScale;
        const arrowY = ball.y + ball.vy * arrowScale;

        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(arrowX, arrowY);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
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

    // Contorno
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ball.isDragging ? '#bae6fd' : '#fef08a';
    ctx.stroke();
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

            // Limitar velocidade máxima de arremesso para estabilidade
            const maxSpeed = 2500;
            const curSpeed = Math.hypot(ball.vx, ball.vy);
            if (curSpeed > maxSpeed) {
                ball.vx = (ball.vx / curSpeed) * maxSpeed;
                ball.vy = (ball.vy / curSpeed) * maxSpeed;
            }
        }
        ball.dragHistory = [];
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
}

// Reposiciona a bola no topo
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
        onResize: resizeCanvas
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

    // Barra de Transporte (Play / Pause)
    const playControl = initToggleButton('#btn-play-sim', (active) => {
        state.isRunning = active;
        const statusEl = document.getElementById('footer-status-text');
        if (statusEl) statusEl.textContent = active ? 'Simulação Ativa' : 'Pausada';
    });

    // Botão de Avanço Passo a Passo
    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning) playControl.setState(0);
        stepPhysics(0.016);
    });

    // Botão de Reinício (Reset)
    const handleReset = () => {
        state.time = 0;
        resetBall();
        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = 't = 0.00s';
    };
    document.getElementById('btn-reset-sim')?.addEventListener('click', handleReset);
    document.getElementById('btn-quick-reset')?.addEventListener('click', handleReset);

    // Seletor de Velocidade Temporal
    document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.speed = parseFloat(btn.dataset.speed || '1.0');
        });
    });

    // Sliders Sincronizados
    syncDualSlider('#slider-gravidade', '#num-gravidade', (val) => {
        state.g = val;
    });

    syncDualSlider('#slider-restituicao', '#num-restituicao', (val) => {
        state.restituicao = val;
    });

    syncDualSlider('#slider-arrasto', '#num-arrasto', (val) => {
        state.arrasto = val;
    });

    syncDualSlider('#slider-massa', '#num-massa', (val) => {
        state.massa = val;
    });

    // Navegação de Abas via Design System
    initTabs();

    // Inicialização do Mini-Gráfico RealtimePlot para Energia Mecânica
    plotEnergia = new RealtimePlot('#canvas-plot-energia', {
        maxPoints: 100,
        minVal: 0,
        maxVal: 400,
        color: '#facc15'
    });
}

// =============================================================================
// 7. LOOP PRINCIPAL DE ANIMAÇÃO
// =============================================================================
let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if (state.isRunning) {
        stepPhysics(dt * state.speed);
        state.time += dt * state.speed;

        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;
    }

    // Renderiza a cena
    render();

    // Telemetria e HUD
    const metrics = computeMetrics();
    const hudVel = document.getElementById('hud-vel');
    const hudAlt = document.getElementById('hud-altura');
    const hudEng = document.getElementById('hud-energia');
    const plotVal = document.getElementById('plot-valor-e');

    if (hudVel) hudVel.textContent = `${metrics.velM.toFixed(1)} m/s`;
    if (hudAlt) hudAlt.textContent = `${metrics.alturaM.toFixed(1)} m`;
    if (hudEng) hudEng.textContent = `${metrics.E.toFixed(1)} J`;
    if (plotVal) plotVal.textContent = `${metrics.E.toFixed(1)} J`;

    if (plotEnergia && state.isRunning) {
        plotEnergia.push(metrics.E);
    }
}

// =============================================================================
// 8. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    inlineSVGImages();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupPointerEvents();
    setupUI();
    resetBall();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});