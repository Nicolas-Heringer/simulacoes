// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Interação de Partículas por Ondas Retardadas (Funções de Green & Dinâmica Molecular)
// Descrição: Motor 2D em Three.js (OrthographicCamera + Instanced Shaders em GPU)
//            com caixa de confinamento métrica (Ångströms), Pan/Zoom contínuo,
//            propagação causal retardada, potenciais intermoleculares e termostato.
// Arquivo: scripts/particulas.js (ES Module com suporte ao Design System 2.0)
// =============================================================================

import * as THREE from 'three';
import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initBottomSheet,
    initModal,
    inlineSVGImages,
    initTabs,
    initFocusMirrorToolbar,
    initKaTeXAutoRender,
    initOnboardingModal,
    getThemeColors,
    onThemeChange
} from './sim-ui.js';

// =============================================================================
// 1. CONSTANTES MÉTRICAS DO MUNDO 2D & ESCALA ESPACIAL
// =============================================================================
// Caixa 2D centrada na origem: x ∈ [-90, +90] Å, y ∈ [-65, +65] Å (180 × 130 Å)
// Na escala canônica S_REF = 5.0 px/Å (10 Å = 50 px), 180 × 130 Å equivale a 900 × 650 px
// e a distância unitária do potencial original (100 px) equivale exatamente a 20.0 Å.
const BOX_WIDTH = 180.0;
const BOX_HEIGHT = 130.0;
const HALF_BOX_W = BOX_WIDTH * 0.5;
const HALF_BOX_H = BOX_HEIGHT * 0.5;

const S_REF = 5.0;                  // Escala de referência física: 5.0 px/Å (10 Å = 50 px)
const FORCE_UNIT_ANG = 20.0;        // 100 px / 5.0 px/Å = 20.0 Å
const WAVE_FADE_R0_ANG = 17.0;      // 85 px / 5.0 px/Å = 17.0 Å
const CURSOR_RADIUS_ANG = 24.0;     // 120 px / 5.0 px/Å = 24.0 Å

// Margem de segurança para expiração da onda após cruzar o vértice mais distante R_box(x0, y0)
const MAX_SHELL_MARGIN_ANG = 2.0;

// Impulso entregue por CRUZAMENTO ÚNICO de cada frente de onda.
// Calibrado para o intervalo padrão (waveInterval = 3 passos) de modo a preservar a taxa média
// de transferência de momento (3 × 0.175 = 0.525) necessária para captura orbital e coesão cristalina,
// mantendo o impulso individual fixo quando o usuário altera o slider de waveInterval.
const IMPULSE_PER_CROSSING = 0.525;
const MAX_WAVES = 65536;
const MAX_PARTICLES = 256;

// Relógio físico fixo (Fixed Timestep) para frequência de emissão rigorosamente constante:
// 30 passos/s com waveInterval = 3 => emissão exata de 10 Hz independente da taxa do monitor.
const FIXED_TPS = 30;
const FIXED_DT = 1.0 / FIXED_TPS;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_SUBSTEPS_PER_FRAME = 2;

const MIN_PX_PER_10A = 15;          // 1.5 px/Å
const MAX_PX_PER_10A = 250;         // 25.0 px/Å
const PAN_LIMIT_ANG = 320.0;

// =============================================================================
// 2. ESTADO GLOBAL DA SIMULAÇÃO, POOL DE ONDAS & CÂMERA
// =============================================================================
const container = document.getElementById('three-container');

let isRunning = false;              // Inicia estritamente pausada por padrão (idle)
let simTime = 0.0;
let cumulativeWavePath = 0.0;       // Caminho escalar acumulado S(t) = Σ c_ang (r = S(t) - birthS)
let lastAnimTimestamp = 0;
let physicsAccumulator = 0.0;
let tipoDeInteracao = 'coulomb';
let interactionEnabled = true;
let thermostatEnabled = true;       // Termostato de Berendsen (NVT) ligado por padrão
let TEMP_LIMIT = 0.10;
let c = 2.0;                        // Velocidade de propagação (unidades canônicas; Δr_Å = c / S_REF)
let waveInterval = 3;               // Intervalo entre emissões de onda em passos de simulação (3 => 10 Hz)
let attenuation = 0.09;             // Taxa de acoplamento do termostato
let template = 'none';              // Inicia vazia (aguardando seleção de preset)
let epsilonCoulomb = 0.10;          // Constante de acoplamento coulombiano retardado
let cursorMode = 'repel';           // 'pan' | 'repel' | 'attract'
let activePointerWorld = null;      // { x, y } em Ångströms quando aplicando impulso radial

let particles = [];

// Pool plano (Struct-of-Arrays) sem alocação no GC para frentes de onda retardadas:
// waveBuffer armazena [x0_Å, y0_Å, birthS, carga] — imutável durante toda a vida da onda!
// A GPU calcula r = uCumulativePath - aWave.z em 1 ciclo, sem atualizar raios na CPU.
const waveBuffer = new Float32Array(MAX_WAVES * 4);
const waveEmitterIds = new Int16Array(MAX_WAVES);
const waveDeathPath = new Float32Array(MAX_WAVES);
let waveCount = 0;
let gpuWavesDirty = true;

// Buffers de instâncias de partículas para upload à GPU:
// particlePosRadius = [x_Å, y_Å, raio_Å, 0], particleColors = [r, g, b]
const particlePosRadius = new Float32Array(MAX_PARTICLES * 4);
const particleColors = new Float32Array(MAX_PARTICLES * 3);

// Estado da câmera ortográfica 2D
const view = {
    x: 0.0,                         // Centro X da câmera em Å
    y: 0.0,                         // Centro Y da câmera em Å
    scale: S_REF,                   // Pixels CSS por 1 Å (5.0 => 10 Å = 50 px)
    minScale: MIN_PX_PER_10A / 10.0,
    maxScale: MAX_PX_PER_10A / 10.0
};

let renderer = null;
let scene = null;
let camera = null;
let wavesGeo = null;
let wavesAttr = null;
let wavesMaterial = null;
let particlesGeo = null;
let particlesPosAttr = null;
let particlesColAttr = null;
let particlesMaterial = null;
let cursorGroup = null;
let cursorRingLine = null;
let cursorCenterDot = null;
let cursorRingMat = null;
let cursorDotMat = null;

let playControl = null;
let tempSliderCtrl = null;
let waveSpeedSliderCtrl = null;
let waveIntervalSliderCtrl = null;
let attenuationSliderCtrl = null;
let epsilonSliderCtrl = null;
let focusToolbarCtrl = null;
let plotEnergia = null;
let plotTemp = null;
let needsRender = true;

// Cache de cores RGB normalizadas [0..1] para evitar parsing em todo frame
const tempThreeColor = new THREE.Color();
function parseHexToLinearArray(hex) {
    tempThreeColor.set(hex);
    // Usamos componentes diretos sRGB no ShaderMaterial customizado para fidelidade 1:1 com UI
    const clean = hex.replace('#', '');
    const intVal = parseInt(clean, 16);
    return [
        ((intVal >> 16) & 255) / 255,
        ((intVal >> 8) & 255) / 255,
        (intVal & 255) / 255
    ];
}

// =============================================================================
// 3. ESTRATÉGIAS DE CÁLCULO DE INTERAÇÃO & FORÇAS (STAGE 1 — FIEL AO MODELO ATUAL)
// =============================================================================
// Unidade de distância das leis de força: r = distAng / FORCE_UNIT_ANG (1 unidade = 20 Å).
// Convenção: magnitude positiva = força em direção ao ponto de emissão da onda (atrativa).

// Escala de referência para que o decaimento 1/r² mantenha alcance efetivo de captura orbital
// em r ∈ [1.0, 2.5] (20 a 50 Å) e equilíbrio estável com o caroço repulsivo de Pauli (1/r⁶).
const COULOMB_RANGE_GAIN = 2.2;                  // Fator de alcance para compensar 1/r² em r > 1
// Raio de equilíbrio em ε_C = 0.10: r_eq = 0.72 (14.4 Å) => PAULI_A = 0.10 * 2.2 * 0.72⁴
const PAULI_A = 0.10 * COULOMB_RANGE_GAIN * Math.pow(0.72, 4); // ≈ 0.0591

// Lennard-Jones efetivo com decaimento de onda 1/r² e caroço 1/r⁶ (equilíbrio em r_eq = 1.0 = 20 Å),
// garantindo alcance atrativo compatível com a propagação de ondas na caixa 2D.
const LJ_STRENGTH = 0.18;

