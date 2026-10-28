// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini & Antigravity
// Simulação: Gravitação e Órbitas Planetárias 3D (Design System 2.0)
// Descrição: Simulação orbital 3D com projeção perspectiva interativa, integrador
//            simplético Velocity Verlet, telemetria multicanal de conservação de energia
//            e suporte a controles táteis mobile.
// =============================================================================

import {
    initSidebarCollapse,
    initBottomSheet,
    initToggleButton,
    initTabs,
    initFocusMirrorToolbar,
    syncDualSlider,
    MultiSeriesPlot,
    initKaTeXAutoRender,
    inlineSVGImages
} from './sim-ui.js';

// =============================================================================
// 1. CONFIGURAÇÕES FÍSICAS E ESTADO GLOBAL
// =============================================================================
const G = 1.0;

const state = {
    isRunning: true,
    speed: 1.0,
    time: 0.0,

    // Parâmetros Físicos
    massaSol: 1000,
    massaPlaneta: 10,
    distanciaInicial: 200,
    velocidadeInicial: 2.24,

    // Camadas Visuais
    showPosition: true,
    showVelocity: true,
    showTrail: true,
    showGrid: true,

    // Preset Ativo
    preset: 'circular'
};

// Câmera 3D Interativa
const camera = {
    yaw: 0.35,     // rotação horizontal em radianos
    pitch: 0.55,   // elevação vertical em radianos
    distance: 520, // distância focal / zoom
    isDragging: false,
    prevX: 0,
    prevY: 0
};

// Histórico de Rastro Orbital
const trail = [];
const MAX_TRAIL_POINTS = 220;

// =============================================================================
// 2. CORPOS CELESTES E DINÂMICA ORBITAL (VELOCITY VERLET)
// =============================================================================
class Planet {
    constructor(x, y, z, vx, vy, vz, mass) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.ax = 0;
        this.ay = 0;
        this.az = 0;
        this.mass = mass;
    }

    reset(x, y, z, vx, vy, vz, mass) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.mass = mass;
        this.computeAcceleration();
    }

    computeAcceleration() {
        const dx = -this.x;
        const dy = -this.y;
        const dz = -this.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);

        if (dist < 5) {
            this.ax = 0;
            this.ay = 0;
            this.az = 0;
            return;
        }

        // Força Gravitacional de Newton F = G * M * m / r^2
        const fOverM = (G * state.massaSol) / distSq;
        this.ax = (dx / dist) * fOverM;
        this.ay = (dy / dist) * fOverM;
        this.az = (dz / dist) * fOverM;
    }

    // Passo Simplético de Velocity Verlet
    stepVerlet(dt) {
        // 1. Posição atualizada com aceleração atual
        this.x += this.vx * dt + 0.5 * this.ax * dt * dt;
        this.y += this.vy * dt + 0.5 * this.ay * dt * dt;
        this.z += this.vz * dt + 0.5 * this.az * dt * dt;

        // Guarda acelerações antigas
        const oldAx = this.ax;
        const oldAy = this.ay;
        const oldAz = this.az;

        // 2. Calcula nova aceleração na nova posição
        this.computeAcceleration();

        // 3. Velocidade atualizada pela média das acelerações
        this.vx += 0.5 * (oldAx + this.ax) * dt;
        this.vy += 0.5 * (oldAy + this.ay) * dt;
        this.vz += 0.5 * (oldAz + this.az) * dt;
    }
}

const planet = new Planet(200, 0, 0, 0, 2.236, 0, 10);
planet.computeAcceleration();

// =============================================================================
// 3. CANVAS, PERSPECTIVA 3D E RENDERIZAÇÃO
// =============================================================================
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let canvasWidth = 800;
let canvasHeight = 600;

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvasWidth = Math.floor(rect.width);
    canvasHeight = Math.floor(rect.height);

    if (canvasWidth === 0 || canvasHeight === 0) return;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}

// Projeção Ortográfica-Perspectiva 3D com Rotação Esférica
function project3D(x, y, z) {
    // 1. Rotação em torno do eixo Y (Yaw)
    const cosY = Math.cos(camera.yaw);
    const sinY = Math.sin(camera.yaw);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    // 2. Rotação em torno do eixo X (Pitch)
    const cosP = Math.cos(camera.pitch);
    const sinP = Math.sin(camera.pitch);
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;

    // 3. Perspectiva cônica com distância focal
    const f = camera.distance;
    const depth = f + z2;
    const scale = depth > 30 ? (f / depth) : 0.05;

    return {
        x: x1 * scale + canvasWidth / 2,
        y: y2 * scale + canvasHeight / 2,
        scale: scale,
        depth: z2
    };
}