// Limitadores do caroço repulsivo (evitam chutes explosivos no passo discreto)
const R_MIN_CORE = 0.38;                         // distância mínima efetiva (7.6 Å)
const F_MAX_CORE = 1.2;                          // módulo máximo da força por cruzamento

function forceFromMagnitude(mag, dx, dy, distance, impulse) {
    const clamped = Math.max(-F_MAX_CORE, Math.min(F_MAX_CORE, mag));
    const s = (clamped * impulse) / distance;
    return { fx: dx * s, fy: dy * s };
}

const calculadoresDeInteracao = {
    lennardJones(particle, waveCharge, dx, dy, distance, distSq, impulse) {
        // Atração mediada pela frente de onda (∝ 1/r²) + repulsão de caroço de Pauli (∝ 1/r⁶)
        // com equilíbrio exato em r = 1.0 (20 Å)
        const r = Math.max(distance, R_MIN_CORE);
        const r2 = r * r;
        const r6 = r2 * r2 * r2;
        const mag = LJ_STRENGTH * (1.0 / r2 - 1.0 / r6);
        return forceFromMagnitude(mag, dx, dy, distance, impulse);
    },
    ambos(particle, waveCharge, dx, dy, distance, distSq, impulse) {
        return calculadoresDeInteracao.lennardJones(particle, waveCharge, dx, dy, distance, distSq, impulse);
    },
    atracao(particle, waveCharge, dx, dy, distance, distSq, impulse) {
        // F ∝ 1/r (fluxo circular 2D)
        const r = Math.max(distance, R_MIN_CORE);
        return forceFromMagnitude(0.18 / r, dx, dy, distance, impulse);
    },
    repulsao(particle, waveCharge, dx, dy, distance, distSq, impulse) {
        const r = Math.max(distance, R_MIN_CORE);
        return forceFromMagnitude(-0.18 / r, dx, dy, distance, impulse);
    },
    coulomb(particle, waveCharge, dx, dy, distance, distSq, impulse) {
        // F = −q_i q_j ε_C / r² − A / r⁶
        const r = Math.max(distance, R_MIN_CORE);
        const r2 = r * r;
        const r6 = r2 * r2 * r2;
        const qProduct = particle.charge * waveCharge;
        const mag = (-qProduct * epsilonCoulomb * COULOMB_RANGE_GAIN) / r2 - PAULI_A / r6;
        return forceFromMagnitude(mag, dx, dy, distance, impulse);
    }
};

// =============================================================================
// 4. CLASSE PARTICLE & GERADORES DE PRESETS EM COORDENADAS FÍSICAS (Å)
// =============================================================================
class Particle {
    static nextId = 0;

    constructor(x, y, radiusAng, colorHex, velocityX, velocityY, charge = 0, mass = 1) {
        this.id = Particle.nextId++;
        this.x = x;                 // Posição X em Ångströms (origem no centro da caixa)
        this.y = y;                 // Posição Y em Ångströms (origem no centro da caixa, +Y para cima)
        this.prevX = x;             // Posição no passo anterior (teste de cruzamento causal único)
        this.prevY = y;
        this.radius = radiusAng;    // Raio físico em Ångströms
        this.color = colorHex;
        this.rgb = parseHexToLinearArray(colorHex);
        this.mass = mass;
        this.charge = charge;
        this.velocityX = velocityX; // Velocidade em unidades canônicas (Δx_Å = velocityX / S_REF)
        this.velocityY = velocityY;
        this.waveTimer = Math.max(0, waveInterval - 1); // Emite já no 1º passo e depois a cada waveInterval
    }

    scaleVelocity(lambda) {
        this.velocityX *= lambda;
        this.velocityY *= lambda;
    }
}

function emitWave(xAng, yAng, charge, emitterId) {
    if (waveCount >= MAX_WAVES) return;
    const base = waveCount * 4;
    // Distância exata de (x0, y0) até o vértice mais distante da caixa 2D
    const maxDistToCorner = Math.hypot(Math.abs(xAng) + HALF_BOX_W, Math.abs(yAng) + HALF_BOX_H);
    waveBuffer[base] = xAng;
    waveBuffer[base + 1] = yAng;
    waveBuffer[base + 2] = cumulativeWavePath;
    waveBuffer[base + 3] = charge;
    waveEmitterIds[waveCount] = emitterId;
    waveDeathPath[waveCount] = cumulativeWavePath + maxDistToCorner + MAX_SHELL_MARGIN_ANG;
    waveCount++;
    gpuWavesDirty = true;
}

const positionGenerators = {
    singleStatic: {
        num: () => 1,
        generate: () => ({ x: 0, y: 0 }),
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 1.2,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    singleMoving: {
        num: () => 1,
        generate: () => ({ x: 0, y: 0 }),
        velocity: () => {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 1.3;
            return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        },
        radius: () => 1.2,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    livre: {
        num: () => 1,
        generate: () => ({ x: 0, y: 0 }),
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 1.2,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    double: {
        num: () => 2,
        generate(index) {
            const dist = BOX_WIDTH / 4; // 45 Å
            return { x: index === 0 ? -dist : dist, y: 0 };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 1.2,
        color: (type, index) => (index === 0 ? '#fb923c' : '#38bdf8'),
        mass: () => 1,
        charge: (type, index) => (index === 0 ? 1 : -1),
    },
    doubleMoving: {
        num: () => 2,
        generate(index) {
            const dist = BOX_WIDTH / 12; // 15 Å
            return { x: index === 0 ? -dist : dist, y: 0 };
        },
        velocity: (index) => ({ x: 0, y: index === 0 ? -1.0 : 1.0 }),
        radius: () => 1.2,
        color: (type, index) => (index === 0 ? '#fb923c' : '#38bdf8'),
        mass: () => 1,
        charge: (type, index) => (index === 0 ? 1 : -1),
    },
    many: {
        num: () => 3,
        generate(index) {
            const dist = 40.0; // -40, 0, +40 Å
            return { x: -dist + dist * index, y: 0 };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 1.0,
        color: (type, index) => ['#22c55e', '#38bdf8', '#22c55e'][index % 3],
        mass: () => 1,
        charge: (type, index) => (index === 1 ? -1 : 1),
    },
    figure8: {
        num: () => 3,
        generate(index) {
            const L = 28.0;
            const coords = [
                { x:  0.98795266 * L, y: -0.15475642 * L },
                { x: -0.98795266 * L, y:  0.15475642 * L },
                { x:  0.0,            y:  0.0 }
            ];
            return coords[index] || coords[0];
        },
        velocity(index) {
            const mass = 12;
            const vMult = 0.96;
            const kappa = (0.18 * FORCE_UNIT_ANG * IMPULSE_PER_CROSSING) / (S_REF * mass);
            const vScale = S_REF * Math.sqrt(kappa) * vMult;
            if (index === 2) {
                return { x: -1.15824446 * vScale, y: -0.63550608 * vScale };
            }
            return { x: 0.57912223 * vScale, y: 0.31775304 * vScale };
        },
        radius: () => 1.2,
        color: (type, index) => ['#fb923c', '#38bdf8', '#facc15'][index % 3],
        mass: () => 12,
        charge: (type, index) => [1, -1, 0][index % 3],
    },
    circular: {
        num: () => 12,
        generate(index, total) {
            const ringRadius = Math.min(BOX_WIDTH, BOX_HEIGHT) / 3.2;
            const angle = (index / total) * 2 * Math.PI;
            return {
                x: ringRadius * Math.cos(angle),
                y: ringRadius * Math.sin(angle),
            };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 0.8,
        color: () => '#38bdf8',
        mass: () => 1,
        charge: () => 0,
    },
    grid: {
        num: () => 36,
        generate(index, total) {
            const cols = Math.ceil(Math.sqrt(total));
            const rows = Math.ceil(total / cols);
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);
            const spacingX = BOX_WIDTH / (cols + 1);
            const spacingY = BOX_HEIGHT / (rows + 1);
            return {
                x: -HALF_BOX_W + (gridX + 1) * spacingX,
                y: HALF_BOX_H - (gridY + 1) * spacingY,
            };
        },
        velocity: () => ({ x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4 }),
        radius: () => 0.8,
        color: () => '#22c55e',
        mass: () => 2,
        charge: () => 0,
    },
    NaCl: {
        num: () => 64,
        generate(index) {
            // Grade quadrada centrada para evitar colapso anisotrópico em fileiras separadas
            const cols = 8;
            const spacing = 12.5; // Å (próximo ao equilíbrio da rede iônica)
            const halfSpan = ((cols - 1) * spacing) * 0.5;
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);
            return {
                x: -halfSpan + gridX * spacing,
                y:  halfSpan - gridY * spacing,
                type: (gridX + gridY) % 2 === 0 ? 'Na' : 'Cl',
            };
        },
        velocity: () => ({ x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.2 }),
        radius: (type) => (type === 'Na' ? 0.7 : 1.2),
        color: (type) => (type === 'Na' ? '#fb923c' : '#38bdf8'),
        mass: (type) => (type === 'Na' ? 2 : 4),
        charge: (type) => (type === 'Na' ? 1 : -1),
    },
    none: {
        num: () => 0,
        generate: () => ({ x: 0, y: 0 }),
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 0,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    }
};

function createParticles(templateName = 'NaCl') {
    const generator = positionGenerators[templateName] || positionGenerators.NaCl;
    const particleCount = Math.min(generator.num(), MAX_PARTICLES);
    Particle.nextId = 0;

    return Array.from({ length: particleCount }, (_, i) => {
        const { x, y, type } = generator.generate(i, particleCount);
        const { x: vx, y: vy } = generator.velocity(i);
        const mass = generator.mass ? generator.mass(type, i) : 1;
        const charge = generator.charge ? generator.charge(type, i) : 0;
        const radius = generator.radius ? generator.radius(type, i) : 0.8;
        const color = generator.color ? generator.color(type, i) : '#facc15';
        return new Particle(x, y, radius, color, vx, vy, charge, mass);
    });
}

// =============================================================================
// 5. MOTOR GRÁFICO THREE.JS 2D (ORTHOGRAPHIC CAMERA + GPU INSTANCED SHADERS)
// =============================================================================
function markBufferRangeUpdated(attr, floatCount) {
    if (!attr || floatCount <= 0) return;
    if (typeof attr.clearUpdateRanges === 'function' && typeof attr.addUpdateRange === 'function') {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, floatCount);
    }
    attr.needsUpdate = true;
}

function buildAnnulusBaseGeometry(segments = 64) {
    // Faixa anelar oca: position.xy = direção unitária (cos θ, sin θ), position.z = -1 (borda interna) ou +1 (externa)
    const positions = new Float32Array(segments * 2 * 3);
    const indices = new Uint16Array(segments * 6);

    for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const innerOff = i * 6;
        positions[innerOff] = cosT;
        positions[innerOff + 1] = sinT;
        positions[innerOff + 2] = -1.0;

        positions[innerOff + 3] = cosT;
        positions[innerOff + 4] = sinT;
        positions[innerOff + 5] = 1.0;

        const next = (i + 1) % segments;
        const i0 = i * 2;
        const i1 = i0 + 1;
        const n0 = next * 2;
        const n1 = n0 + 1;

        const idxOff = i * 6;
        indices[idxOff] = i0;
        indices[idxOff + 1] = i1;
        indices[idxOff + 2] = n1;
        indices[idxOff + 3] = i0;
        indices[idxOff + 4] = n1;
        indices[idxOff + 5] = n0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
}

function initThreeStage() {
    if (!container) return;

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(new THREE.Color('#040711'), 1);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.OrthographicCamera(-w / 10, w / 10, h / 10, -h / 10, -10, 10);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // 1. Interior escuro da Caixa de Confinamento 2D (180 × 130 Å)
    const boxBgGeo = new THREE.PlaneGeometry(BOX_WIDTH, BOX_HEIGHT);
    const boxBgMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#070b16'),
        depthTest: false,
        depthWrite: false
    });
    const boxBgMesh = new THREE.Mesh(boxBgGeo, boxBgMat);
    boxBgMesh.renderOrder = 0;
    scene.add(boxBgMesh);

    // 2. Grade métrica sutil a cada 10 Å dentro da caixa
    const gridPositions = [];
    const stepAng = 10.0;
    for (let x = -HALF_BOX_W + stepAng; x < HALF_BOX_W - 0.1; x += stepAng) {
        gridPositions.push(x, -HALF_BOX_H, 0, x, HALF_BOX_H, 0);
    }
    for (let y = -HALF_BOX_H + stepAng; y < HALF_BOX_H - 0.1; y += stepAng) {
        gridPositions.push(-HALF_BOX_W, y, 0, HALF_BOX_W, y, 0);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#94a3b8'),
        transparent: true,
        opacity: 0.055,
        depthTest: false,
        depthWrite: false
    });
    const gridLines = new THREE.LineSegments(gridGeo, gridMat);
    gridLines.renderOrder = 1;
    scene.add(gridLines);

    // 3. Instanced Shader em Anel Oco (Annulus) para Frentes de Onda Retardadas
    //    Rasteriza apenas a faixa fina do perímetro (~4 px) em vez do quadrado cheio (2r × 2r),
    //    eliminando >99% do overdraw na GPU mantendo a circunferência analítica sub-pixel.
    const baseQuad = new THREE.PlaneGeometry(2, 2);
    const WAVE_ANNULUS_SEGMENTS = 64;
    const baseAnnulus = buildAnnulusBaseGeometry(WAVE_ANNULUS_SEGMENTS);
    const cosHalfStep = Math.cos(Math.PI / WAVE_ANNULUS_SEGMENTS);
    wavesGeo = new THREE.InstancedBufferGeometry();
    wavesGeo.index = baseAnnulus.index;
    wavesGeo.attributes.position = baseAnnulus.attributes.position;
    wavesAttr = new THREE.InstancedBufferAttribute(waveBuffer, 4);
    wavesAttr.setUsage(THREE.DynamicDrawUsage);
    wavesGeo.setAttribute('aWave', wavesAttr);
    wavesGeo.instanceCount = 0;

    wavesMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            uPixelSize: { value: 1.0 / view.scale },
            uFadeR0: { value: WAVE_FADE_R0_ANG },
            uHalfBox: { value: new THREE.Vector2(HALF_BOX_W, HALF_BOX_H) },
            uCosHalfStep: { value: cosHalfStep },
            uInvCosHalfStep: { value: 1.0 / cosHalfStep },
            uCumulativePath: { value: 0.0 },
            uViewBounds: { value: new THREE.Vector4(-HALF_BOX_W, HALF_BOX_W, -HALF_BOX_H, HALF_BOX_H) }
        },
        vertexShader: `
            attribute vec4 aWave;
            uniform float uPixelSize;
            uniform float uCosHalfStep;
            uniform float uInvCosHalfStep;
            uniform float uCumulativePath;
            uniform vec4 uViewBounds;
            varying vec2 vLocal;
            varying vec2 vWorld;
            varying float vRadius;
            varying float vCharge;

            void main() {
                float r = uCumulativePath - aWave.z;
                vRadius = r;
                vCharge = aWave.w;

                bool culled = (r <= 0.0);
                float pad = 2.0 * uPixelSize;
                float rInner = max(0.0, r * uCosHalfStep - pad);
                float rOuter = (r + pad) * uInvCosHalfStep;

                // Frustum culling AABB da câmera (ondas totalmente fora da tela geram 0 fragmentos)
                if (!culled) {
                    if (aWave.x + rOuter < uViewBounds.x || aWave.x - rOuter > uViewBounds.y ||
                        aWave.y + rOuter < uViewBounds.z || aWave.y - rOuter > uViewBounds.w) {
                        culled = true;
                    }
                }

                // Hollow-interior culling: quando o recorte inteiro da câmera cabe no miolo vazio do anel
                if (!culled && rInner > 0.0) {
                    float maxDx = max(abs(uViewBounds.x - aWave.x), abs(uViewBounds.y - aWave.x));
                    float maxDy = max(abs(uViewBounds.z - aWave.y), abs(uViewBounds.w - aWave.y));
                    if (maxDx * maxDx + maxDy * maxDy < rInner * rInner) {
                        culled = true;
                    }
                }

                if (culled) {
                    vLocal = vec2(0.0);
                    vWorld = aWave.xy;
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    return;
                }

                float rad = (position.z < 0.0) ? rInner : rOuter;
                vLocal = position.xy * rad;
                vWorld = aWave.xy + vLocal;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorld, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uPixelSize;
            uniform float uFadeR0;
            uniform vec2 uHalfBox;
            varying vec2 vLocal;
            varying vec2 vWorld;
            varying float vRadius;
            varying float vCharge;

            void main() {
                if (vRadius <= 0.0) discard;
                float rDist = length(vLocal);
                float distToRingPx = abs(rDist - vRadius) / uPixelSize;
                if (distToRingPx > 1.45) discard;

                float ringMask = 1.0 - smoothstep(0.35, 1.35, distToRingPx);
                float ratio = vRadius / uFadeR0;
                float intens = 1.0 / (1.0 + ratio * ratio);

                // Atenua suavemente o campo fora das paredes da caixa 2D para destacar o domínio físico
                float outX = max(abs(vWorld.x) - uHalfBox.x, 0.0);
                float outY = max(abs(vWorld.y) - uHalfBox.y, 0.0);
                float boxFactor = (outX > 0.0 || outY > 0.0) ? 0.22 : 1.0;

                float alpha = ringMask * intens * boxFactor;
                if (alpha < 0.004) discard;

                vec3 col = vec3(0.980, 0.800, 0.082);
                if (vCharge > 0.5) {
                    col = vec3(0.984, 0.573, 0.235);
                } else if (vCharge < -0.5) {
                    col = vec3(0.220, 0.741, 0.973);
                }

                gl_FragColor = vec4(col, alpha);
            }
        `
    });

    const wavesMesh = new THREE.Mesh(wavesGeo, wavesMaterial);
    wavesMesh.frustumCulled = false;
    wavesMesh.renderOrder = 2;
    scene.add(wavesMesh);

    // 4. Contorno luminoso da Caixa 2D (paredes elásticas)
    const borderPts = new Float32Array([
        -HALF_BOX_W, -HALF_BOX_H, 0,
         HALF_BOX_W, -HALF_BOX_H, 0,
         HALF_BOX_W,  HALF_BOX_H, 0,
        -HALF_BOX_W,  HALF_BOX_H, 0
    ]);
    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.BufferAttribute(borderPts, 3));
    const borderMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#38bdf8'),
        transparent: true,
        opacity: 0.42,
        depthTest: false,
        depthWrite: false
    });
    const borderLoop = new THREE.LineLoop(borderGeo, borderMat);
    borderLoop.renderOrder = 3;
    scene.add(borderLoop);

    // 5. Barra de Escala Física Fixa de 10 Å abaixo do canto inferior esquerdo da caixa
    const barY = -HALF_BOX_H - 3.2;
    const tickHalf = 1.1;
    const barX0 = -HALF_BOX_W;
    const barX1 = barX0 + 10.0;
    const scaleBarPts = new Float32Array([
        barX0, barY, 0, barX1, barY, 0,
        barX0, barY - tickHalf, 0, barX0, barY + tickHalf, 0,
        barX1, barY - tickHalf, 0, barX1, barY + tickHalf, 0
    ]);
    const scaleBarGeo = new THREE.BufferGeometry();
    scaleBarGeo.setAttribute('position', new THREE.BufferAttribute(scaleBarPts, 3));
    const scaleBarMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#facc15'),
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false
    });
    const scaleBarLines = new THREE.LineSegments(scaleBarGeo, scaleBarMat);
    scaleBarLines.renderOrder = 4;
    scene.add(scaleBarLines);

    // Rótulo "10 Å" em alta resolução ao lado da barra de escala física no palco
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 96;
    const lCtx = labelCanvas.getContext('2d');
    if (lCtx) {
        lCtx.clearRect(0, 0, 256, 96);
        lCtx.font = '700 46px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        lCtx.fillStyle = 'rgba(250, 204, 21, 0.95)';
        lCtx.textAlign = 'left';
        lCtx.textBaseline = 'middle';
        lCtx.fillText('10 Å', 14, 50);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        labelTex.generateMipmaps = true;
        labelTex.minFilter = THREE.LinearMipmapLinearFilter;
        const labelMat = new THREE.SpriteMaterial({
            map: labelTex,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const scaleLabelSprite = new THREE.Sprite(labelMat);
        scaleLabelSprite.position.set(barX1 + 6.4, barY, 0);
        scaleLabelSprite.scale.set(11.0, 4.125, 1);
        scaleLabelSprite.renderOrder = 4;
        scene.add(scaleLabelSprite);
    }

    // 6. Instanced Shader para Partículas com Halo Suave (1 draw call para todas as partículas)
    particlesGeo = new THREE.InstancedBufferGeometry();
    particlesGeo.index = baseQuad.index;
    particlesGeo.attributes.position = baseQuad.attributes.position;
    particlesPosAttr = new THREE.InstancedBufferAttribute(particlePosRadius, 4);
    particlesPosAttr.setUsage(THREE.DynamicDrawUsage);
    particlesColAttr = new THREE.InstancedBufferAttribute(particleColors, 3);
    particlesColAttr.setUsage(THREE.DynamicDrawUsage);
    particlesGeo.setAttribute('aParticle', particlesPosAttr);
    particlesGeo.setAttribute('aColor', particlesColAttr);
    particlesGeo.instanceCount = 0;

    particlesMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
            uPixelSize: { value: 1.0 / view.scale }
        },
        vertexShader: `
            attribute vec4 aParticle;
            attribute vec3 aColor;
            uniform float uPixelSize;
            varying vec2 vLocal;
            varying float vRadius;
            varying vec3 vColor;

            void main() {
                vRadius = max(aParticle.z, 1.75 * uPixelSize);
                vColor = aColor;
                float extent = vRadius + 7.5 * uPixelSize;
                vLocal = position.xy * extent;
                vec2 worldPos = aParticle.xy + vLocal;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uPixelSize;
            varying vec2 vLocal;
            varying float vRadius;
            varying vec3 vColor;

            void main() {
                float dWorld = length(vLocal);
                float edgePx = (dWorld - vRadius) / uPixelSize;
                if (edgePx > 7.2) discard;

                float core = 1.0 - smoothstep(-0.65, 0.65, edgePx);
                float posEdge = max(edgePx, 0.0);
                float halo = exp(-posEdge * 0.42) * 0.40 * (1.0 - smoothstep(0.0, 7.2, posEdge));
                float alpha = clamp(core + halo * (1.0 - core), 0.0, 1.0);
                if (alpha < 0.005) discard;

                vec3 litColor = mix(vColor, vec3(1.0), core * 0.14);
                gl_FragColor = vec4(litColor, alpha);
            }
        `
    });

    const particlesMesh = new THREE.Mesh(particlesGeo, particlesMaterial);
    particlesMesh.frustumCulled = false;
    particlesMesh.renderOrder = 5;
    scene.add(particlesMesh);

    // 7. Indicador de Interação Radial do Cursor (Anel tracejado de 24 Å + ponto central)
    cursorGroup = new THREE.Group();
    cursorGroup.visible = false;
    cursorGroup.renderOrder = 6;

    const segments = 64;
    const ringSegPts = [];
    for (let i = 0; i < segments; i += 2) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        ringSegPts.push(
            Math.cos(a0) * CURSOR_RADIUS_ANG, Math.sin(a0) * CURSOR_RADIUS_ANG, 0,
            Math.cos(a1) * CURSOR_RADIUS_ANG, Math.sin(a1) * CURSOR_RADIUS_ANG, 0
        );
    }
    const cursorRingGeo = new THREE.BufferGeometry();
    cursorRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringSegPts, 3));
    cursorRingMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#facc15'),
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false
    });
    cursorRingLine = new THREE.LineSegments(cursorRingGeo, cursorRingMat);
    cursorRingLine.renderOrder = 6;
    cursorGroup.add(cursorRingLine);

    const dotGeo = new THREE.CircleGeometry(0.8, 20);
    cursorDotMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#facc15'),
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
    });
    cursorCenterDot = new THREE.Mesh(dotGeo, cursorDotMat);
    cursorCenterDot.renderOrder = 6;
    cursorGroup.add(cursorCenterDot);

    scene.add(cursorGroup);

    fitCameraToBox(true);
}