function drawArrow(x0, y0, x1, y1, color, width = 2) {
    const headlen = 9;
    const angle = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - headlen * Math.cos(angle - Math.PI / 6), y1 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headlen * Math.cos(angle + Math.PI / 6), y1 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function renderScene() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 1. Grade Eclíptica de Referência 3D
    if (state.showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;

        // Círculos concêntricos de referência
        const radii = [100, 200, 300];
        radii.forEach(r => {
            ctx.beginPath();
            const segments = 48;
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                const pt = project3D(r * Math.cos(theta), 0, r * Math.sin(theta));
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        });

        // Eixos de Coordenadas Principais no Plano XZ
        const xNeg = project3D(-340, 0, 0);
        const xPos = project3D(340, 0, 0);
        const zNeg = project3D(0, 0, -340);
        const zPos = project3D(0, 0, 340);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(xNeg.x, xNeg.y);
        ctx.lineTo(xPos.x, xPos.y);
        ctx.moveTo(zNeg.x, zNeg.y);
        ctx.lineTo(zPos.x, zPos.y);
        ctx.stroke();
        ctx.restore();
    }

    // 2. Rastro Histórico da Trajetória Orbital
    if (state.showTrail && trail.length > 1) {
        ctx.save();
        const total = trail.length;
        for (let i = 1; i < total; i++) {
            const p0 = project3D(trail[i - 1].x, trail[i - 1].y, trail[i - 1].z);
            const p1 = project3D(trail[i].x, trail[i].y, trail[i].z);
            const alpha = 0.1 + 0.75 * (i / total);

            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 3. O Sol no Centro (Foco Gravitacional)
    const sunPos = project3D(0, 0, 0);
    const sunRadius = Math.max(12, 18 * sunPos.scale);

    ctx.save();
    // Brilho Corona Solar
    const coronaGrad = ctx.createRadialGradient(sunPos.x, sunPos.y, 4, sunPos.x, sunPos.y, sunRadius * 2.8);
    coronaGrad.addColorStop(0, 'rgba(250, 204, 21, 0.9)');
    coronaGrad.addColorStop(0.35, 'rgba(245, 158, 11, 0.45)');
    coronaGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(sunPos.x, sunPos.y, sunRadius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Núcleo Solar
    ctx.beginPath();
    ctx.arc(sunPos.x, sunPos.y, sunRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();

    // 4. Planeta em Órbita
    const planetPos = project3D(planet.x, planet.y, planet.z);
    const planetRadius = Math.max(5, 7.5 * planetPos.scale);

    // Vetor Posição r (do Sol ao Planeta)
    if (state.showPosition) {
        drawArrow(sunPos.x, sunPos.y, planetPos.x, planetPos.y, '#10b981', 1.8);
    }

    // Vetor Velocidade v
    if (state.showVelocity) {
        const velScale = 16;
        const vEnd3D = project3D(
            planet.x + planet.vx * velScale,
            planet.y + planet.vy * velScale,
            planet.z + planet.vz * velScale
        );
        drawArrow(planetPos.x, planetPos.y, vEnd3D.x, vEnd3D.y, '#f43f5e', 2.0);
    }

    // Esfera do Planeta com Realce 3D
    ctx.save();
    const planetGrad = ctx.createRadialGradient(
        planetPos.x - planetRadius * 0.35,
        planetPos.y - planetRadius * 0.35,
        1,
        planetPos.x,
        planetPos.y,
        planetRadius
    );
    planetGrad.addColorStop(0, '#7dd3fc');
    planetGrad.addColorStop(0.5, '#0284c7');
    planetGrad.addColorStop(1, '#082f49');

    ctx.beginPath();
    ctx.arc(planetPos.x, planetPos.y, planetRadius, 0, Math.PI * 2);
    ctx.fillStyle = planetGrad;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
}

// =============================================================================
// 4. INTERAÇÃO TÁTIL E CÂMERA 3D (POINTER EVENTS)
// =============================================================================
function setupPointerEvents() {
    canvas.addEventListener('pointerdown', (e) => {
        camera.isDragging = true;
        camera.prevX = e.clientX;
        camera.prevY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!camera.isDragging) return;
        const dx = e.clientX - camera.prevX;
        const dy = e.clientY - camera.prevY;
        camera.prevX = e.clientX;
        camera.prevY = e.clientY;

        camera.yaw += dx * 0.008;
        camera.pitch += dy * 0.008;

        // Limita a elevação para prevenir inversão da câmera
        camera.pitch = Math.max(-1.4, Math.min(1.4, camera.pitch));
    });

    const endDrag = (e) => {
        if (camera.isDragging) {
            camera.isDragging = false;
        }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Zoom com a roda do mouse
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.distance += e.deltaY * 0.45;
        camera.distance = Math.max(260, Math.min(1100, camera.distance));
    }, { passive: false });

    // Botão de reset de câmera
    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
        camera.yaw = 0.35;
        camera.pitch = 0.55;
        camera.distance = 520;
    });
}