function updateCameraProjection() {
    if (!container || !camera || !renderer) return;
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);

    view.scale = Math.max(view.minScale, Math.min(view.maxScale, view.scale));
    view.x = Math.max(-PAN_LIMIT_ANG, Math.min(PAN_LIMIT_ANG, view.x));
    view.y = Math.max(-PAN_LIMIT_ANG, Math.min(PAN_LIMIT_ANG, view.y));

    const halfW = (w * 0.5) / view.scale;
    const halfH = (h * 0.5) / view.scale;

    camera.left = view.x - halfW;
    camera.right = view.x + halfW;
    camera.top = view.y + halfH;
    camera.bottom = view.y - halfH;
    camera.updateProjectionMatrix();

    const pixelSizeWorld = 1.0 / view.scale;
    if (wavesMaterial) {
        wavesMaterial.uniforms.uPixelSize.value = pixelSizeWorld;
        wavesMaterial.uniforms.uViewBounds.value.set(camera.left, camera.right, camera.bottom, camera.top);
    }
    if (particlesMaterial) particlesMaterial.uniforms.uPixelSize.value = pixelSizeWorld;

    if (cursorCenterDot) {
        const dotRadiusWorld = 4.0 * pixelSizeWorld;
        cursorCenterDot.scale.setScalar(dotRadiusWorld / 0.8);
    }

    needsRender = true;
}

function fitCameraToBox(preferCanonicalDesktopScale = true) {
    if (!container) return;
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);

    // Garante margem confortável para a caixa (180 × 130 Å) e para a barra de 10 Å abaixo
    const maxFitScale = Math.min((w * 0.90) / BOX_WIDTH, (h * 0.84) / BOX_HEIGHT);
    const targetScale = preferCanonicalDesktopScale
        ? Math.min(S_REF, maxFitScale)
        : maxFitScale;

    view.x = 0.0;
    view.y = 0.0;
    view.scale = Math.max(view.minScale, Math.min(view.maxScale, targetScale));

    updateCameraProjection();
}

function resizeStage() {
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    updateCameraProjection();
}

function clientToWorld(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const dxPx = clientX - rect.left - rect.width * 0.5;
    const dyPx = clientY - rect.top - rect.height * 0.5;
    return {
        x: view.x + dxPx / view.scale,
        y: view.y - dyPx / view.scale
    };
}

function zoomAtClientPoint(newScale, clientX, clientY) {
    if (!container) return;
    const clampedScale = Math.max(view.minScale, Math.min(view.maxScale, newScale));
    const rect = container.getBoundingClientRect();
    const dxPx = clientX - rect.left - rect.width * 0.5;
    const dyPx = clientY - rect.top - rect.height * 0.5;

    const worldX = view.x + dxPx / view.scale;
    const worldY = view.y - dyPx / view.scale;

    view.scale = clampedScale;
    view.x = worldX - dxPx / view.scale;
    view.y = worldY + dyPx / view.scale;

    updateCameraProjection();
    renderSceneNow();
}

// =============================================================================
// 6. CÁLCULOS FÍSICOS, PROPAGAÇÃO RETARDADA & TERMODINÂMICA
// =============================================================================
function calcularEnergiaCinetica(particulasList) {
    let energiaTotal = 0;
    for (let i = 0; i < particulasList.length; i++) {
        const p = particulasList[i];
        const vSq = p.velocityX * p.velocityX + p.velocityY * p.velocityY;
        energiaTotal += 0.5 * p.mass * vSq;
    }
    return energiaTotal;
}

function calcularTemperatura(particulasList) {
    // Teorema da Equipartição em 2D (2N graus de liberdade translacionais, k_B = 1):
    // K = N * k_B * T  =>  T = K / N
    if (particulasList.length === 0) return 0;
    const energiaCineticaTotal = calcularEnergiaCinetica(particulasList);
    return energiaCineticaTotal / particulasList.length;
}

function applyBerendsenThermostat(particulasList) {
    if (!thermostatEnabled || particulasList.length === 0) return;
    const temperatura = calcularTemperatura(particulasList);
    if (temperatura <= 1e-12) return;

    // Fator de reescalonamento contínuo de Berendsen:
    // λ = sqrt(1 + γ * (T_target / T - 1)), com guarda contra saltos numéricos quando T → 0
    const rawArg = 1.0 + attenuation * ((TEMP_LIMIT / temperatura) - 1.0);
    const safeArg = Math.max(rawArg, 0.01);
    const lambda = Math.max(0.5, Math.min(1.5, Math.sqrt(safeArg)));

    for (let idx = 0; idx < particulasList.length; idx++) {
        particulasList[idx].scaleVelocity(lambda);
    }
}

function calcularVrms(particulasList) {
    if (particulasList.length === 0) return 0;
    let sumVSq = 0;
    for (let i = 0; i < particulasList.length; i++) {
        const p = particulasList[i];
        sumVSq += p.velocityX * p.velocityX + p.velocityY * p.velocityY;
    }
    return Math.sqrt(sumVSq / particulasList.length);
}

function stepPhysics() {
    const cAng = c / S_REF;

    // 1. Avança o caminho escalar global S(t) em O(1) — dispensa atualizar raios na CPU —
    //    e expira em O(1) (Swap-and-Pop) cada onda ao cruzar o vértice mais distante R_box(x0, y0).
    cumulativeWavePath += cAng;

    let i = waveCount - 1;
    while (i >= 0) {
        if (cumulativeWavePath > waveDeathPath[i]) {
            const lastIdx = waveCount - 1;
            if (i !== lastIdx) {
                const base = i * 4;
                const lastBase = lastIdx * 4;
                waveBuffer[base] = waveBuffer[lastBase];
                waveBuffer[base + 1] = waveBuffer[lastBase + 1];
                waveBuffer[base + 2] = waveBuffer[lastBase + 2];
                waveBuffer[base + 3] = waveBuffer[lastBase + 3];
                waveEmitterIds[i] = waveEmitterIds[lastIdx];
                waveDeathPath[i] = waveDeathPath[lastIdx];
            }
            waveCount--;
            gpuWavesDirty = true;
        }
        i--;
    }

    // 2. Interação Causal Retardada por CRUZAMENTO ÚNICO da frente de onda:
    //    a onda age exatamente 1 vez, no passo em que a função f(t) = |r_p(t) - r_0| - R(t)
    //    troca de sinal (f_prev > 0 e f_curr <= 0). Considera o movimento do receptor e
    //    independe da velocidade c (sem casca de espessura artificial).
    const calcular = calculadoresDeInteracao[tipoDeInteracao];
    const pLen = particles.length;
    const wLen = waveCount;
    const invForceUnit = 1.0 / FORCE_UNIT_ANG;

    for (let pIdx = 0; pIdx < pLen; pIdx++) {
        const p = particles[pIdx];

        if (interactionEnabled && calcular && wLen > 0) {
            const px = p.x;
            const py = p.y;
            const ppx = p.prevX;
            const ppy = p.prevY;
            const pId = p.id;
            const invMass = 1.0 / p.mass;
            let dvx = 0.0;
            let dvy = 0.0;

            for (let wIdx = 0; wIdx < wLen; wIdx++) {
                if (waveEmitterIds[wIdx] === pId) continue;

                const wBase = wIdx * 4;
                const rCurr = cumulativeWavePath - waveBuffer[wBase + 2];
                if (rCurr <= 0.0) continue;

                // Condição 1: receptor está dentro (ou sobre) a frente de onda agora: d_curr <= R_curr
                const dxAng = waveBuffer[wBase] - px;
                if (dxAng > rCurr || dxAng < -rCurr) continue;
                const dyAng = waveBuffer[wBase + 1] - py;
                if (dyAng > rCurr || dyAng < -rCurr) continue;
                const distSqAng = dxAng * dxAng + dyAng * dyAng;
                if (distSqAng > rCurr * rCurr) continue;

                // Condição 2: no passo anterior o receptor ainda estava fora: d_prev > R_prev
                const rPrev = rCurr - cAng;
                if (rPrev > 0.0) {
                    const dxPrev = waveBuffer[wBase] - ppx;
                    const dyPrev = waveBuffer[wBase + 1] - ppy;
                    if (dxPrev * dxPrev + dyPrev * dyPrev <= rPrev * rPrev) continue;
                }

                const distAng = Math.sqrt(distSqAng);
                if (distAng < 1e-6) continue;

                const distance = distAng * invForceUnit;
                const dx = dxAng * invForceUnit;
                const dy = dyAng * invForceUnit;
                const distSq = distance * distance;
                const waveCharge = waveBuffer[wBase + 3];

                const { fx, fy } = calcular(p, waveCharge, dx, dy, distance, distSq, IMPULSE_PER_CROSSING);
                dvx += fx * invMass;
                dvy += fy * invMass;
            }

            p.velocityX += dvx;
            p.velocityY += dvy;
        }

        // Memoriza a posição no instante do teste causal (usada no próximo passo como r_p(t - Δt))
        p.prevX = p.x;
        p.prevY = p.y;

        // Integra posição em Ångströms (1 passo canônico: Δx_Å = velocity / S_REF)
        p.x += p.velocityX / S_REF;
        p.y += p.velocityY / S_REF;

        // Colisões elásticas com as paredes da Caixa 2D [-HALF_BOX_W..+HALF_BOX_W] × [-HALF_BOX_H..+HALF_BOX_H]
        if (p.x - p.radius < -HALF_BOX_W) {
            p.x = -HALF_BOX_W + p.radius;
            p.velocityX *= -1;
        } else if (p.x + p.radius > HALF_BOX_W) {
            p.x = HALF_BOX_W - p.radius;
            p.velocityX *= -1;
        }

        if (p.y - p.radius < -HALF_BOX_H) {
            p.y = -HALF_BOX_H + p.radius;
            p.velocityY *= -1;
        } else if (p.y + p.radius > HALF_BOX_H) {
            p.y = HALF_BOX_H - p.radius;
            p.velocityY *= -1;
        }

        // Emissão contínua de novas frentes de onda retardadas (frequência = FIXED_TPS / waveInterval)
        p.waveTimer += 1;
        if (p.waveTimer >= waveInterval) {
            p.waveTimer = 0;
            emitWave(p.x, p.y, p.charge, p.id);
        }
    }

    // 3. Termostato de Berendsen (NVT) — reescalonamento suave em direção a T_target
    applyBerendsenThermostat(particles);

    needsRender = true;
}