// =============================================================================
// 5. TELEMETRIA E CONTROLES DE INTERFACE (sim-ui.js)
// =============================================================================
let energyPlot = null;

function aplicarPreset(presetKey) {
    state.preset = presetKey;
    trail.length = 0;

    const inputDist = document.getElementById('num-distancia');
    const inputVel = document.getElementById('num-velocidade');
    const sliderDist = document.getElementById('slider-distancia');
    const sliderVel = document.getElementById('slider-velocidade');

    if (presetKey === 'circular') {
        state.distanciaInicial = 200;
        state.velocidadeInicial = Math.sqrt((G * state.massaSol) / state.distanciaInicial);
        planet.reset(state.distanciaInicial, 0, 0, 0, 0, state.velocidadeInicial, state.massaPlaneta);
    } else if (presetKey === 'eliptica') {
        state.distanciaInicial = 220;
        state.velocidadeInicial = 1.55;
        planet.reset(state.distanciaInicial, 0, 0, 0, 0, state.velocidadeInicial, state.massaPlaneta);
    } else if (presetKey === 'inclinada') {
        state.distanciaInicial = 200;
        const vTot = Math.sqrt((G * state.massaSol) / state.distanciaInicial);
        const inc = (35 * Math.PI) / 180;
        state.velocidadeInicial = vTot;
        planet.reset(
            state.distanciaInicial,
            0,
            0,
            0,
            vTot * Math.sin(inc),
            vTot * Math.cos(inc),
            state.massaPlaneta
        );
    } else if (presetKey === 'escape') {
        state.distanciaInicial = 180;
        state.velocidadeInicial = Math.sqrt((2 * G * state.massaSol) / state.distanciaInicial) * 1.02;
        planet.reset(state.distanciaInicial, 0, 0, 0, 0, state.velocidadeInicial, state.massaPlaneta);
    }

    if (inputDist) inputDist.value = state.distanciaInicial;
    if (sliderDist) sliderDist.value = state.distanciaInicial;
    if (inputVel) inputVel.value = state.velocidadeInicial.toFixed(2);
    if (sliderVel) sliderVel.value = state.velocidadeInicial.toFixed(2);

    document.querySelectorAll('.btn-preset, .preset-chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });

    if (energyPlot) energyPlot.clear();
}

function setupUI() {
    // 1. Sidebar Collapse (Modo Foco F) & Mobile Bottom Sheet
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: resizeCanvas
    });

    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle'
    });

    // Barra Flutuante de Modo Foco (Focus Mirror Toolbar)
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // 2. Barra de Transporte
    initToggleButton('#btn-toggle-sim', (active) => {
        state.isRunning = active;
    }, true);

    document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
        aplicarPreset(state.preset);
        state.time = 0;
        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = 't = 0.00s';
    });

    document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.speed = parseFloat(btn.dataset.speed || '1.0');
        });
    });

    // 3. Alternância de Abas Padronizada
    initTabs('.controls-panel');

    // 4. Presets
    document.querySelectorAll('.btn-preset, .preset-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            aplicarPreset(btn.dataset.preset);
        });
    });

    // 5. Sliders Sincronizados
    syncDualSlider('#slider-massa-sol', '#num-massa-sol', (val) => {
        state.massaSol = val;
        planet.computeAcceleration();
    });

    syncDualSlider('#slider-massa-planeta', '#num-massa-planeta', (val) => {
        state.massaPlaneta = val;
        planet.mass = val;
    });

    syncDualSlider('#slider-distancia', '#num-distancia', (val) => {
        state.distanciaInicial = val;
        planet.reset(state.distanciaInicial, 0, 0, 0, 0, state.velocidadeInicial, state.massaPlaneta);
        trail.length = 0;
    });

    syncDualSlider('#slider-velocidade', '#num-velocidade', (val) => {
        state.velocidadeInicial = val;
        planet.reset(state.distanciaInicial, 0, 0, 0, 0, state.velocidadeInicial, state.massaPlaneta);
        trail.length = 0;
    });

    // 6. Checkboxes Visuais
    document.getElementById('show-position')?.addEventListener('change', (e) => {
        state.showPosition = e.target.checked;
    });
    document.getElementById('show-velocity')?.addEventListener('change', (e) => {
        state.showVelocity = e.target.checked;
    });
    document.getElementById('show-orbit-trail')?.addEventListener('change', (e) => {
        state.showTrail = e.target.checked;
    });
    document.getElementById('show-grid-3d')?.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
    });

    // 7. Telemetria Multicanal (MultiSeriesPlot)
    energyPlot = new MultiSeriesPlot('#canvas-energy-plot', {
        maxPoints: 120,
        series: [
            { id: 'k', label: 'Cinética (K)', color: '#f43f5e', unit: ' J' },
            { id: 'u', label: 'Potencial (U)', color: '#38bdf8', unit: ' J' },
            { id: 'e', label: 'Total (E)', color: '#10b981', unit: ' J' }
        ],
        showLegend: true,
        showGrid: true
    });
}