// =============================================================================
// 7. APRESENTAÇÃO VISUAL (PRESENTATION PASS) & TELEMETRIA
// =============================================================================
function updateStatusBadges() {
    const headerBadge = document.getElementById('header-status-badge');
    const footerBadge = document.getElementById('footer-status-badge');
    const footerText = document.getElementById('footer-status-text');

    if (particles.length === 0) {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Aguardando Preset</span>';
        if (footerText) footerText.textContent = 'Aguardando Preset';
        if (footerBadge) {
            footerBadge.classList.add('idle');
            footerBadge.classList.remove('badge-accent');
        }
    } else if (isRunning) {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Executando</span>';
        if (footerText) footerText.textContent = 'Simulação Ativa';
        if (footerBadge) {
            footerBadge.classList.remove('idle');
            footerBadge.classList.add('badge-accent');
        }
    } else {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Pausado (Pronto)</span>';
        if (footerText) footerText.textContent = simTime === 0 ? 'Simulação Pronta' : 'Pausada (Em Espera)';
        if (footerBadge) {
            footerBadge.classList.add('idle');
            footerBadge.classList.remove('badge-accent');
        }
    }
}

function updateReadouts() {
    const energiaTotal = calcularEnergiaCinetica(particles);
    const temperatura = calcularTemperatura(particles);
    const vrms = calcularVrms(particles);

    const valK = document.getElementById('plot-val-k');
    if (valK) valK.textContent = `${energiaTotal.toFixed(2)} J`;

    const valT = document.getElementById('plot-val-t');
    if (valT) valT.textContent = temperatura.toFixed(3);

    const telVrms = document.getElementById('telemetry-vrms');
    const telStatus = document.getElementById('telemetry-thermostat-status');
    const telWaves = document.getElementById('telemetry-waves-alive');

    if (telVrms) telVrms.textContent = `${vrms.toFixed(2)} px/f`;
    if (telWaves) telWaves.textContent = `${waveCount}`;
    if (telStatus) {
        telStatus.classList.remove('tone-emerald', 'tone-cyan', 'tone-accent');
        if (particles.length === 0) {
            telStatus.textContent = 'Inativo';
            telStatus.style.color = 'var(--text-muted)';
        } else if (!thermostatEnabled) {
            telStatus.textContent = 'Desligado (NVE)';
            telStatus.style.color = 'var(--text-muted)';
        } else {
            telStatus.style.color = '';
            const diff = temperatura - TEMP_LIMIT;
            const eqTol = Math.max(0.03 * TEMP_LIMIT, 0.002);
            if (temperatura <= 1e-12) {
                telStatus.textContent = 'Em Repouso';
                telStatus.style.color = 'var(--text-muted)';
            } else if (Math.abs(diff) <= eqTol) {
                telStatus.textContent = 'Equilíbrio';
                telStatus.classList.add('tone-emerald');
            } else if (diff > 0) {
                telStatus.textContent = 'Resfriando';
                telStatus.classList.add('tone-cyan');
            } else {
                telStatus.textContent = 'Aquecendo';
                telStatus.classList.add('tone-accent');
            }
        }
    }

    const footerTimer = document.getElementById('footer-sim-timer');
    if (footerTimer) footerTimer.textContent = `t = ${simTime.toFixed(2)}s`;
}

function syncGPUInstances() {
    if (!wavesGeo || !particlesGeo) return;

    // 1. Atualiza o escalar global S(t) e só reenvia o buffer de ondas à GPU se houve nascimento/expiração
    if (wavesMaterial) {
        wavesMaterial.uniforms.uCumulativePath.value = cumulativeWavePath;
    }
    wavesGeo.instanceCount = waveCount;
    if (gpuWavesDirty && waveCount > 0) {
        markBufferRangeUpdated(wavesAttr, waveCount * 4);
        gpuWavesDirty = false;
    } else if (waveCount === 0) {
        gpuWavesDirty = false;
    }

    // 2. Atualiza partículas na GPU
    const pLen = particles.length;
    particlesGeo.instanceCount = pLen;
    if (pLen > 0) {
        for (let i = 0; i < pLen; i++) {
            const p = particles[i];
            const p4 = i * 4;
            const p3 = i * 3;
            particlePosRadius[p4] = p.x;
            particlePosRadius[p4 + 1] = p.y;
            particlePosRadius[p4 + 2] = p.radius;
            particlePosRadius[p4 + 3] = 0.0;

            particleColors[p3] = p.rgb[0];
            particleColors[p3 + 1] = p.rgb[1];
            particleColors[p3 + 2] = p.rgb[2];
        }
        markBufferRangeUpdated(particlesPosAttr, pLen * 4);
        markBufferRangeUpdated(particlesColAttr, pLen * 3);
    }

    // 3. Atualiza anel de impulso radial do cursor (se ativo)
    if (cursorGroup) {
        if (activePointerWorld && cursorMode !== 'pan') {
            cursorGroup.visible = true;
            cursorGroup.position.set(activePointerWorld.x, activePointerWorld.y, 0);
            const hex = cursorMode === 'attract' ? '#38bdf8' : '#facc15';
            cursorRingMat.color.set(hex);
            cursorDotMat.color.set(hex);
        } else {
            cursorGroup.visible = false;
        }
    }
}

function renderSceneNow() {
    if (!renderer || !scene || !camera) return;
    syncGPUInstances();
    renderer.render(scene, camera);
    needsRender = false;
}

function updateVisualScene() {
    updateReadouts();
    renderSceneNow();
}

// Configurações físicas calibradas por preset (aplicadas ao selecionar um preset)
const presetConfigs = {
    singleStatic: { potential: 'coulomb',      interaction: true, epsilon: 0.10, thermostat: true,  temp: 0.10,  gamma: 0.20, c: 2.0,  waveInterval: 3 },
    singleMoving: { potential: 'coulomb',      interaction: true, epsilon: 0.10, thermostat: false, temp: 0.10,  gamma: 0.20, c: 2.0,  waveInterval: 3 },
    double:       { potential: 'coulomb',      interaction: true, epsilon: 1.00, thermostat: true,  temp: 0.02,  gamma: 0.50, c: 8.0,  waveInterval: 1 },
    doubleMoving: { potential: 'atracao',      interaction: true, epsilon: 0.10, thermostat: true,  temp: 0.20,  gamma: 0.40, c: 2.0,  waveInterval: 3 },
    many:         { potential: 'coulomb',      interaction: true, epsilon: 1.00, thermostat: true,  temp: 0.02,  gamma: 0.50, c: 8.0,  waveInterval: 1 },
    figure8:      { potential: 'atracao',      interaction: true, epsilon: 0.10, thermostat: true,  temp: 4.20,  gamma: 0.02, c: 10.0, waveInterval: 1 },
    circular:     { potential: 'lennardJones', interaction: true, epsilon: 0.10, thermostat: true,  temp: 0.001, gamma: 0.20, c: 10.0, waveInterval: 1 },
    grid:         { potential: 'lennardJones', interaction: true, epsilon: 0.10, thermostat: true,  temp: 0.40,  gamma: 0.20, c: 10.0, waveInterval: 1 },
    NaCl:         { potential: 'coulomb',      interaction: true, epsilon: 1.00, thermostat: true,  temp: 0.05,  gamma: 0.40, c: 9.0,  waveInterval: 1 },
};

function applyPresetConfig(templateName) {
    const cfg = presetConfigs[templateName];
    if (!cfg) return;

    tipoDeInteracao = cfg.potential;
    interactionEnabled = cfg.interaction;
    epsilonCoulomb = cfg.epsilon;
    thermostatEnabled = cfg.thermostat;
    TEMP_LIMIT = cfg.temp;
    attenuation = cfg.gamma;
    c = cfg.c;
    waveInterval = cfg.waveInterval;

    const selectPotencial = document.getElementById('selector-de-tipo-de-interacao');
    if (selectPotencial) selectPotencial.value = tipoDeInteracao;

    const switchInteracao = document.getElementById('switch-interacao');
    if (switchInteracao) switchInteracao.checked = interactionEnabled;

    const switchTermostato = document.getElementById('switch-termostato');
    if (switchTermostato) switchTermostato.checked = thermostatEnabled;

    if (epsilonSliderCtrl) epsilonSliderCtrl.setValue(epsilonCoulomb, false);
    if (tempSliderCtrl) tempSliderCtrl.setValue(TEMP_LIMIT, false);
    if (attenuationSliderCtrl) attenuationSliderCtrl.setValue(attenuation, false);
    if (waveSpeedSliderCtrl) waveSpeedSliderCtrl.setValue(c, false);
    if (waveIntervalSliderCtrl) waveIntervalSliderCtrl.setValue(waveInterval, false);

    syncContextualControlsVisibility();
}

function reiniciarSistema(novoTemplate = 'none') {
    waveCount = 0;
    cumulativeWavePath = 0.0;
    gpuWavesDirty = true;
    physicsAccumulator = 0.0;
    lastAnimTimestamp = 0;
    particles = [];
    Particle.nextId = 0;
    template = novoTemplate;
    simTime = 0.0;

    if (template !== 'none') {
        particles = createParticles(template);
    }

    const footerTimer = document.getElementById('footer-sim-timer');
    if (footerTimer) footerTimer.textContent = 't = 0.00s';

    if (plotEnergia) plotEnergia.clear();
    if (plotTemp) plotTemp.clear();

    updateStatusBadges();
    updateVisualScene();
}

function syncContextualControlsVisibility() {
    const groupPotential = document.getElementById('group-potential-select');
    const groupEpsilon = document.getElementById('group-epsilon');
    const groupTempTarget = document.getElementById('group-temp-target');
    const groupAttenuation = document.getElementById('group-attenuation');

    if (groupPotential) {
        groupPotential.hidden = !interactionEnabled;
    }
    if (groupEpsilon) {
        groupEpsilon.hidden = !interactionEnabled || tipoDeInteracao !== 'coulomb';
    }
    if (groupTempTarget) {
        groupTempTarget.hidden = !thermostatEnabled;
    }
    if (groupAttenuation) {
        groupAttenuation.hidden = !thermostatEnabled;
    }

    if (focusToolbarCtrl && typeof focusToolbarCtrl.rebuild === 'function') {
        focusToolbarCtrl.rebuild();
    }
}

function updateContainerCursorClass(isPanningNow = false) {
    if (!container) return;
    container.classList.toggle('is-pan-mode', cursorMode === 'pan');
    container.classList.toggle('is-panning', isPanningNow);
}

// =============================================================================
// 8. INTERAÇÃO COM O PALCO 2D (PAN, ZOOM VIA RODA/PINÇA E IMPULSO RADIAL)
// =============================================================================
function aplicarImpulsoMundo(wx, wy) {
    activePointerWorld = { x: wx, y: wy };
    const sign = cursorMode === 'attract' ? -1 : 1;

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dxAng = p.x - wx;
        const dyAng = p.y - wy;
        const distAng = Math.sqrt(dxAng * dxAng + dyAng * dyAng);
        if (distAng < CURSOR_RADIUS_ANG && distAng > 0.2) {
            const force = ((CURSOR_RADIUS_ANG - distAng) / CURSOR_RADIUS_ANG) * 0.8 * sign;
            p.velocityX += (dxAng / distAng) * force;
            p.velocityY += (dyAng / distAng) * force;
        }
    }

    updateVisualScene();
}

function setupStagePointerInteractions() {
    if (!container) return;

    const activePointers = new Map();
    let interactionType = null; // 'pan' | 'impulse' | 'pinch'
    let lastPanClient = null;
    let lastPinchDist = 0;
    let lastPinchCenter = null;

    container.addEventListener('contextmenu', (e) => e.preventDefault());

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = Math.exp(-e.deltaY * 0.0014);
        zoomAtClientPoint(view.scale * zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    container.addEventListener('pointerdown', (e) => {
        container.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
            // Dois dedos no mobile/trackpad: Pinça de Zoom + Pan simultâneo
            interactionType = 'pinch';
            activePointerWorld = null;
            const pts = Array.from(activePointers.values());
            lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            lastPinchCenter = {
                x: (pts[0].x + pts[1].x) * 0.5,
                y: (pts[0].y + pts[1].y) * 0.5
            };
            updateContainerCursorClass(true);
            renderSceneNow();
            return;
        }

        if (activePointers.size === 1) {
            const shouldPan = cursorMode === 'pan' || e.button === 1 || e.button === 2 || e.shiftKey;
            if (shouldPan) {
                interactionType = 'pan';
                lastPanClient = { x: e.clientX, y: e.clientY };
                activePointerWorld = null;
                updateContainerCursorClass(true);
            } else {
                interactionType = 'impulse';
                const worldPt = clientToWorld(e.clientX, e.clientY);
                aplicarImpulsoMundo(worldPt.x, worldPt.y);
            }
        }
    });

    container.addEventListener('pointermove', (e) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (interactionType === 'pinch' && activePointers.size >= 2) {
            const pts = Array.from(activePointers.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const center = {
                x: (pts[0].x + pts[1].x) * 0.5,
                y: (pts[0].y + pts[1].y) * 0.5
            };

            if (lastPinchCenter) {
                view.x -= (center.x - lastPinchCenter.x) / view.scale;
                view.y += (center.y - lastPinchCenter.y) / view.scale;
            }

            if (lastPinchDist > 4 && dist > 4) {
                const factor = dist / lastPinchDist;
                zoomAtClientPoint(view.scale * factor, center.x, center.y);
            } else {
                updateCameraProjection();
                renderSceneNow();
            }

            lastPinchDist = dist;
            lastPinchCenter = center;
            return;
        }

        if (interactionType === 'pan' && lastPanClient) {
            const dxPx = e.clientX - lastPanClient.x;
            const dyPx = e.clientY - lastPanClient.y;
            lastPanClient = { x: e.clientX, y: e.clientY };

            view.x -= dxPx / view.scale;
            view.y += dyPx / view.scale;
            updateCameraProjection();
            renderSceneNow();
            return;
        }

        if (interactionType === 'impulse') {
            const worldPt = clientToWorld(e.clientX, e.clientY);
            aplicarImpulsoMundo(worldPt.x, worldPt.y);
        }
    });

    const handlePointerEnd = (e) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.delete(e.pointerId);

        if (activePointers.size === 1) {
            const remaining = Array.from(activePointers.values())[0];
            interactionType = 'pan';
            lastPanClient = { x: remaining.x, y: remaining.y };
            activePointerWorld = null;
            updateContainerCursorClass(true);
            renderSceneNow();
        } else if (activePointers.size === 0) {
            interactionType = null;
            lastPanClient = null;
            lastPinchCenter = null;
            activePointerWorld = null;
            updateContainerCursorClass(false);
            renderSceneNow();
        }
    };

    container.addEventListener('pointerup', handlePointerEnd);
    container.addEventListener('pointercancel', handlePointerEnd);
}