// =============================================================================
// 6. LOOP PRINCIPAL DE SIMULAÇÃO & TELEMETRIA
// =============================================================================
let lastTime = performance.now();
let telemetryCounter = 0;

function animate(currentTime) {
    requestAnimationFrame(animate);

    const elapsed = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if (state.isRunning) {
        const simDt = elapsed * state.speed;
        state.time += simDt;

        // Substepping para estabilidade numérica absoluta (8 passos por frame)
        const subSteps = 8;
        const subDt = simDt / subSteps;
        for (let s = 0; s < subSteps; s++) {
            planet.stepVerlet(subDt);
        }

        // Armazena rastro
        trail.push({ x: planet.x, y: planet.y, z: planet.z });
        if (trail.length > MAX_TRAIL_POINTS) {
            trail.shift();
        }

        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;
    }

    renderScene();

    // Cálculos de Telemetria e Conservação de Energia
    const r = Math.sqrt(planet.x * planet.x + planet.y * planet.y + planet.z * planet.z);
    const vSq = planet.vx * planet.vx + planet.vy * planet.vy + planet.vz * planet.vz;
    const v = Math.sqrt(vSq);

    const K = 0.5 * planet.mass * vSq;
    const U = -(G * state.massaSol * planet.mass) / Math.max(1, r);
    const E = K + U;

    // Excentricidade Kepleriana: e = sqrt(1 + 2 E L^2 / (G^2 M^2 m^3))
    const lx = planet.y * planet.vz - planet.z * planet.vy;
    const ly = planet.z * planet.vx - planet.x * planet.vz;
    const lz = planet.x * planet.vy - planet.y * planet.vx;
    const lSq = (lx * lx + ly * ly + lz * lz) * (planet.mass * planet.mass);
    const mu = G * state.massaSol * planet.mass;
    const eTerm = 1 + (2 * E * lSq) / (mu * mu * planet.mass);
    const ecc = eTerm >= 0 ? Math.sqrt(eTerm) : 0;

    // Atualização de HUD
    const hudR = document.getElementById('hud-raio');
    const hudV = document.getElementById('hud-velocidade');
    const hudE = document.getElementById('hud-energia-total');
    const hudEcc = document.getElementById('hud-excentricidade');

    if (hudR) hudR.textContent = `${r.toFixed(1)} u`;
    if (hudV) hudV.textContent = `${v.toFixed(2)} u/s`;
    if (hudE) hudE.textContent = `${E.toFixed(1)} J`;
    if (hudEcc) hudEcc.textContent = `${ecc.toFixed(2)}`;

    // Push no gráfico de energia a cada 2 frames
    if (energyPlot && state.isRunning && ++telemetryCounter % 2 === 0) {
        energyPlot.push({
            k: K,
            u: U,
            e: E
        });
    }
}

// =============================================================================
// 7. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupPointerEvents();
    setupUI();
    aplicarPreset('circular');
    inlineSVGImages();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});