// =============================================================================
// 9. SETUP DE CONTROLADORES & EVENTOS (DESIGN SYSTEM 2.0)
// =============================================================================
function setupEventListeners() {
    // --- MODO FOCO (DESKTOP) ---
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => {
            resizeStage();
            if (plotEnergia) plotEnergia.resize();
            if (plotTemp) plotTemp.resize();
            updateVisualScene();
        }
    });

    // --- PAINEL FLUTUANTE MOBILE (<= 900PX) ---
    initBottomSheet({
        panelSelector: '.controls-panel',
        triggerSelector: '#btn-mobile-settings',
        defaultState: 'peek'
    });

    // --- NAVEGAÇÃO ENTRE ABAS ---
    initTabs('.controls-panel', (tabId) => {
        if (tabId === 'panel-tab-telemetry') {
            setTimeout(() => {
                if (plotEnergia) plotEnergia.resize();
                if (plotTemp) plotTemp.resize();
            }, 50);
        }
    });

    // --- BARRA DE CONTEXTO EM MODO FOCO ---
    focusToolbarCtrl = initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // --- MODAL DE INSTRUÇÕES INICIAIS / GUIA RÁPIDO ---
    initOnboardingModal('#modal-onboarding', {
        triggerSelector: '#btn-open-onboarding'
    });

    // --- BOTÃO DE ENQUADRAR CAIXA 2D (#btn-reset-camera) ---
    const btnResetCamera = document.getElementById('btn-reset-camera');
    if (btnResetCamera) {
        btnResetCamera.addEventListener('click', () => {
            fitCameraToBox(true);
            updateVisualScene();
        });
    }

    // --- BARRA FLUTUANTE DE TRANSPORTE (#canvas-transport-toolbar) ---
    playControl = initToggleButton('#btn-play-sim', (active) => {
        if (particles.length === 0 && active) {
            const defaultBtn = document.getElementById('preset-single-static');
            if (defaultBtn) {
                document.querySelectorAll('.control-grid-2x2 .btn-preset').forEach(b => b.classList.remove('active'));
                defaultBtn.classList.add('active');
            }
            applyPresetConfig('singleStatic');
            reiniciarSistema('singleStatic');
        }

        isRunning = active;
        lastAnimTimestamp = 0;
        physicsAccumulator = 0.0;
        updateStatusBadges();
        if (isRunning) needsRender = true;
    });

    // Botão Passo Temporal (Δt fixo de 1/30 s)
    const btnStep = document.getElementById('btn-step-sim');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (particles.length === 0) {
                applyPresetConfig('singleStatic');
                reiniciarSistema('singleStatic');
                const defaultBtn = document.getElementById('preset-single-static');
                if (defaultBtn) defaultBtn.classList.add('active');
            }
            if (isRunning && playControl) {
                playControl.setState(0, true);
            }
            isRunning = false;
            lastAnimTimestamp = 0;
            physicsAccumulator = 0.0;
            simTime += FIXED_DT;
            stepPhysics();

            const energiaTotal = calcularEnergiaCinetica(particles);
            const temperatura = calcularTemperatura(particles);

            if (plotEnergia) plotEnergia.push(energiaTotal, simTime);
            if (plotTemp) plotTemp.push(temperatura, simTime);

            updateStatusBadges();
            updateVisualScene();
        });
    }

    // Botão de Reset na Barra Flutuante
    const btnReset = document.getElementById('btn-reset-sim');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (isRunning && playControl) {
                playControl.setState(0, true);
            }
            isRunning = false;
            reiniciarSistema(template && template !== 'none' ? template : 'none');
        });
    }

    // --- PRESETS DE CONFIGURAÇÃO DE PARTÍCULAS ---
    const presetBtns = document.querySelectorAll('.control-grid-2x2 .btn-preset');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tmpl = btn.dataset.template;
            if (tmpl) {
                applyPresetConfig(tmpl);
                reiniciarSistema(tmpl);
            }
        });
    });

    // --- SELETOR DE AÇÃO NO PALCO (MOVER CÂMERA / REPULSÃO / ATRAÇÃO) ---
    const cursorModeBtns = document.querySelectorAll('#cursor-mode-selector .segment-btn');
    cursorModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            cursorModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            cursorMode = btn.dataset.cursorMode || 'repel';
            updateContainerCursorClass(false);
            updateVisualScene();
        });
    });

    // --- SWITCH DE INTERAÇÃO & TIPO DE POTENCIAL ---
    const switchInteracao = document.getElementById('switch-interacao');
    if (switchInteracao) {
        switchInteracao.addEventListener('change', (e) => {
            interactionEnabled = e.target.checked;
            syncContextualControlsVisibility();
            updateVisualScene();
        });
    }

    const selectPotencial = document.getElementById('selector-de-tipo-de-interacao');
    if (selectPotencial) {
        selectPotencial.addEventListener('change', (e) => {
            tipoDeInteracao = e.target.value;
            syncContextualControlsVisibility();
            updateVisualScene();
        });
    }

    const switchTermostato = document.getElementById('switch-termostato');
    if (switchTermostato) {
        switchTermostato.addEventListener('change', (e) => {
            thermostatEnabled = e.target.checked;
            syncContextualControlsVisibility();
            updateVisualScene();
        });
    }

    syncContextualControlsVisibility();

    // --- SLIDERS FÍSICOS SINCRONIZADOS (DUAL-INPUT) ---
    tempSliderCtrl = syncDualSlider('#slider-temp', '#num-temp', (val) => {
        TEMP_LIMIT = val;
        updateVisualScene();
    });

    waveSpeedSliderCtrl = syncDualSlider('#slider-wave-speed', '#num-wave-speed', (val) => {
        c = val;
        updateVisualScene();
    });

    waveIntervalSliderCtrl = syncDualSlider('#slider-wave-interval', '#num-wave-interval', (val) => {
        waveInterval = Math.max(1, Math.round(val));
        updateVisualScene();
    });

    attenuationSliderCtrl = syncDualSlider('#slider-attenuation', '#num-attenuation', (val) => {
        attenuation = val;
        updateVisualScene();
    });

    epsilonSliderCtrl = syncDualSlider('#slider-epsilon', '#num-epsilon', (val) => {
        epsilonCoulomb = val;
        updateVisualScene();
    });

    // --- MODAL DE TEORIA ---
    const theoryModal = initModal('#modal-theory-particulas');
    const btnOpenTheory = document.getElementById('btn-abrir-modal-teoria');
    if (btnOpenTheory && theoryModal) {
        btnOpenTheory.addEventListener('click', () => {
            theoryModal.open();
        });
    }

    setupStagePointerInteractions();
}

// =============================================================================
// 10. LOOP DE ANIMAÇÃO PRINCIPAL (RELÓGIO FÍSICO FIXO 30 Hz + CÂMERA 60+ FPS)
// =============================================================================
function anima(timestamp = 0) {
    requestAnimationFrame(anima);
    if (!renderer) return;

    if (document.hidden) {
        lastAnimTimestamp = 0;
        physicsAccumulator = 0.0;
        return;
    }

    // REGRA DE OURO: Integração temporal e plotagem executam estritamente quando rodando,
    // travadas no relógio físico fixo (30 Hz) para manter a frequência de emissão constante.
    if (isRunning) {
        if (lastAnimTimestamp === 0) {
            lastAnimTimestamp = timestamp;
        }
        const frameDt = Math.min(Math.max((timestamp - lastAnimTimestamp) / 1000, 0), MAX_FRAME_DELTA_SEC);
        lastAnimTimestamp = timestamp;
        physicsAccumulator += frameDt;

        let steps = 0;
        while (physicsAccumulator >= FIXED_DT && steps < MAX_SUBSTEPS_PER_FRAME) {
            simTime += FIXED_DT;
            stepPhysics();
            physicsAccumulator -= FIXED_DT;
            steps++;
        }

        // Evita acúmulo infinito caso o hardware fique temporariamente abaixo de 15 Hz
        if (physicsAccumulator > FIXED_DT * MAX_SUBSTEPS_PER_FRAME) {
            physicsAccumulator = 0.0;
        }

        if (steps > 0) {
            const energiaTotal = calcularEnergiaCinetica(particles);
            const temperatura = calcularTemperatura(particles);

            if (plotEnergia) plotEnergia.push(energiaTotal, simTime);
            if (plotTemp) plotTemp.push(temperatura, simTime);

            updateVisualScene();
        } else if (needsRender) {
            // Pan/Zoom entre passos físicos continuam renderizando em 60+ FPS
            renderSceneNow();
        }
    } else {
        lastAnimTimestamp = 0;
        physicsAccumulator = 0.0;
        if (needsRender) {
            renderSceneNow();
        }
    }
}

// =============================================================================
// 11. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    initThreeStage();

    const resizeObs = new ResizeObserver(() => {
        resizeStage();
        renderSceneNow();
    });
    if (container) resizeObs.observe(container);

    window.addEventListener('resize', () => {
        resizeStage();
        renderSceneNow();
    });

    setupEventListeners();
    reiniciarSistema('none');

    // Inicializa os Mini-Gráficos de Telemetria com Escala Dinâmica Automática
    const themeColors = getThemeColors();
    const canvasPlotK = document.getElementById('canvas-plot-k');
    if (canvasPlotK) {
        plotEnergia = new RealtimePlot(canvasPlotK, {
            maxPoints: 80,
            minVal: 0.0,
            maxVal: 20.0,
            autoScale: true,
            minSpan: 1.0,
            maxLabelSelector: '#axis-k-max',
            minLabelSelector: '#axis-k-min',
            color: themeColors.emerald
        });
    }

    const canvasPlotT = document.getElementById('canvas-plot-t');
    if (canvasPlotT) {
        plotTemp = new RealtimePlot(canvasPlotT, {
            maxPoints: 80,
            minVal: 0.0,
            maxVal: 2.0,
            autoScale: true,
            minSpan: 0.2,
            maxLabelSelector: '#axis-t-max',
            minLabelSelector: '#axis-t-min'
        });
    }

    onThemeChange(() => {
        if (plotEnergia) {
            const cTheme = getThemeColors().emerald;
            plotEnergia.explicitColor = cTheme;
            plotEnergia.color = cTheme;
            plotEnergia.render();
        }
    });

    updateVisualScene();
    requestAnimationFrame(anima);
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
});
