// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini & Antigravity
// Simulação: Forças Centrais & Leis de Kepler 2D (Design System 2.0)
// Descrição: Laboratório 2D no plano orbital invariante com integrador simplético
//            Yoshida de 4ª ordem, 4 famílias de forças centrais (Potência n /
//            Teorema de Bertrand, Schwarzschild, Rutherford e Yukawa), varredura
//            interativa de setores da 2ª Lei de Kepler com gráfico Tempo × Área,
//            geometria da 1ª Lei, medidor da 3ª Lei, manipulação direta de r₀ e v₀,
//            conservação de energia (K, U, E) e espaço de fase radial (r, p_r).
// =============================================================================

import {
    initSidebarCollapse,
    initBottomSheet,
    initToggleButton,
    initTabs,
    initFocusMirrorToolbar,
    initOnboardingModal,
    syncDualSlider,
    setFieldState,
    MultiSeriesPlot,
    renderMath,
    setElementIcon,
    initKaTeXAutoRender,
    inlineSVGImages
} from './sim-ui.js';

// =============================================================================
// 1. CONSTANTES FÍSICAS (UNIDADES ASTRONÔMICAS: UA, ano, M☉)
// =============================================================================
const FOUR_PI_SQ = 4 * Math.PI * Math.PI; // GM☉ = 4π² UA³/ano² => T²/a³ = 1/M
const YEARS_PER_REAL_SEC = 0.18;          // 1 ano ≈ 5.55 s em 1.0×
const R_COLLISION = 0.055;                // Raio de colisão com o corpo central (UA)
const R_ESCAPE_LIMIT = 45.0;              // Limite de segurança para escape aberto (UA)
const VEL_ARROW_SCALE = 0.085;            // Comprimento visual do vetor v (UA por UA/ano)
const FORCE_ARROW_SCALE = 0.0085;         // Escala base do vetor força F
const MAX_SECTORS = 6;
const MAX_THIRD_LAW_RECORDS = 5;

// Coeficientes do Integrador Simplético Yoshida de 4ª Ordem
const CBRT_2 = Math.cbrt(2);
const Y_W1 = 1 / (2 - CBRT_2);
const Y_W0 = -CBRT_2 / (2 - CBRT_2);
const Y_C = [Y_W1 / 2, (Y_W0 + Y_W1) / 2, (Y_W0 + Y_W1) / 2, Y_W1 / 2];
const Y_D = [Y_W1, Y_W0, Y_W1];

// =============================================================================
// 2. PALETA SEMÂNTICA DERIVADA DOS TOKENS DO DESIGN SYSTEM 2.0
// =============================================================================
function readThemeTokens() {
    const style = getComputedStyle(document.documentElement);
    const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
        accent: get('--stage-accent', '#facc15'),
        cyan: get('--stage-cyan', '#38bdf8'),
        emerald: get('--stage-emerald', '#22c55e'),
        purple: get('--stage-purple', '#a855f7'),
        rose: get('--stage-rose', '#f43f5e'),
        orange: get('--stage-orange', '#fb923c'),
        pink: get('--stage-pink', '#f472b6'),
        textPrimary: get('--stage-text', '#f8fafc'),
        textSecondary: get('--stage-text-muted', '#94a3b8')
    };
}

let theme = readThemeTokens();

function getSectorPalette() {
    return [
        theme.cyan,
        theme.emerald,
        theme.purple,
        theme.orange,
        theme.rose,
        theme.accent
    ];
}

// =============================================================================
// 3. ESTADO GLOBAL DA SIMULAÇÃO
// =============================================================================
const state = {
    isRunning: false,
    speed: 1.0,
    time: 0.0,
    collided: false,
    escaped: false,

    // Modelo de Força Central & Sistema de Dois Corpos
    forceLaw: 'power',      // 'power' | 'schwarzschild' | 'repulsive' | 'yukawa'
    centralMass: 1.00,      // m₁ (M☉ ou carga/constante central)
    secondaryMass: 0.00,    // m₂ (M☉; 0 = limite partícula-teste)
    exponentN: 2.00,        // n em F(r) = -μ / r^n
    grAlpha: 1.2,           // Intensidade relativística (Schwarzschild)
    yukawaLambda: 2.20,     // Alcance de blindagem λ (UA)

    // Progressão de Referenciais ('m1' | 'm2' | 'cm') e Modo de Câmera ('fit' | 'follow-m1' | 'follow-m2')
    frame: 'm1',
    cameraMode: 'fit',

    // Condições Iniciais (plano 2D)
    r0: 1.60,               // Distância inicial (UA)
    theta0: 0.0,            // Ângulo polar inicial (rad)
    v0: Math.PI,            // Velocidade inicial (UA/ano) -> e = 0.60, a = 1.00 UA
    gammaDeg: 0.0,          // Ângulo de lançamento em relação à tangente (°)
    orbitSign: 1,           // +1 anti-horário, -1 horário

    // Camadas Visuais
    showVelocity: true,
    showForce: true,
    showPosition: true,
    showPreview: true,
    showTrail: true,
    longTrail: false,
    showGrid: true,
    showKeplerGeometry: true,
    showLrlVector: false,

    // 2ª Lei: Setores de Área
    sectorDt: 0.12,         // Intervalo de varredura Δt (anos)
    autoSectors: false,
    totalArea: 0.0,         // Área acumulada desde t = 0 (UA²)
    sectors: [],            // Setores finalizados + ativo
    activeSector: null,
    sectorCounter: 0,

    // 3ª Lei: Medição de Período e Tabela Experimental
    unwrappedAngle: 0.0,
    lapCount: 0,
    lastLapTime: 0.0,
    measuredPeriod: null,
    rMinObserved: Infinity,
    rMaxObserved: 0,
    thirdLawRecords: [],

    // Modos de Gráficos
    areaPlotMode: 'accumulated',   // 'accumulated' | 'rate-vs-speed'
    energyPlotMode: 'time-series', // 'time-series' | 'phase-space'

    // Preset ativo e dica interativa
    preset: 'eliptica',
    hintDismissed: false
};

// Estado dinâmico da partícula (massa unitária m = 1 para grandezas específicas)
const body = {
    x: 1.60,
    y: 0.0,
    vx: 0.0,
    vy: Math.PI,
    ax: 0.0,
    ay: 0.0,
    hConst: 1.60 * Math.PI // Momento angular específico h = x*vy - y*vx (conservado!)
};

// Rastro, pré-visualização e histórico de telemetria
const trail = [];
let previewPoints = [];
const telemetryHistory = [];
const MAX_TELEMETRY_HISTORY = 240;

// Câmera 2D (Pan & Zoom)
const view = {
    scale: 155,       // pixels por UA
    offsetX: 0.30,    // deslocamento do mundo em UA (centraliza elipse inicial)
    offsetY: 0.0,
    minScale: 24,
    maxScale: 620,
    isManuallyPanned: false
};

// Estado de interação com ponteiros (arraste de v0, r0, pan e pinça mobile)
const pointer = {
    mode: null,       // null | 'drag-vel' | 'drag-planet' | 'pan' | 'pinch'
    activeId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointers: new Map(),
    pinchStartDist: 0,
    pinchStartScale: 155
};

// Controladores de UI
let playControl = null;
let focusMirror = null;
let areaPlot = null;
let energyPlot = null;
const sliderCtrls = {};

function syncRunningUI(active) {
    state.isRunning = Boolean(active);
    const label = state.isRunning ? 'Em Propagação' : 'Pausado';
    const footerTxt = document.getElementById('footer-status-text');
    const headerTxt = document.getElementById('header-status-text');
    const headerBadge = document.getElementById('header-status-badge');
    const footerBadge = document.getElementById('footer-status-badge');
    if (footerTxt) footerTxt.textContent = label;
    if (headerTxt) headerTxt.textContent = label;
    if (headerBadge) headerBadge.classList.toggle('idle', !state.isRunning);
    if (footerBadge) footerBadge.classList.toggle('idle', !state.isRunning);
}

function setRunning(active) {
    const next = Boolean(active);
    syncRunningUI(next);
    if (playControl && playControl.isActive() !== next) {
        playControl.setState(next ? 1 : 0);
    }
}

// =============================================================================
// 4. MODELOS DE FORÇA CENTRAL, DOIS CORPOS & PROJEÇÃO DE REFERENCIAIS
// =============================================================================
function getMassFractions() {
    const m1 = Math.max(0.05, state.centralMass);
    const m2 = Math.max(0.0, state.secondaryMass);
    const total = m1 + m2;
    return {
        m1,
        m2,
        total,
        eta1: m2 / total,
        eta2: m1 / total,
        reduced: (m1 * m2) / total
    };
}

function isGravitationalLaw() {
    return (state.forceLaw === 'power' && Math.abs(state.exponentN - 2.0) < 1e-3)
        || state.forceLaw === 'schwarzschild';
}

function getMu() {
    if (isGravitationalLaw()) {
        // Gravitação de dois corpos exata: a_rel = -G(m₁ + m₂)/r²
        return FOUR_PI_SQ * (state.centralMass + state.secondaryMass);
    }
    return FOUR_PI_SQ * state.centralMass;
}

/**
 * Projeta a coordenada relativa (body.x, body.y, body.vx, body.vy, body.ax, body.ay)
 * para as posições, velocidades e forças de m₁, m₂ e CM no referencial ativo.
 */
function getFrameSnapshot() {
    const { eta1, eta2 } = getMassFractions();
    const rx = body.x, ry = body.y;
    const vx = body.vx, vy = body.vy;
    const ax = body.ax, ay = body.ay;

    if (state.frame === 'm2') {
        return {
            p1: { x: -rx, y: -ry },
            p2: { x: 0, y: 0 },
            cm: { x: -eta2 * rx, y: -eta2 * ry },
            v1: { x: -vx, y: -vy },
            v2: { x: 0, y: 0 },
            a1: { x: -ax, y: -ay },
            a2: { x: 0, y: 0 },
            eta1, eta2
        };
    }
    if (state.frame === 'cm') {
        return {
            p1: { x: -eta1 * rx, y: -eta1 * ry },
            p2: { x: eta2 * rx, y: eta2 * ry },
            cm: { x: 0, y: 0 },
            v1: { x: -eta1 * vx, y: -eta1 * vy },
            v2: { x: eta2 * vx, y: eta2 * vy },
            a1: { x: -eta1 * ax, y: -eta1 * ay },
            a2: { x: eta2 * ax, y: eta2 * ay },
            eta1, eta2
        };
    }
    // Padrão: Estágio 1 ('m1' — corpo central fixo na origem)
    return {
        p1: { x: 0, y: 0 },
        p2: { x: rx, y: ry },
        cm: { x: eta1 * rx, y: eta1 * ry },
        v1: { x: 0, y: 0 },
        v2: { x: vx, y: vy },
        a1: { x: 0, y: 0 },
        a2: { x: ax, y: ay },
        eta1, eta2
    };
}

/**
 * Calcula aceleração radial a_r (sinal negativo = atrativa) e aceleração (ax, ay)
 * a partir de (x, y) e do momento angular específico conservado h.
 */
function computeCentralForce(x, y, hVal) {
    const rSq = x * x + y * y;
    const r = Math.sqrt(rSq);
    if (r < 1e-6) return { ax: 0, ay: 0, ar: 0, r: 1e-6 };

    const mu = getMu();
    let ar = 0;

    if (state.forceLaw === 'power') {
        // Normalizado em R0 = 1 UA: a_r = -μ / r^n
        ar = -mu / Math.pow(r, state.exponentN);
    } else if (state.forceLaw === 'schwarzschild') {
        // Relatividade Geral: a_r = -(μ / r²) * (1 + ε_GR * h² / r²)
        const epsGR = 0.0005 * state.grAlpha;
        const hSq = hVal * hVal;
        ar = -(mu / rSq) * (1 + (epsGR * hSq) / rSq);
    } else if (state.forceLaw === 'repulsive') {
        // Espalhamento repulsivo de Rutherford / Coulomb: a_r = +μ / r²
        ar = mu / rSq;
    } else if (state.forceLaw === 'yukawa') {
        // Potencial de Yukawa: U = -(μ/r) * exp(-r/λ)
        const lam = Math.max(0.1, state.yukawaLambda);
        ar = -(mu / rSq) * (1 + r / lam) * Math.exp(-r / lam);
    }

    return {
        ax: ar * (x / r),
        ay: ar * (y / r),
        ar,
        r
    };
}

/**
 * Energia potencial específica U(r) exata para cada lei de força central.
 */
function computePotentialEnergy(r, hVal) {
    const safeR = Math.max(r, 1e-5);
    const mu = getMu();

    if (state.forceLaw === 'power') {
        const n = state.exponentN;
        if (Math.abs(n - 1) < 1e-4) {
            return mu * Math.log(safeR);
        }
        return -mu / ((n - 1) * Math.pow(safeR, n - 1));
    }
    if (state.forceLaw === 'schwarzschild') {
        const epsGR = 0.0005 * state.grAlpha;
        const hSq = hVal * hVal;
        return -(mu / safeR) - (mu * epsGR * hSq) / (3 * safeR * safeR * safeR);
    }
    if (state.forceLaw === 'repulsive') {
        return mu / safeR;
    }
    if (state.forceLaw === 'yukawa') {
        const lam = Math.max(0.1, state.yukawaLambda);
        return -(mu / safeR) * Math.exp(-safeR / lam);
    }
    return -(mu / safeR);
}

/**
 * Calcula invariantes instantâneos e geometria kepleriana (vetor de Laplace-Runge-Lenz).
 */
function computeOrbitMetrics() {
    const r = Math.hypot(body.x, body.y);
    const vSq = body.vx * body.vx + body.vy * body.vy;
    const v = Math.sqrt(vSq);
    const h = body.x * body.vy - body.y * body.vx; // Momento angular específico L_z/m
    const hAbs = Math.abs(h);
    const pr = r > 1e-6 ? (body.x * body.vx + body.y * body.vy) / r : 0; // Momento radial específico

    const K = 0.5 * vSq;
    const U = computePotentialEnergy(r, body.hConst);
    const E = K + U;
    const arealRate = 0.5 * hAbs; // dA/dt = |L| / (2m)

    const mu = getMu();
    const isNewton = state.forceLaw === 'power' && Math.abs(state.exponentN - 2.0) < 1e-3;
    const isHooke = state.forceLaw === 'power' && Math.abs(state.exponentN + 1.0) < 1e-3;

    // Vetor de Laplace-Runge-Lenz adimensional (vetor excentricidade e⃗):
    // e⃗ = (v⃗ × h⃗) / μ - r̂ = (vy*h/μ - x/r, -vx*h/μ - y/r)
    const ex = (body.vy * h) / mu - (r > 1e-6 ? body.x / r : 0);
    const ey = (-body.vx * h) / mu - (r > 1e-6 ? body.y / r : 0);
    const eccLrl = Math.hypot(ex, ey);
    const omegaPeri = Math.atan2(ey, ex);

    let semiMajor = null;
    let semiMinor = null;
    let keplerPeriod = null;
    let thirdLawRatio = null;
    let conicType = 'Roseta / Não-Kepleriana';
    let conicAnalytical = null;

    if (isNewton) {
        if (E < -1e-5) {
            semiMajor = -mu / (2 * E);
            semiMinor = semiMajor * Math.sqrt(Math.max(0, 1 - eccLrl * eccLrl));
            keplerPeriod = 2 * Math.PI * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu);
            thirdLawRatio = (keplerPeriod * keplerPeriod) / (semiMajor * semiMajor * semiMajor);
            conicType = eccLrl < 0.015 ? 'Circular' : 'Elíptica';

            // Geometria da 1ª Lei: F1 = (0,0), F2 = -2*a*e⃗, C = -a*e⃗
            const cDist = semiMajor * eccLrl;
            const uPeriX = eccLrl > 1e-5 ? ex / eccLrl : 1;
            const uPeriY = eccLrl > 1e-5 ? ey / eccLrl : 0;
            conicAnalytical = {
                a: semiMajor,
                b: semiMinor,
                e: eccLrl,
                c: cDist,
                centerX: -cDist * uPeriX,
                centerY: -cDist * uPeriY,
                f2X: -2 * cDist * uPeriX,
                f2Y: -2 * cDist * uPeriY,
                periX: (semiMajor - cDist) * uPeriX,
                periY: (semiMajor - cDist) * uPeriY,
                apoX: -(semiMajor + cDist) * uPeriX,
                apoY: -(semiMajor + cDist) * uPeriY,
                angle: omegaPeri
            };
        } else if (Math.abs(E) <= 1e-3) {
            conicType = 'Parabólica (Escape)';
        } else {
            conicType = 'Hiperbólica (Aberta)';
            semiMajor = -mu / (2 * E); // negativo em hipérboles
        }
    } else if (isHooke) {
        conicType = 'Elipse de Hooke (Centro em O)';
        const omega = Math.sqrt(mu);
        keplerPeriod = (2 * Math.PI) / omega; // Isócrono: T = 1 / sqrt(M)
        if (Number.isFinite(state.rMinObserved) && state.rMaxObserved > 0) {
            semiMajor = state.rMaxObserved;
            semiMinor = state.rMinObserved;
        }
    } else if (state.forceLaw === 'repulsive') {
        conicType = 'Espalhamento Hiperbólico';
    } else if (state.forceLaw === 'schwarzschild') {
        conicType = E < 0 ? 'Precessão Relativística' : 'Trajetória Aberta (GR)';
    } else if (state.forceLaw === 'yukawa') {
        conicType = E < 0 ? 'Roseta (Yukawa)' : 'Escape (Yukawa)';
    } else if (state.forceLaw === 'power') {
        if (state.exponentN >= 3.0) {
            conicType = 'Regime Instável (n ≥ 3)';
        } else {
            conicType = E < 0 || state.exponentN <= 1 ? 'Órbita em Roseta' : 'Trajetória Aberta';
        }
    }

    // Estima semi-eixo médio observado quando não-newtoniano
    if (!semiMajor && Number.isFinite(state.rMinObserved) && state.rMaxObserved > 0 && state.rMaxObserved < R_ESCAPE_LIMIT) {
        semiMajor = 0.5 * (state.rMinObserved + state.rMaxObserved);
    }

    // Razão T² / a³ medida (se houver período medido e semi-eixo positivo)
    if (state.measuredPeriod && semiMajor && semiMajor > 0) {
        thirdLawRatio = (state.measuredPeriod * state.measuredPeriod) / Math.pow(semiMajor, 3);
    }

    return {
        r, v, pr, h, hAbs, K, U, E,
        arealRate,
        ex, ey, eccLrl, omegaPeri,
        semiMajor, semiMinor,
        keplerPeriod, thirdLawRatio,
        conicType, conicAnalytical,
        isNewton, isHooke
    };
}

// =============================================================================
// 5. INTEGRADOR SIMPLÉTICO YOSHIDA DE 4ª ORDEM (STEP PHYSICS)
// =============================================================================
function stepYoshida4(target, dt, hVal) {
    let x = target.x;
    let y = target.y;
    let vx = target.vx;
    let vy = target.vy;

    // 3 estágios de força + 4 drifts (ordem 4, reversível no tempo e simplético)
    x += Y_C[0] * vx * dt;
    y += Y_C[0] * vy * dt;

    let f = computeCentralForce(x, y, hVal);
    vx += Y_D[0] * f.ax * dt;
    vy += Y_D[0] * f.ay * dt;

    x += Y_C[1] * vx * dt;
    y += Y_C[1] * vy * dt;

    f = computeCentralForce(x, y, hVal);
    vx += Y_D[1] * f.ax * dt;
    vy += Y_D[1] * f.ay * dt;

    x += Y_C[2] * vx * dt;
    y += Y_C[2] * vy * dt;

    f = computeCentralForce(x, y, hVal);
    vx += Y_D[2] * f.ax * dt;
    vy += Y_D[2] * f.ay * dt;

    x += Y_C[3] * vx * dt;
    y += Y_C[3] * vy * dt;

    const fEnd = computeCentralForce(x, y, hVal);
    target.x = x;
    target.y = y;
    target.vx = vx;
    target.vy = vy;
    target.ax = fEnd.ax;
    target.ay = fEnd.ay;
}

/**
 * Avança exclusivamente a física em `simDt` anos simulados.
 * Nunca chamado quando `state.isRunning === false` (exceto passo único manual).
 */
function stepPhysics(simDt) {
    if (state.collided || state.escaped) return;

    const rCurrent = Math.hypot(body.x, body.y);
    // Substepping adaptativo para garantir conservação de energia em periélios fechados
    const baseSub = 16;
    const proximityBoost = rCurrent < 0.35 ? Math.ceil(0.35 / Math.max(rCurrent, 0.06)) : 1;
    const subSteps = Math.min(80, baseSub * proximityBoost);
    const subDt = simDt / subSteps;

    for (let s = 0; s < subSteps; s++) {
        const prevX = body.x;
        const prevY = body.y;
        const prevT = state.time;

        stepYoshida4(body, subDt, body.hConst);
        state.time += subDt;

        const r = Math.hypot(body.x, body.y);
        if (r < state.rMinObserved) state.rMinObserved = r;
        if (r > state.rMaxObserved) state.rMaxObserved = r;

        // Área varrida exata no subpasso via produto vetorial: δA = ½ |r_prev × r_curr|
        const dArea = 0.5 * Math.abs(prevX * body.y - prevY * body.x);
        state.totalArea += dArea;

        // Variação angular desenrolada para medição precisa do período orbital T
        const cross = prevX * body.y - prevY * body.x;
        const dot = prevX * body.x + prevY * body.y;
        const dTheta = Math.atan2(cross, dot);
        const prevUnwrapped = state.unwrappedAngle;
        state.unwrappedAngle += dTheta;

        const nextLapTarget = (state.lapCount + 1) * 2 * Math.PI;
        if (Math.abs(state.unwrappedAngle) >= nextLapTarget && Math.abs(dTheta) > 1e-9) {
            const frac = (nextLapTarget - Math.abs(prevUnwrapped)) / Math.abs(dTheta);
            const tCross = prevT + Math.max(0, Math.min(1, frac)) * subDt;
            state.measuredPeriod = tCross - state.lastLapTime;
            state.lastLapTime = tCross;
            state.lapCount += 1;
        }

        // Atualização do gravador de setores da 2ª Lei de Kepler
        updateSectorRecording(prevX, prevY, body.x, body.y, subDt, dArea);

        // Proteções de fronteira física
        if (r < R_COLLISION) {
            state.collided = true;
            pauseSimulationWithNotice('Colisão com o corpo central — reinicie ou aumente v₀.');
            break;
        }
        if (r > R_ESCAPE_LIMIT) {
            state.escaped = true;
            pauseSimulationWithNotice('Partícula escapou além do limite de observação.');
            break;
        }
    }

    // Armazena rastro orbital exclusivamente durante a integração física
    trail.push({ x: body.x, y: body.y });
    const maxTrail = state.longTrail ? 3600 : 750;
    while (trail.length > maxTrail) {
        trail.shift();
    }
}

function pauseSimulationWithNotice(msg) {
    setRunning(false);
    setFieldState('#field-velocidade', 'warning', msg);
}

// =============================================================================
// 6. LABORATÓRIO DA 2ª LEI DE KEPLER (GRAVADOR DE SETORES Δt)
// =============================================================================
function startSectorCapture(autoTriggered = false) {
    if (state.collided || state.escaped) return;
    if (state.activeSector && !autoTriggered) return;

    const palette = getSectorPalette();
    const color = palette[state.sectorCounter % palette.length];
    state.sectorCounter += 1;

    const sector = {
        id: state.sectorCounter,
        label: `S${state.sectorCounter}`,
        color,
        startTime: state.time,
        duration: state.sectorDt,
        elapsed: 0,
        area: 0,
        vertices: [{ x: body.x, y: body.y }],
        completed: false
    };

    state.sectors.push(sector);
    while (state.sectors.length > MAX_SECTORS) {
        state.sectors.shift();
    }
    state.activeSector = sector;

    // Se o usuário clicou manualmente com a simulação pausada, inicia automaticamente
    if (!autoTriggered && !state.isRunning) {
        setRunning(true);
    }

    renderSectorsComparisonList();
    updateCaptureButtonUI();
    updateVisualScene();
}

function updateSectorRecording(prevX, prevY, currX, currY, subDt, fullSubArea) {
    const sec = state.activeSector;
    if (!sec) {
        if (state.autoSectors) {
            startSectorCapture(true);
        }
        return;
    }

    const remaining = sec.duration - sec.elapsed;
    if (subDt < remaining) {
        sec.elapsed += subDt;
        sec.area += fullSubArea;
        // Adiciona vértice com resolução geométrica suave sem estourar memória
        const lastV = sec.vertices[sec.vertices.length - 1];
        if (!lastV || Math.hypot(currX - lastV.x, currY - lastV.y) > 0.015) {
            sec.vertices.push({ x: currX, y: currY });
        }
    } else {
        // Interpolação exata no instante final Δt para precisão sub-passo
        const frac = Math.max(0, Math.min(1, remaining / subDt));
        const endX = prevX + (currX - prevX) * frac;
        const endY = prevY + (currY - prevY) * frac;
        const partialArea = 0.5 * Math.abs(prevX * endY - prevY * endX);

        sec.area += partialArea;
        sec.elapsed = sec.duration;
        sec.vertices.push({ x: endX, y: endY });
        sec.completed = true;
        state.activeSector = null;

        renderSectorsComparisonList();
        updateCaptureButtonUI();

        // No modo automático contínuo, inicia o próximo setor exatamente do ponto final!
        if (state.autoSectors) {
            const leftoverDt = subDt - remaining;
            startSectorCapture(true);
            if (state.activeSector && leftoverDt > 1e-9) {
                const restArea = 0.5 * Math.abs(endX * currY - endY * currX);
                state.activeSector.vertices[0] = { x: endX, y: endY };
                state.activeSector.elapsed = leftoverDt;
                state.activeSector.area = restArea;
                state.activeSector.vertices.push({ x: currX, y: currY });
            }
        }
    }
}

function clearAllSectors() {
    state.sectors = [];
    state.activeSector = null;
    state.sectorCounter = 0;
    renderSectorsComparisonList();
    updateCaptureButtonUI();
    updateVisualScene();
}

function updateCaptureButtonUI() {
    const labelEl = document.getElementById('btn-capture-sector-label');
    const btn = document.getElementById('btn-capture-sector');
    if (!labelEl || !btn) return;

    if (state.activeSector) {
        const pct = Math.min(100, Math.round((state.activeSector.elapsed / state.activeSector.duration) * 100));
        labelEl.textContent = `Varrendo ${state.activeSector.label} (${pct}%)...`;
        btn.disabled = true;
    } else {
        labelEl.textContent = 'Capturar Setor (Δt)';
        btn.disabled = false;
    }
}

function renderSectorsComparisonList() {
    const container = document.getElementById('sectors-list-container');
    if (!container) return;

    if (state.sectors.length === 0) {
        container.innerHTML = `<div class="readout-empty-note">Clique em <strong>Capturar Setor</strong> perto do periélio e novamente perto do afélio para comparar áreas no mesmo Δt.</div>`;
        return;
    }

    const { m2, eta1, eta2 } = getMassFractions();
    const isCmDual = state.frame === 'cm' && m2 > 0.001;
    const completed = state.sectors.filter(s => s.completed);
    let html = '';

    state.sectors.forEach(s => {
        const pctTag = s.completed ? '' : ` (${Math.round((s.elapsed / s.duration) * 100)}%)`;
        let statusTxt;
        if (isCmDual) {
            const a2 = eta2 * eta2 * s.area;
            const a1 = eta1 * eta1 * s.area;
            statusTxt = `A₂=${a2.toFixed(3)} • A₁=${a1.toFixed(3)} UA²${pctTag}`;
        } else {
            statusTxt = `${s.area.toFixed(4)} UA²${pctTag}`;
        }
        html += `
            <div class="sim-readout-row">
                <span class="sim-readout-label sector-row-label">
                    <span class="sector-swatch-dot" style="background:${s.color}; color:${s.color};"></span>
                    <span>${s.label} (Δt = ${s.duration.toFixed(2)}a):</span>
                </span>
                <span class="sim-readout-value">${statusTxt}</span>
            </div>
        `;
    });

    if (completed.length >= 2) {
        const latestDt = completed[completed.length - 1].duration;
        const sameDt = completed.filter(s => Math.abs(s.duration - latestDt) < 1e-4);
        if (sameDt.length >= 2) {
            const areas = sameDt.map(s => s.area);
            const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
            const maxDiff = Math.max(...areas) - Math.min(...areas);
            const relPct = mean > 1e-9 ? (maxDiff / mean) * 100 : 0;
            html += `
                <div class="sim-readout-row">
                    <span class="sim-readout-label">Concordância (mesmo Δt):</span>
                    <span class="sim-readout-value tone-emerald">ΔA = ${relPct.toFixed(2)}% (Iguais!)</span>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

// =============================================================================
// 7. PRÉ-VISUALIZAÇÃO DA TRAJETÓRIA (SHADOW INTEGRATOR)
// =============================================================================
function recomputeTrajectoryPreview() {
    previewPoints = [];
    if (!state.showPreview) return;

    const shadow = {
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        ax: 0,
        ay: 0
    };
    const hShadow = shadow.x * shadow.vy - shadow.y * shadow.vx;
    previewPoints.push({ x: shadow.x, y: shadow.y });

    const steps = 320;
    const baseDt = 0.008;

    for (let i = 0; i < steps; i++) {
        const r = Math.hypot(shadow.x, shadow.y);
        if (r < R_COLLISION || r > R_ESCAPE_LIMIT * 0.45) break;
        // Passo adaptativo leve no preview para cobrir bem periélio e afélio
        const dt = Math.min(0.015, Math.max(0.002, baseDt * Math.pow(r, 0.75)));
        stepYoshida4(shadow, dt, hShadow);
        previewPoints.push({ x: shadow.x, y: shadow.y });
    }
}

// =============================================================================
// 8. CONDIÇÕES INICIAIS, PRESETS E ENQUADRAMENTO
// =============================================================================
function applyInitialConditions({ resetView = false } = {}) {
    state.time = 0.0;
    state.collided = false;
    state.escaped = false;
    state.totalArea = 0.0;
    state.unwrappedAngle = 0.0;
    state.lapCount = 0;
    state.lastLapTime = 0.0;
    state.measuredPeriod = null;

    const cosT = Math.cos(state.theta0);
    const sinT = Math.sin(state.theta0);
    const radX = cosT;
    const radY = sinT;
    const tanX = -sinT * state.orbitSign;
    const tanY = cosT * state.orbitSign;

    const gammaRad = (state.gammaDeg * Math.PI) / 180;
    const cosG = Math.cos(gammaRad);
    const sinG = Math.sin(gammaRad);

    body.x = state.r0 * radX;
    body.y = state.r0 * radY;
    body.vx = state.v0 * (sinG * radX + cosG * tanX);
    body.vy = state.v0 * (sinG * radY + cosG * tanY);
    body.hConst = body.x * body.vy - body.y * body.vx;

    const f = computeCentralForce(body.x, body.y, body.hConst);
    body.ax = f.ax;
    body.ay = f.ay;

    state.rMinObserved = state.r0;
    state.rMaxObserved = state.r0;

    trail.length = 0;
    trail.push({ x: body.x, y: body.y });
    telemetryHistory.length = 0;

    state.sectors = [];
    state.activeSector = null;
    state.sectorCounter = 0;

    if (areaPlot) areaPlot.clear();
    if (energyPlot) energyPlot.clear();

    recomputeTrajectoryPreview();
    if (resetView) fitOrbitToCanvas();

    syncForceHints();
    renderSectorsComparisonList();
    updateCaptureButtonUI();
    updateReadouts();
    updateVisualScene();
}

function applyPreset(presetKey) {
    state.preset = presetKey;
    state.orbitSign = 1;
    state.theta0 = 0;

    const mu = getMu();

    if (presetKey === 'circular') {
        state.forceLaw = 'power';
        state.exponentN = 2.0;
        state.r0 = 1.00;
        state.v0 = Math.sqrt(mu / state.r0); // 2π ≈ 6.28 UA/ano
        state.gammaDeg = 0;
    } else if (presetKey === 'eliptica') {
        state.forceLaw = 'power';
        state.exponentN = 2.0;
        state.r0 = 1.60; // Afélio de elipse com a = 1.00 UA, e = 0.60, T = 1.00 ano!
        state.v0 = Math.sqrt((mu / 1.0) * (0.4 / 1.6)); // π ≈ 3.14 UA/ano
        state.gammaDeg = 0;
    } else if (presetKey === 'cometa') {
        state.forceLaw = 'power';
        state.exponentN = 2.0;
        const e = 0.80;
        state.r0 = 2.40;
        const a = state.r0 / (1 + e);
        state.v0 = Math.sqrt((mu / a) * ((1 - e) / (1 + e)));
        state.gammaDeg = 0;
    } else if (presetKey === 'escape') {
        state.forceLaw = 'power';
        state.exponentN = 2.0;
        state.r0 = 1.50;
        const vEsc = Math.sqrt((2 * mu) / state.r0);
        state.v0 = vEsc * 1.12;
        state.gammaDeg = -32; // Aproximação hiperbólica curva ao redor do Sol
    }

    syncAllControlsFromState();
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });
    updateBertrandButtons();
    applyInitialConditions({ resetView: true });
}

function syncAllControlsFromState() {
    const forceSelect = document.getElementById('select-force-law');
    if (forceSelect) forceSelect.value = state.forceLaw;
    updateForceParamBlocksVisibility();

    sliderCtrls.exponent?.setValue(state.exponentN, false);
    sliderCtrls.gr?.setValue(state.grAlpha, false);
    sliderCtrls.yukawa?.setValue(state.yukawaLambda, false);
    sliderCtrls.mu?.setValue(state.centralMass, false);
    sliderCtrls.m2?.setValue(Number(state.secondaryMass.toFixed(2)), false);
    sliderCtrls.r0?.setValue(state.r0, false);
    sliderCtrls.v0?.setValue(Number(state.v0.toFixed(2)), false);
    sliderCtrls.gamma?.setValue(Math.round(state.gammaDeg), false);
    sliderCtrls.sectorDt?.setValue(state.sectorDt, false);
    updateMassRatioButtons();
}

function updateMassRatioButtons() {
    const ratio = state.centralMass > 0 ? state.secondaryMass / state.centralMass : 0;
    document.querySelectorAll('[data-mass-ratio]').forEach(btn => {
        const target = parseFloat(btn.dataset.massRatio);
        btn.classList.toggle('active', Math.abs(ratio - target) < 0.025);
    });
}

function setFrame(nextFrame, { refit = true } = {}) {
    if (!['m1', 'm2', 'cm'].includes(nextFrame)) return;
    state.frame = nextFrame;

    document.querySelectorAll('[data-frame]').forEach(btn => {
        const active = btn.dataset.frame === state.frame;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    syncForceHints();
    renderSectorsComparisonList();
    updateReadouts();
    // Preserva totalmente o estado da câmera (Seguir m₁ / Seguir m₂ permanece ativo ao trocar de etapa!)
    if (refit && state.cameraMode === 'fit') {
        fitOrbitToCanvas();
    } else {
        updateVisualScene();
    }
}

function updateForceParamBlocksVisibility() {
    const toggleBlock = (id, show) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = !show;
        el.classList.toggle('hidden', !show);
    };
    toggleBlock('param-block-power', state.forceLaw === 'power');
    toggleBlock('param-block-schwarzschild', state.forceLaw === 'schwarzschild');
    toggleBlock('param-block-yukawa', state.forceLaw === 'yukawa');
    if (focusMirror && typeof focusMirror.rebuild === 'function') {
        focusMirror.rebuild();
    }
}

function updateBertrandButtons() {
    document.querySelectorAll('[data-bertrand]').forEach(btn => {
        const val = parseFloat(btn.dataset.bertrand);
        btn.classList.toggle('active', state.forceLaw === 'power' && Math.abs(state.exponentN - val) < 0.02);
    });
}

function updateCentralParamLabels() {
    const dividerEl = document.getElementById('divider-central-param');
    const textEl = document.getElementById('label-central-param-text');
    const symEl = document.getElementById('label-central-param-symbol');
    const unitEl = document.getElementById('unit-central-param');
    const unitM2El = document.getElementById('unit-m2');

    let divider = 'Condições Iniciais & Massas';
    let label = 'Massa do Corpo 1';
    let symbol = 'm_1';
    let unit = 'M☉';
    let unitM2 = 'M☉';

    if (state.forceLaw === 'repulsive') {
        divider = 'Condições Iniciais & Carga Central';
        label = 'Carga Central';
        symbol = 'Q';
        unit = 'Q₀';
        unitM2 = 'm₀';
    } else if (state.forceLaw === 'yukawa') {
        divider = 'Condições Iniciais & Carga Central';
        label = 'Carga Central';
        symbol = 'g';
        unit = 'g₀';
        unitM2 = 'm₀';
    } else if (state.forceLaw === 'power' && Math.abs(state.exponentN - 2.0) >= 0.02) {
        divider = 'Condições Iniciais & Constante Central';
        label = 'Constante Central';
        symbol = 'k';
        unit = 'k₀';
        unitM2 = 'm₀';
    }

    if (dividerEl) dividerEl.textContent = divider;
    if (textEl) textEl.textContent = label;
    if (symEl) {
        if (window.katex && typeof window.katex.render === 'function') {
            renderMath(symEl, symbol);
        } else {
            symEl.textContent = `$${symbol}$`;
        }
    }
    if (unitEl) unitEl.textContent = unit;
    if (unitM2El) unitM2El.textContent = unitM2;
}

function syncForceHints() {
    updateCentralParamLabels();
    updateMassRatioButtons();

    // Feedback contextual da progressão de referenciais e massa do Corpo 2 (m₂)
    const { m1, m2, eta1, eta2 } = getMassFractions();
    if (state.frame === 'm1') {
        setFieldState('#panel-frame-selector', null, 'Estágio 1: m₁ fixo na origem — órbita e vetores exibidos apenas em m₂.');
    } else if (state.frame === 'm2') {
        setFieldState('#panel-frame-selector', 'ready', 'Estágio 2: m₂ fixo na origem — órbita e reação F₂→₁ exibidas no corpo central m₁.');
    } else {
        setFieldState('#panel-frame-selector', 'valid', 'Estágio 3 (Inercial): ambos os corpos orbitam o Centro de Massa (CM) com F₁₂ = −F₂₁.');
    }

    if (state.frame === 'cm' && m2 <= 0.001) {
        setFieldState('#field-m2', 'warning', 'CM coincide com m₁ (m₂ = 0). Aumente m₂ ou escolha 1:5, 1:3 ou Binário 1:1 para ver ambos orbitarem!');
    } else if (m2 > 0.001) {
        const pct1 = Math.round(eta1 * 100);
        const pct2 = Math.round(eta2 * 100);
        setFieldState('#field-m2', 'valid', `Razão m₂/m₁ = ${(m2 / m1).toFixed(2)} • Frações no CM: a₁ = ${pct1}%, a₂ = ${pct2}%.`);
    } else {
        setFieldState('#field-m2', null, 'Limite partícula-teste (m₂ ≪ m₁). Aumente m₂ para ativar o recuo de m₁.');
    }

    if (state.forceLaw === 'power') {
        const n = state.exponentN;
        if (Math.abs(n - 2.0) < 0.02) {
            setFieldState('#field-exponent', 'valid', 'Teorema de Bertrand: Newton (n = 2) — órbitas fechadas com foco na origem.');
        } else if (Math.abs(n + 1.0) < 0.02) {
            setFieldState('#field-exponent', 'valid', 'Teorema de Bertrand: Hooke (n = −1, F = −kr) — elipses centradas na origem!');
        } else if (n >= 3.0) {
            setFieldState('#field-exponent', 'warning', 'Regime instável (n ≥ 3): espirais de Cotes (queda ao centro ou escape).');
        } else {
            setFieldState('#field-exponent', 'ready', `Órbitas em roseta (precessão apsidal), mas a 2ª Lei (dA/dt = const.) permanece válida!`);
        }
        setFieldState('#select-force-law', null, '');
    } else if (state.forceLaw === 'schwarzschild') {
        setFieldState('#select-force-law', 'ready', 'Correção −3GMh²/(c²r⁴) da Relatividade Geral: causa precessão do periélio.');
        setFieldState('#field-gr', 'ready', state.grAlpha > 0 ? 'Avanço relativístico do periélio ativo (observe o vetor e⃗ girar!).' : 'Limite clássico newtoniano (α = 0).');
    } else if (state.forceLaw === 'repulsive') {
        setFieldState('#select-force-law', 'ready', 'Espalhamento de Rutherford (+k/r²): trajetória hiperbólica, mas dA/dt continua constante!');
    } else if (state.forceLaw === 'yukawa') {
        setFieldState('#select-force-law', 'ready', 'Interação de curto alcance blindada por exp(−r/λ).');
        setFieldState('#field-yukawa', 'ready', `Blindagem exponencial em λ = ${state.yukawaLambda.toFixed(2)} UA induz precessão.`);
    }

    // Feedback semântico de velocidade (escape / circular) quando Newton n=2
    if (!state.collided && !state.escaped) {
        if (state.forceLaw === 'power' && Math.abs(state.exponentN - 2.0) < 0.02) {
            const mu = getMu();
            const vCirc = Math.sqrt(mu / state.r0);
            const vEsc = Math.sqrt((2 * mu) / state.r0);
            if (state.v0 >= vEsc * 0.995) {
                setFieldState('#field-velocidade', 'warning', `Acima da velocidade de escape (v_esc = ${vEsc.toFixed(2)} UA/a) — órbita aberta.`);
            } else {
                setFieldState('#field-velocidade', null, `v_circ = ${vCirc.toFixed(2)} • v_esc = ${vEsc.toFixed(2)} UA/a`);
            }
        } else {
            setFieldState('#field-velocidade', null, '');
        }
    }
}

// =============================================================================
// 9. CANVAS 2D, CÂMERA E RENDERIZAÇÃO (PRESENTATION PASS)
// =============================================================================
const canvas = document.getElementById('simulationCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let canvasWidth = 800;
let canvasHeight = 600;

function resizeCanvas() {
    if (!canvas || !canvas.parentElement || !ctx) return;
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
    updateVisualScene();
}

function worldToScreen(wx, wy) {
    return {
        x: canvasWidth * 0.5 + (wx + view.offsetX) * view.scale,
        y: canvasHeight * 0.5 - (wy + view.offsetY) * view.scale
    };
}

function screenToWorld(sx, sy) {
    return {
        x: (sx - canvasWidth * 0.5) / view.scale - view.offsetX,
        y: -(sy - canvasHeight * 0.5) / view.scale - view.offsetY
    };
}

function setCameraMode(mode, { refit = false, updateScene = true } = {}) {
    if (!['fit', 'follow-m1', 'follow-m2'].includes(mode)) return;
    const prevMode = state.cameraMode;
    state.cameraMode = mode;

    const btn = document.getElementById('btn-reset-view');
    const txt = document.getElementById('btn-reset-view-text');
    const isFollowing = mode !== 'fit';

    if (btn) {
        btn.dataset.cameraMode = mode;
        btn.classList.toggle('active', isFollowing);
        btn.setAttribute('aria-pressed', isFollowing ? 'true' : 'false');

        const titleMap = {
            'fit': 'Câmera: Enquadrar Sistema (clique para seguir m₁)',
            'follow-m1': 'Câmera: Seguindo m₁ (clique para seguir m₂)',
            'follow-m2': 'Câmera: Seguindo m₂ (clique para enquadrar o sistema)'
        };
        btn.title = titleMap[mode];

        const prevIcon = prevMode === 'fit' ? 'camera-reset' : 'focus';
        const nextIcon = isFollowing ? 'focus' : 'camera-reset';
        if (prevIcon !== nextIcon) {
            setElementIcon(btn, nextIcon);
        }
    }

    if (txt) {
        txt.textContent = mode === 'follow-m1' ? 'Seguir m₁' : (mode === 'follow-m2' ? 'Seguir m₂' : 'Enquadrar');
    }

    if (isFollowing) {
        view.isManuallyPanned = false;
    }

    if (mode === 'fit' && refit) {
        view.isManuallyPanned = false;
        fitOrbitToCanvas();
        return;
    }

    if (updateScene) updateVisualScene();
}

function cycleCameraMode() {
    // Se o usuário moveu a câmera manualmente em 'fit', o 1º clique re-enquadra o sistema
    if (state.cameraMode === 'fit' && view.isManuallyPanned) {
        setCameraMode('fit', { refit: true });
        return;
    }
    if (state.cameraMode === 'fit') {
        setCameraMode('follow-m1');
    } else if (state.cameraMode === 'follow-m1') {
        setCameraMode('follow-m2');
    } else {
        setCameraMode('fit', { refit: true });
    }
}

function fitOrbitToCanvas() {
    view.isManuallyPanned = false;
    const metrics = computeOrbitMetrics();
    const { eta1, eta2 } = getMassFractions();
    const minDim = Math.max(240, Math.min(canvasWidth, canvasHeight));

    if (metrics.conicAnalytical) {
        const c = metrics.conicAnalytical;
        if (state.frame === 'm2') {
            const span = Math.max(c.a * 2.55, 1.8);
            view.scale = Math.max(view.minScale, Math.min(view.maxScale, (minDim * 0.80) / span));
            view.offsetX = c.centerX;
            view.offsetY = c.centerY;
        } else if (state.frame === 'cm') {
            // Enquadra ambas as elipses (a₁ = η₁·a e a₂ = η₂·a) ao redor do CM (0, 0)
            const maxReach = Math.max(eta1, eta2) * (c.a + c.c);
            const span = Math.max(maxReach * 2.35, c.a * 2.1, 1.6);
            view.scale = Math.max(view.minScale, Math.min(view.maxScale, (minDim * 0.82) / span));
            view.offsetX = -(eta2 - eta1) * c.centerX * 0.5;
            view.offsetY = -(eta2 - eta1) * c.centerY * 0.5;
        } else {
            const span = Math.max(c.a * 2.55, 1.8);
            view.scale = Math.max(view.minScale, Math.min(view.maxScale, (minDim * 0.80) / span));
            view.offsetX = -c.centerX;
            view.offsetY = -c.centerY;
        }
    } else {
        const factor = state.frame === 'cm' ? Math.max(eta1, eta2, 0.5) : 1.0;
        const radiusRef = Math.max(state.r0 * factor * 1.45, 1.4);
        view.scale = Math.max(view.minScale, Math.min(view.maxScale, (minDim * 0.42) / radiusRef));
        view.offsetX = 0;
        view.offsetY = 0;
    }
    updateVisualScene();
}

function getVelocityHandleWorldPos() {
    const snap = getFrameSnapshot();
    if (state.frame === 'm2') {
        return {
            x: snap.p1.x + snap.v1.x * VEL_ARROW_SCALE,
            y: snap.p1.y + snap.v1.y * VEL_ARROW_SCALE,
            baseX: snap.p1.x,
            baseY: snap.p1.y,
            vMag: Math.hypot(snap.v1.x, snap.v1.y),
            label: 'v₁'
        };
    }
    return {
        x: snap.p2.x + snap.v2.x * VEL_ARROW_SCALE,
        y: snap.p2.y + snap.v2.y * VEL_ARROW_SCALE,
        baseX: snap.p2.x,
        baseY: snap.p2.y,
        vMag: Math.hypot(snap.v2.x, snap.v2.y),
        label: state.frame === 'cm' ? 'v₂' : 'v'
    };
}

function drawArrow2D(x0, y0, x1, y1, color, lineWidth = 2.2, headLen = 10) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    const angle = Math.atan2(dy, dx);
    const hl = Math.min(headLen, len * 0.45);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - hl * 0.7 * Math.cos(angle), y1 - hl * 0.7 * Math.sin(angle));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(angle - Math.PI / 6), y1 - hl * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x1 - hl * Math.cos(angle + Math.PI / 6), y1 - hl * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawLabelPill(sx, sy, text, color, align = 'center') {
    ctx.save();
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const padX = 6;
    const textW = ctx.measureText(text).width;
    const boxW = textW + padX * 2;
    const boxH = 19;

    let rx = sx - boxW / 2;
    if (align === 'left') rx = sx;
    if (align === 'right') rx = sx - boxW;
    const ry = sy - boxH / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rx, ry, boxW, boxH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rx + boxW / 2, ry + boxH / 2 + 0.5);
    ctx.restore();
}

/**
 * Presentation Pass — Redesenha integralmente o plano orbital 2D nos 3 estágios progressivos:
 *   - 'm1': Corpo central (m₁) fixo na origem; órbita, setores e vetores apenas em m₂
 *   - 'm2': Corpo menor (m₂) fixo na origem; órbita, setores e vetores no corpo central m₁
 *   - 'cm': Centro de Massa (CM) na origem; ambos orbitando com Ação-Reação (F₁₂ = −F₂₁)
 */
function updateVisualScene() {
    if (!ctx || !canvasWidth || !canvasHeight) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const metrics = computeOrbitMetrics();
    const snap = getFrameSnapshot();

    // Centralização contínua da câmera nos modos "Seguir m₁" e "Seguir m₂"
    if (state.cameraMode === 'follow-m1' && pointer.mode !== 'drag-m1') {
        view.offsetX = -snap.p1.x;
        view.offsetY = -snap.p1.y;
    } else if (state.cameraMode === 'follow-m2' && pointer.mode !== 'drag-m2') {
        view.offsetX = -snap.p2.x;
        view.offsetY = -snap.p2.y;
    }

    const origin = worldToScreen(0, 0);
    const p1Screen = worldToScreen(snap.p1.x, snap.p1.y);
    const p2Screen = worldToScreen(snap.p2.x, snap.p2.y);
    const cmScreen = worldToScreen(snap.cm.x, snap.cm.y);

    // 1. Grade Polar & Eixos Cartesianos na origem do referencial ativo
    if (state.showGrid) {
        drawPolarGrid(origin);
    }

    // 2. Geometria da 1ª Lei de Kepler (adaptada ao estágio ativo)
    if (state.showKeplerGeometry && metrics.conicAnalytical) {
        drawKeplerFirstLawOverlay(metrics.conicAnalytical, origin, snap);
    }

    // 3. Setores Coloridos da 2ª Lei de Kepler (acompanham o referencial ativo!)
    if (state.sectors.length > 0) {
        drawKeplerAreaSectors(origin, snap);
    }

    // 4. Pré-visualização Tracejada da Trajetória
    if (state.showPreview && previewPoints.length > 1) {
        if (state.frame === 'm1') {
            drawPreviewPath(1, 'rgba(148, 163, 184, 0.34)');
        } else if (state.frame === 'm2') {
            drawPreviewPath(-1, 'rgba(245, 158, 11, 0.36)');
        } else {
            drawPreviewPath(snap.eta2, 'rgba(56, 189, 248, 0.32)');
            if (snap.eta1 > 0.025) {
                drawPreviewPath(-snap.eta1, 'rgba(245, 158, 11, 0.36)');
            }
        }
    }

    // 5. Rastro(s) Histórico(s) da Órbita
    if (state.showTrail && trail.length > 1) {
        if (state.frame === 'm1') {
            drawOrbitTrail(1, theme.cyan);
        } else if (state.frame === 'm2') {
            drawOrbitTrail(-1, theme.orange);
        } else {
            drawOrbitTrail(snap.eta2, theme.cyan);
            if (snap.eta1 > 0.025) {
                drawOrbitTrail(-snap.eta1, theme.orange);
            }
        }
    }

    // 6. Vetor Posição / Linha Colinear m₁ — CM — m₂
    if (state.showPosition) {
        if (state.frame === 'm1') {
            drawArrow2D(p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y, theme.emerald, 1.8, 9);
        } else if (state.frame === 'm2') {
            drawArrow2D(p2Screen.x, p2Screen.y, p1Screen.x, p1Screen.y, theme.emerald, 1.8, 9);
        } else {
            // Estágio 3 (Anti-poluição): linha tracejada sutil conectando m₁ — CM — m₂
            ctx.save();
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.stroke();
            ctx.restore();
        }
    }

    // 7. Marcador do Centro de Massa (proeminente no Estágio 3; sutil nos Estágios 1 e 2 quando m₂ > 0)
    if (state.frame === 'cm') {
        drawCenterOfMassMarker(cmScreen, true);
    } else if (snap.eta1 > 0.015) {
        drawCenterOfMassMarker(cmScreen, false);
    }

    // 8. Vetor de Laplace-Runge-Lenz e⃗ (Aponta para o Periastro no referencial ativo)
    if (state.showLrlVector && metrics.eccLrl > 0.01) {
        const lrlScale = state.frame === 'm2' ? -0.85 : 0.85;
        const lrlEnd = worldToScreen(metrics.ex * lrlScale, metrics.ey * lrlScale);
        drawArrow2D(origin.x, origin.y, lrlEnd.x, lrlEnd.y, theme.purple, 2.4, 11);
        drawLabelPill(lrlEnd.x + 14, lrlEnd.y - 12, `e⃗ (${metrics.eccLrl.toFixed(2)})`, theme.purple);
    }

    // 9. Vetor(es) de Força Central (Par Ação-Reação F₁₂ = −F₂₁ no Estágio 3!)
    if (state.showForce) {
        const fMag = Math.hypot(body.ax, body.ay);
        if (fMag > 1e-5) {
            let visLen = Math.min(1.05, Math.max(0.16, Math.log1p(fMag * FORCE_ARROW_SCALE * 3.5) * 0.38));
            // Em forças atrativas, impede que as setas atravessem o CM ou o corpo oposto em periastros próximos
            if (state.forceLaw !== 'repulsive') {
                const maxAttractLen = state.frame === 'cm' ? metrics.r * 0.42 : metrics.r * 0.75;
                visLen = Math.min(visLen, Math.max(0.08, maxAttractLen));
            }
            const ux = body.ax / fMag;
            const uy = body.ay / fMag;

            if (state.frame === 'm1' || state.frame === 'cm') {
                const f2End = worldToScreen(snap.p2.x + ux * visLen, snap.p2.y + uy * visLen);
                drawArrow2D(p2Screen.x, p2Screen.y, f2End.x, f2End.y, theme.orange, 2.2, 10);
            }
            if (state.frame === 'm2' || state.frame === 'cm') {
                // Reação oposta F₂→₁ = −F₁→₂ atuando no corpo central m₁
                const f1End = worldToScreen(snap.p1.x - ux * visLen, snap.p1.y - uy * visLen);
                drawArrow2D(p1Screen.x, p1Screen.y, f1End.x, f1End.y, theme.orange, 2.2, 10);
            }
        }
    }

    // 10. Vetor(es) de Velocidade (com Alça Arrastável)
    if (state.showVelocity) {
        const vHandle = getVelocityHandleWorldPos();
        const vBaseScreen = worldToScreen(vHandle.baseX, vHandle.baseY);
        const vEndScreen = worldToScreen(vHandle.x, vHandle.y);

        // No Estágio 3 (CM), exibe também v₁ = −η₁·v em m₁ (oposta a v₂!)
        if (state.frame === 'cm' && snap.eta1 > 0.02) {
            const v1End = worldToScreen(
                snap.p1.x + snap.v1.x * VEL_ARROW_SCALE,
                snap.p1.y + snap.v1.y * VEL_ARROW_SCALE
            );
            drawArrow2D(p1Screen.x, p1Screen.y, v1End.x, v1End.y, theme.pink, 2.1, 9);
            if (!state.isRunning) {
                const v1Mag = Math.hypot(snap.v1.x, snap.v1.y);
                drawLabelPill(v1End.x - 16, v1End.y + 14, `v₁ = ${v1Mag.toFixed(2)}`, theme.pink, 'right');
            }
        }

        // Vetor principal com alça arrastável (em m₂ nos estágios 1/3; em m₁ no estágio 2)
        drawArrow2D(vBaseScreen.x, vBaseScreen.y, vEndScreen.x, vEndScreen.y, theme.rose, 2.4, 10);

        ctx.save();
        ctx.beginPath();
        ctx.arc(vEndScreen.x, vEndScreen.y, pointer.mode === 'drag-vel' ? 9 : 6.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.rose;
        ctx.stroke();

        if (!state.isRunning || pointer.mode === 'drag-vel') {
            drawLabelPill(vEndScreen.x + 18, vEndScreen.y - 14, `${vHandle.label} = ${vHandle.vMag.toFixed(2)}`, theme.rose, 'left');
        }
        ctx.restore();
    }

    // 11. Corpos m₁ (Primário / Sol) e m₂ (Secundário / Planeta)
    drawPrimaryBody(p1Screen);
    drawSecondaryBody(p2Screen);

    // 12. Atualiza Badge de Regime no Canto Superior Esquerdo
    updateCanvasBadge(metrics);
}

function drawPreviewPath(scaleFactor, strokeStyle) {
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i < previewPoints.length; i++) {
        const p = worldToScreen(previewPoints[i].x * scaleFactor, previewPoints[i].y * scaleFactor);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawCenterOfMassMarker(pos, prominent) {
    const r = prominent ? 7 : 4.5;
    ctx.save();
    ctx.globalAlpha = prominent ? 0.95 : 0.60;

    // Círculo dividido em 4 quadrantes alternados (símbolo clássico de baricentro)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();

    ctx.fillStyle = theme.textPrimary;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, r, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, r, Math.PI / 2, Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = prominent ? theme.accent : theme.textPrimary;
    ctx.lineWidth = prominent ? 1.6 : 1.1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.moveTo(pos.x - r - 4, pos.y);
    ctx.lineTo(pos.x + r + 4, pos.y);
    ctx.moveTo(pos.x, pos.y - r - 4);
    ctx.lineTo(pos.x, pos.y + r + 4);
    ctx.stroke();

    if (prominent) {
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = theme.textPrimary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('CM', pos.x + r + 6, pos.y - r - 2);
    }
    ctx.restore();
}

function drawPolarGrid(origin) {
    ctx.save();
    // Círculos concêntricos em múltiplos de 0.5 UA
    const radii = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    radii.forEach(r => {
        const pxR = r * view.scale;
        if (pxR < 16 || pxR > Math.max(canvasWidth, canvasHeight) * 2.2) return;
        const isUnit = Math.abs(r - 1.0) < 1e-4;
        ctx.strokeStyle = isUnit ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.055)';
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, pxR, 0, Math.PI * 2);
        ctx.stroke();

        if (r === 1.0 || r === 2.0 || r === 3.0) {
            ctx.fillText(`${r.toFixed(0)} UA`, origin.x + pxR + 4, origin.y - 4);
        }
    });

    // Raios angulares suaves a cada 45°
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    const maxRay = Math.max(canvasWidth, canvasHeight) * 1.4;
    for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x + Math.cos(ang) * maxRay, origin.y - Math.sin(ang) * maxRay);
        ctx.stroke();
    }

    // Eixos cartesianos principais X e Y
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(canvasWidth, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, canvasHeight);
    ctx.stroke();
    ctx.restore();
}

function drawKeplerFirstLawOverlay(c, origin, snap) {
    ctx.save();

    // Estágio 3 (CM): duas elipses analíticas compartilhando o foco CM (sem rótulos redundantes F₂/P/Q)
    if (state.frame === 'cm') {
        const drawCmEllipse = (scaleFactor, strokeColor) => {
            const absS = Math.abs(scaleFactor);
            if (absS < 0.025) return;
            const ctr = worldToScreen(c.centerX * scaleFactor, c.centerY * scaleFactor);
            const ang = scaleFactor < 0 ? c.angle + Math.PI : c.angle;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.ellipse(ctr.x, ctr.y, c.a * absS * view.scale, c.b * absS * view.scale, -ang, 0, Math.PI * 2);
            ctx.stroke();
        };

        drawCmEllipse(snap.eta2, 'rgba(56, 189, 248, 0.30)');
        drawCmEllipse(-snap.eta1, 'rgba(245, 158, 11, 0.34)');
        ctx.restore();
        return;
    }

    // Estágios 1 ('m1', s = +1) e 2 ('m2', s = -1)
    const s = state.frame === 'm2' ? -1 : 1;
    const angle = s < 0 ? c.angle + Math.PI : c.angle;
    const center = worldToScreen(c.centerX * s, c.centerY * s);
    const f2 = worldToScreen(c.f2X * s, c.f2Y * s);
    const peri = worldToScreen(c.periX * s, c.periY * s);
    const apo = worldToScreen(c.apoX * s, c.apoY * s);

    // Elipse analítica exata
    ctx.strokeStyle = s < 0 ? 'rgba(245, 158, 11, 0.34)' : 'rgba(129, 140, 248, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, c.a * view.scale, c.b * view.scale, -angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Linha dos Apsides (Eixo Maior 2a)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(peri.x, peri.y);
    ctx.lineTo(apo.x, apo.y);
    ctx.stroke();

    // Semi-eixo menor (b) a partir do centro C
    const perpAngle = angle + Math.PI / 2;
    const bTop = worldToScreen(c.centerX * s + c.b * Math.cos(perpAngle), c.centerY * s + c.b * Math.sin(perpAngle));
    const bBot = worldToScreen(c.centerX * s - c.b * Math.cos(perpAngle), c.centerY * s - c.b * Math.sin(perpAngle));
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(bTop.x, bTop.y);
    ctx.lineTo(bBot.x, bBot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Centro geométrico C
    ctx.fillStyle = 'rgba(244, 244, 246, 0.55)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Foco vazio F2 (exibe se e > 0.03 para não sobrepor F1)
    if (c.e > 0.03) {
        ctx.strokeStyle = 'rgba(244, 244, 246, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(f2.x - 5, f2.y);
        ctx.lineTo(f2.x + 5, f2.y);
        ctx.moveTo(f2.x, f2.y - 5);
        ctx.lineTo(f2.x, f2.y + 5);
        ctx.stroke();

        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = 'rgba(244, 244, 246, 0.7)';
        ctx.fillText('F₂', f2.x + 7, f2.y - 6);
        ctx.fillText(s < 0 ? 'F₁ (m₂)' : 'F₁', origin.x + 14, origin.y - 12);

        // Marcadores de Periastro (P) e Apoastro (Q) posicionados fora da elipse
        const periOutX = Math.cos(angle);
        const periOutY = -Math.sin(angle);

        ctx.fillStyle = s < 0 ? theme.orange : theme.cyan;
        ctx.beginPath();
        ctx.arc(peri.x, peri.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = periOutX < 0 ? 'right' : 'left';
        ctx.fillText(s < 0 ? 'P (Periastro)' : 'P (Periélio)', peri.x + periOutX * 10, peri.y + periOutY * 10 - 10);

        ctx.fillStyle = theme.purple;
        ctx.beginPath();
        ctx.arc(apo.x, apo.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = periOutX < 0 ? 'left' : 'right';
        ctx.fillText(s < 0 ? 'Q (Apoastro)' : 'Q (Afélio)', apo.x - periOutX * 10, apo.y - periOutY * 10 - 10);
        ctx.textAlign = 'left';
    }

    ctx.restore();
}

function drawKeplerAreaSectors(origin, snap) {
    const drawSingleSector = (sec, scaleFactor, areaVal, tagSuffix, dashed = false) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        for (let i = 0; i < sec.vertices.length; i++) {
            const pt = worldToScreen(sec.vertices[i].x * scaleFactor, sec.vertices[i].y * scaleFactor);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();

        ctx.globalAlpha = sec.completed ? (dashed ? 0.18 : 0.24) : 0.34;
        ctx.fillStyle = sec.color;
        ctx.fill();

        ctx.globalAlpha = sec.completed ? 0.82 : 0.95;
        ctx.strokeStyle = sec.color;
        ctx.lineWidth = sec.completed ? 1.5 : 2.0;
        if (dashed) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Rótulo flutuante no centroide aproximado (omite rótulo se setor for muito pequeno)
        const midIdx = Math.floor(sec.vertices.length / 2);
        const midV = sec.vertices[midIdx];
        if (midV && Math.abs(scaleFactor) >= 0.18) {
            const labelPos = worldToScreen(midV.x * scaleFactor * 0.62, midV.y * scaleFactor * 0.62);
            ctx.globalAlpha = 1.0;
            drawLabelPill(labelPos.x, labelPos.y, `${sec.label}${tagSuffix}: ${areaVal.toFixed(3)} UA²`, sec.color);
        }
        ctx.restore();
    };

    state.sectors.forEach(sec => {
        if (sec.vertices.length < 2) return;
        if (state.frame === 'm1') {
            drawSingleSector(sec, 1, sec.area, '', false);
        } else if (state.frame === 'm2') {
            drawSingleSector(sec, -1, sec.area, '', false);
        } else {
            // Estágio 3 (CM): setor de m₂ (η₂²) e setor oposto proporcional de m₁ (η₁²)
            const a2 = snap.eta2 * snap.eta2 * sec.area;
            drawSingleSector(sec, snap.eta2, a2, snap.eta1 > 0.04 ? ' (m₂)' : '', false);
            if (snap.eta1 > 0.04) {
                const a1 = snap.eta1 * snap.eta1 * sec.area;
                drawSingleSector(sec, -snap.eta1, a1, ' (m₁)', true);
            }
        }
    });
}

function drawOrbitTrail(scaleFactor = 1, strokeColor = theme.cyan) {
    ctx.save();
    const total = trail.length;
    const stride = total > 1400 ? 2 : 1;
    const chunks = 16;
    const chunkSize = Math.max(2, Math.ceil(total / chunks));

    for (let c = 0; c < chunks; c++) {
        const start = c * chunkSize;
        const end = Math.min(total - 1, (c + 1) * chunkSize);
        if (start >= end) continue;

        const progress = (c + 1) / chunks;
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.10 + 0.78 * progress;
        ctx.lineWidth = 1.2 + 1.1 * progress;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = start; i <= end; i += stride) {
            const p = worldToScreen(trail[i].x * scaleFactor, trail[i].y * scaleFactor);
            if (i === start) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        const pEnd = worldToScreen(trail[end].x * scaleFactor, trail[end].y * scaleFactor);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawPrimaryBody(pos) {
    const isRepulsive = state.forceLaw === 'repulsive';
    const baseR = Math.max(8.5, Math.min(18, 9.5 + Math.cbrt(state.centralMass) * 4.5));

    ctx.save();
    const glowR = baseR * 2.9;
    const grad = ctx.createRadialGradient(pos.x, pos.y, baseR * 0.2, pos.x, pos.y, glowR);
    if (isRepulsive) {
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.92)');
        grad.addColorStop(0.38, 'rgba(168, 85, 247, 0.42)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    } else {
        grad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
        grad.addColorStop(0.36, 'rgba(245, 158, 11, 0.48)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, baseR, 0, Math.PI * 2);
    ctx.fillStyle = isRepulsive ? '#fda4af' : '#fef08a';
    ctx.shadowColor = isRepulsive ? theme.rose : theme.orange;
    ctx.shadowBlur = 16;
    ctx.fill();

    if (isRepulsive) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x - 4.5, pos.y);
        ctx.lineTo(pos.x + 4.5, pos.y);
        ctx.moveTo(pos.x, pos.y - 4.5);
        ctx.lineTo(pos.x, pos.y + 4.5);
        ctx.stroke();
    }

    // Rótulo discreto m₁ nos Estágios 2 e 3
    if (state.frame !== 'm1') {
        ctx.shadowBlur = 0;
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = isRepulsive ? '#fda4af' : '#fef08a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('m₁', pos.x + baseR + 4, pos.y - baseR * 0.4);
    }
    ctx.restore();
}

function drawSecondaryBody(pScreen) {
    const massRadius = state.secondaryMass <= 0.001
        ? 7.5
        : Math.max(7.5, Math.min(17.5, 9.5 + Math.cbrt(state.secondaryMass) * 4.5));
    const rPx = pointer.mode === 'drag-m2' ? massRadius + 1.5 : massRadius;

    ctx.save();
    const grad = ctx.createRadialGradient(
        pScreen.x - rPx * 0.35,
        pScreen.y - rPx * 0.35,
        1,
        pScreen.x,
        pScreen.y,
        rPx
    );
    grad.addColorStop(0, '#bae6fd');
    grad.addColorStop(0.5, '#0284c7');
    grad.addColorStop(1, '#082f49');

    ctx.beginPath();
    ctx.arc(pScreen.x, pScreen.y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = theme.cyan;
    ctx.shadowBlur = 12;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
    ctx.stroke();

    // Rótulo discreto m₂ nos Estágios 2 e 3
    if (state.frame !== 'm1') {
        ctx.shadowBlur = 0;
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#bae6fd';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('m₂', pScreen.x + rPx + 4, pScreen.y - rPx * 0.4);
    }
    ctx.restore();
}

function updateCanvasBadge(metrics) {
    const badge = document.getElementById('canvas-regime-badge');
    const textEl = document.getElementById('canvas-regime-text');
    if (!badge || !textEl) return;

    if (state.activeSector) {
        const s = state.activeSector;
        badge.classList.add('is-capturing');
        textEl.textContent = `Varrendo ${s.label}: ${s.elapsed.toFixed(2)} / ${s.duration.toFixed(2)} ano • A = ${s.area.toFixed(3)} UA²`;
        return;
    }

    badge.classList.remove('is-capturing');
    let forceTag = `n=${state.exponentN.toFixed(2)}`;
    if (state.forceLaw === 'power' && Math.abs(state.exponentN - 2) < 0.02) forceTag = 'Newton';
    else if (state.forceLaw === 'power' && Math.abs(state.exponentN + 1) < 0.02) forceTag = 'Hooke';
    else if (state.forceLaw === 'schwarzschild') forceTag = `GR α=${state.grAlpha.toFixed(1)}`;
    else if (state.forceLaw === 'repulsive') forceTag = 'Rutherford';
    else if (state.forceLaw === 'yukawa') forceTag = `Yukawa λ=${state.yukawaLambda.toFixed(1)}`;

    const frameTag = state.frame === 'm1' ? 'Ref. m₁' : (state.frame === 'm2' ? 'Ref. m₂' : 'Ref. CM');
    const eccStr = metrics.isNewton ? ` (e=${metrics.eccLrl.toFixed(2)})` : '';
    textEl.textContent = `${frameTag} • ${metrics.conicType}${eccStr} • ${forceTag}`;
}

// =============================================================================
// 10. INTERAÇÃO DIRETA NO CANVAS 2D (POINTER EVENTS + PINÇA MOBILE)
// =============================================================================
function dismissInteractiveHint() {
    if (state.hintDismissed) return;
    state.hintDismissed = true;
    document.getElementById('canvas-interactive-hint')?.classList.add('is-dismissed');
}

function getCanvasPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTestHandles(sx, sy) {
    const snap = getFrameSnapshot();
    const p1Screen = worldToScreen(snap.p1.x, snap.p1.y);
    const p2Screen = worldToScreen(snap.p2.x, snap.p2.y);

    if (state.showVelocity) {
        const vHandle = getVelocityHandleWorldPos();
        const vScreen = worldToScreen(vHandle.x, vHandle.y);
        if (Math.hypot(sx - vScreen.x, sy - vScreen.y) <= 22) return 'drag-vel';
    }
    if (state.frame === 'm2') {
        if (Math.hypot(sx - p1Screen.x, sy - p1Screen.y) <= 24) return 'drag-m1';
    } else if (state.frame === 'cm') {
        if (Math.hypot(sx - p2Screen.x, sy - p2Screen.y) <= 22) return 'drag-m2';
        if (snap.eta1 > 0.08 && Math.hypot(sx - p1Screen.x, sy - p1Screen.y) <= 22) return 'drag-m1';
    } else {
        if (Math.hypot(sx - p2Screen.x, sy - p2Screen.y) <= 22) return 'drag-m2';
    }
    return null;
}

function setupPointerEvents() {
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (e) => {
        const pos = getCanvasPointerPos(e);
        pointer.pointers.set(e.pointerId, pos);
        canvas.setPointerCapture(e.pointerId);
        dismissInteractiveHint();

        // Pinça com 2 dedos para zoom mobile
        if (pointer.pointers.size === 2) {
            const pts = Array.from(pointer.pointers.values());
            pointer.mode = 'pinch';
            pointer.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            pointer.pinchStartScale = view.scale;
            canvas.classList.add('is-dragging');
            return;
        }

        const hit = hitTestHandles(pos.x, pos.y);
        pointer.activeId = e.pointerId;
        pointer.startX = pos.x;
        pointer.startY = pos.y;

        if (hit === 'drag-vel' || hit === 'drag-m1' || hit === 'drag-m2') {
            pointer.mode = hit;
            if (state.isRunning) {
                setRunning(false);
            }
            state.r0 = Math.max(0.40, Math.min(3.00, Math.hypot(body.x, body.y)));
            state.theta0 = Math.atan2(body.y, body.x);
            canvas.classList.add('is-dragging');
        } else {
            pointer.mode = 'pan';
            pointer.startOffsetX = view.offsetX;
            pointer.startOffsetY = view.offsetY;
            canvas.classList.add('is-dragging');
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const pos = getCanvasPointerPos(e);
        if (pointer.pointers.has(e.pointerId)) {
            pointer.pointers.set(e.pointerId, pos);
        }

        // Pinça de 2 dedos
        if (pointer.mode === 'pinch' && pointer.pointers.size === 2) {
            const pts = Array.from(pointer.pointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (pointer.pinchStartDist > 10) {
                const factor = dist / pointer.pinchStartDist;
                view.scale = Math.max(view.minScale, Math.min(view.maxScale, pointer.pinchStartScale * factor));
                updateVisualScene();
            }
            return;
        }

        if (!pointer.mode) {
            const hoverHit = hitTestHandles(pos.x, pos.y);
            canvas.classList.toggle('is-hover-handle', Boolean(hoverHit));
            return;
        }

        if (e.pointerId !== pointer.activeId) return;

        if (pointer.mode === 'pan') {
            if (Math.hypot(pos.x - pointer.startX, pos.y - pointer.startY) > 3) {
                view.isManuallyPanned = true;
                if (state.cameraMode !== 'fit') {
                    setCameraMode('fit', { refit: false, updateScene: false });
                }
            }
            const dx = (pos.x - pointer.startX) / view.scale;
            const dy = -(pos.y - pointer.startY) / view.scale;
            view.offsetX = pointer.startOffsetX + dx;
            view.offsetY = pointer.startOffsetY + dy;
            updateVisualScene();
        } else if (pointer.mode === 'drag-vel') {
            const wPos = screenToWorld(pos.x, pos.y);
            const vHandle = getVelocityHandleWorldPos();
            const { eta2 } = getMassFractions();

            // Converte o vetor velocidade arrastado no referencial ativo de volta para v_rel = v₂ − v₁
            const vFrameX = (wPos.x - vHandle.baseX) / VEL_ARROW_SCALE;
            const vFrameY = (wPos.y - vHandle.baseY) / VEL_ARROW_SCALE;
            let vxRaw = vFrameX;
            let vyRaw = vFrameY;
            if (state.frame === 'm2') {
                vxRaw = -vFrameX;
                vyRaw = -vFrameY;
            } else if (state.frame === 'cm') {
                const invEta2 = 1 / Math.max(0.15, eta2);
                vxRaw = vFrameX * invEta2;
                vyRaw = vFrameY * invEta2;
            }

            const vMag = Math.max(0.50, Math.min(14.0, Math.hypot(vxRaw, vyRaw)));
            const r = Math.max(1e-5, Math.hypot(body.x, body.y));
            const radX = body.x / r;
            const radY = body.y / r;
            const tanCCWX = -radY;
            const tanCCWY = radX;

            const vr = vxRaw * radX + vyRaw * radY;
            const vt = vxRaw * tanCCWX + vyRaw * tanCCWY;
            state.orbitSign = vt >= 0 ? 1 : -1;

            const gammaRad = Math.atan2(vr, Math.abs(vt));
            state.gammaDeg = Math.max(-75, Math.min(75, (gammaRad * 180) / Math.PI));
            state.v0 = vMag;

            sliderCtrls.v0?.setValue(Number(state.v0.toFixed(2)), false);
            sliderCtrls.gamma?.setValue(Math.round(state.gammaDeg), false);
            clearPresetHighlight();
            applyInitialConditions({ resetView: false });
        } else if (pointer.mode === 'drag-m2' || pointer.mode === 'drag-m1') {
            const wPos = screenToWorld(pos.x, pos.y);
            const { eta1, eta2 } = getMassFractions();

            // Converte posição do corpo arrastado de volta para a coordenada relativa r⃗ = r⃗₂ − r⃗₁
            let relX = wPos.x;
            let relY = wPos.y;
            if (pointer.mode === 'drag-m1') {
                const scale = state.frame === 'cm' ? -1 / Math.max(0.08, eta1) : -1;
                relX = wPos.x * scale;
                relY = wPos.y * scale;
            } else if (state.frame === 'cm') {
                const scale = 1 / Math.max(0.15, eta2);
                relX = wPos.x * scale;
                relY = wPos.y * scale;
            }

            const rNew = Math.max(0.40, Math.min(3.00, Math.hypot(relX, relY)));
            state.r0 = Number(rNew.toFixed(2));
            state.theta0 = Math.atan2(relY, relX);

            sliderCtrls.r0?.setValue(state.r0, false);
            clearPresetHighlight();
            applyInitialConditions({ resetView: false });
        }
    });

    const releasePointer = (e) => {
        const prevDragMode = pointer.mode;
        pointer.pointers.delete(e.pointerId);
        if (pointer.pointers.size === 0) {
            pointer.mode = null;
            pointer.activeId = null;
            canvas.classList.remove('is-dragging');
            if ((prevDragMode === 'drag-m1' && state.cameraMode === 'follow-m1') ||
                (prevDragMode === 'drag-m2' && state.cameraMode === 'follow-m2')) {
                updateVisualScene();
            }
        }
    };

    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);

    // Zoom suave com a roda do mouse
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.10 : 1 / 1.10;
        view.scale = Math.max(view.minScale, Math.min(view.maxScale, view.scale * factor));
        updateVisualScene();
    }, { passive: false });

    // Botão cíclico de câmera: Enquadrar → Seguir m₁ → Seguir m₂ → Enquadrar
    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
        cycleCameraMode();
    });
}

function clearPresetHighlight() {
    document.querySelectorAll('[data-preset]').forEach(btn => btn.classList.remove('active'));
}

// =============================================================================
// 11. TELEMETRIA, READOUTS, GRÁFICOS E 3ª LEI DE KEPLER
// =============================================================================
function updateReadouts() {
    const m = computeOrbitMetrics();
    const { m1, m2, total, eta1, eta2 } = getMassFractions();

    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    // 2ª Lei (exibe taxa relativa em m₁/m₂, ou taxas baricêntricas de m₂ e m₁ no CM)
    if (state.frame === 'cm' && m2 > 0.001) {
        const rate2 = eta2 * eta2 * m.arealRate;
        const rate1 = eta1 * eta1 * m.arealRate;
        setTxt('readout-areal-rate', `m₂:${rate2.toFixed(2)} • m₁:${rate1.toFixed(2)} UA²/a`);
        setTxt('readout-expected-area', `A₂=${(rate2 * state.sectorDt).toFixed(3)} • A₁=${(rate1 * state.sectorDt).toFixed(3)} UA²`);
    } else {
        setTxt('readout-areal-rate', `${m.arealRate.toFixed(3)} UA²/a`);
        setTxt('readout-expected-area', `${(m.arealRate * state.sectorDt).toFixed(4)} UA²`);
    }

    // 1ª e 3ª Leis + Invariantes
    setTxt('readout-rv', `${m.r.toFixed(2)} UA • ${m.v.toFixed(2)} UA/a`);
    setTxt('readout-angular-momentum', `${m.hAbs.toFixed(3)} UA²/a`);
    setTxt('readout-energy-total', `${m.E.toFixed(2)}`);

    const eccTxt = m.isNewton ? m.eccLrl.toFixed(2) : '—';
    const aTxt = m.semiMajor && m.semiMajor > 0 ? `${m.semiMajor.toFixed(2)} UA` : 'Aberta';
    setTxt('readout-ecc-a', `${eccTxt} • ${aTxt}`);

    // Semi-eixos individuais no Centro de Massa (a₁ = η₁·a, a₂ = η₂·a)
    const rowCm = document.getElementById('row-cm-semiaxes');
    if (rowCm) {
        const showCmRow = m2 > 0.001 && m.semiMajor && m.semiMajor > 0;
        rowCm.hidden = !showCmRow;
        rowCm.classList.toggle('hidden', !showCmRow);
        if (showCmRow) {
            setTxt('readout-cm-semiaxes', `${(eta1 * m.semiMajor).toFixed(2)} / ${(eta2 * m.semiMajor).toFixed(2)} UA`);
        }
    }

    const tMeasTxt = state.measuredPeriod ? `${state.measuredPeriod.toFixed(3)}a` : '--';
    const tTheoTxt = m.keplerPeriod ? `${m.keplerPeriod.toFixed(3)}a` : '—';
    setTxt('readout-period', `${tMeasTxt} / ${tTheoTxt}`);

    if (m.thirdLawRatio !== null && Number.isFinite(m.thirdLawRatio)) {
        const expected = 1 / total;
        const denomLbl = m2 > 0.001 ? '1/(m₁+m₂)' : '1/m₁';
        const suffix = m.isNewton ? ` (${denomLbl} = ${expected.toFixed(3)})` : '';
        setTxt('readout-third-law', `${m.thirdLawRatio.toFixed(3)}${suffix}`);
    } else {
        setTxt('readout-third-law', '— (órbita aberta)');
    }

    setTxt('footer-sim-timer', `t = ${state.time.toFixed(2)} ano`);

    if (state.activeSector) {
        updateCaptureButtonUI();
    }

    return m;
}

function recordThirdLawOrbit() {
    const m = computeOrbitMetrics();
    const a = m.semiMajor;
    const T = state.measuredPeriod || m.keplerPeriod;

    if (!a || a <= 0 || !T || !Number.isFinite(T)) {
        setFieldState('#field-velocidade', 'warning', 'A 3ª Lei requer uma órbita fechada (ou complete 1 volta para medir T).');
        return;
    }

    const ratio = (T * T) / (a * a * a);
    const lawLabel = state.forceLaw === 'power'
        ? `n=${state.exponentN.toFixed(1)}`
        : state.forceLaw.slice(0, 4).toUpperCase();

    state.thirdLawRecords.push({
        idx: state.thirdLawRecords.length + 1,
        a,
        T,
        e: m.isNewton ? m.eccLrl : null,
        ratio,
        lawLabel,
        measured: Boolean(state.measuredPeriod)
    });

    while (state.thirdLawRecords.length > MAX_THIRD_LAW_RECORDS) {
        state.thirdLawRecords.shift();
    }
    renderThirdLawTable();
}

function renderThirdLawTable() {
    const container = document.getElementById('third-law-list-container');
    if (!container) return;

    if (state.thirdLawRecords.length === 0) {
        container.innerHTML = `<div class="readout-empty-note">Mude r₀ ou v₀ e clique em <strong>Registrar Órbita</strong> para comparar T²/a³ entre diferentes órbitas.</div>`;
        return;
    }

    container.innerHTML = state.thirdLawRecords.map((rec, i) => {
        const ePart = rec.e !== null ? `, e=${rec.e.toFixed(2)}` : '';
        const srcTag = rec.measured ? 'med' : 'teo';
        return `
            <div class="sim-readout-row">
                <span class="sim-readout-label">#${i + 1} (${rec.lawLabel}, a=${rec.a.toFixed(2)}${ePart}):</span>
                <span class="sim-readout-value tone-orange">T=${rec.T.toFixed(2)}a • T²/a³=${rec.ratio.toFixed(3)} (${srcTag})</span>
            </div>
        `;
    }).join('');
}

function createAreaPlot(mode) {
    state.areaPlotMode = mode;
    const titleEl = document.getElementById('areaplot-title');
    if (titleEl) {
        titleEl.textContent = mode === 'accumulated'
            ? 'Relação Tempo × Área: A(t) Linear (2ª Lei)'
            : 'Taxa Areal dA/dt (Constante) vs. Velocidade v(t)';
    }

    if (areaPlot) {
        areaPlot.series = mode === 'accumulated'
            ? [{ id: 'A', label: 'Área A(t)', color: theme.cyan, unit: ' UA²' }]
            : [
                { id: 'dAdt', label: 'dA/dt', color: theme.cyan, unit: '' },
                { id: 'v', label: 'v(t)', color: theme.rose, unit: '' }
            ];
        areaPlot.buffers = {};
        areaPlot.latestValues = {};
        areaPlot.series.forEach(s => {
            areaPlot.buffers[s.id] = [];
            areaPlot.latestValues[s.id] = 0;
        });
        areaPlot.clear();

        // Reproduz o histórico acumulado para visualização imediata ao alternar modo
        telemetryHistory.forEach(sample => {
            if (mode === 'accumulated') {
                areaPlot.push({ A: sample.area }, sample.t);
            } else {
                areaPlot.push({ dAdt: sample.rate, v: sample.v }, sample.t);
            }
        });
    }
}

function setEnergyPlotMode(mode) {
    state.energyPlotMode = mode;
    const titleEl = document.getElementById('energyplot-title');
    if (titleEl) {
        titleEl.textContent = mode === 'phase-space'
            ? 'Retrato de Espaço de Fase Radial (r vs. p_r)'
            : 'Conservação de Energia: K(t), U(t), E(t)';
    }

    if (energyPlot) {
        energyPlot.mode = mode;
        energyPlot.clear();
        telemetryHistory.forEach(sample => {
            if (mode === 'phase-space') {
                energyPlot.pushPhasePoint(sample.r, sample.pr);
            } else {
                energyPlot.push({ K: sample.K, U: sample.U, E: sample.E }, sample.t);
            }
        });
    }
}

function pushTelemetrySample(m) {
    const sample = {
        t: state.time,
        area: state.totalArea,
        rate: m.arealRate,
        v: m.v,
        K: m.K,
        U: m.U,
        E: m.E,
        r: m.r,
        pr: m.pr
    };
    telemetryHistory.push(sample);
    if (telemetryHistory.length > MAX_TELEMETRY_HISTORY) {
        telemetryHistory.shift();
    }

    if (areaPlot) {
        if (state.areaPlotMode === 'accumulated') {
            areaPlot.push({ A: sample.area }, sample.t);
        } else {
            areaPlot.push({ dAdt: sample.rate, v: sample.v }, sample.t);
        }
    }

    if (energyPlot) {
        if (state.energyPlotMode === 'phase-space') {
            energyPlot.pushPhasePoint(sample.r, sample.pr);
        } else {
            energyPlot.push({ K: sample.K, U: sample.U, E: sample.E }, sample.t);
        }
    }
}

// =============================================================================
// 12. CONFIGURAÇÃO DE UI & CONTROLADORES (sim-ui.js)
// =============================================================================
function setupUI() {
    // 1. Modo Foco (F) & Mobile Floating Panel
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: resizeCanvas
    });

    initBottomSheet({
        panelSelector: '.controls-panel',
        triggerSelector: '#btn-mobile-settings'
    });

    focusMirror = initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    initOnboardingModal('#modal-onboarding', {
        triggerSelector: '#btn-open-onboarding'
    });

    // 2. Abas do Painel Lateral
    initTabs('.controls-panel', (tabId) => {
        if (tabId === 'panel-tab-theory') {
            const pane = document.getElementById('panel-tab-theory');
            if (pane) initKaTeXAutoRender(pane);
        }
        if (tabId === 'panel-tab-kepler') {
            setTimeout(() => {
                areaPlot?.resize();
                energyPlot?.resize();
            }, 40);
        }
    });

    // 3. Barra Flutuante de Transporte (Play / Pause / Step / Reset / Velocidade)
    playControl = initToggleButton('#btn-play-sim', (active) => {
        syncRunningUI(active);
    });

    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning) setRunning(false);
        const dtStep = 0.015 * state.speed;
        stepPhysics(dtStep);
        const m = updateReadouts();
        pushTelemetrySample(m);
        updateVisualScene();
    });

    document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
        if (state.isRunning) setRunning(false);
        applyInitialConditions({ resetView: false });
    });

    const speedSteps = [0.25, 0.5, 1.0, 2.0, 4.0];
    const btnSpeed = document.getElementById('btn-speed-cycle');
    if (btnSpeed) {
        btnSpeed.addEventListener('click', () => {
            const idx = speedSteps.indexOf(state.speed);
            const next = speedSteps[(idx + 1) % speedSteps.length];
            state.speed = next;
            btnSpeed.dataset.speed = String(next);
            btnSpeed.textContent = `${next}×`;
        });
    }

function resetPeriodTracking() {
    state.measuredPeriod = null;
    state.unwrappedAngle = 0.0;
    state.lapCount = 0;
    state.lastLapTime = state.time;
    const r = Math.hypot(body.x, body.y);
    state.rMinObserved = r;
    state.rMaxObserved = r;
}

    // 4. Presets Orbitais & Progressão de Referenciais (1. m₁ | 2. m₂ | 3. CM)
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });

    document.querySelectorAll('[data-frame]').forEach(btn => {
        btn.addEventListener('click', () => {
            setFrame(btn.dataset.frame, { refit: true });
        });
    });

    document.querySelectorAll('[data-mass-ratio]').forEach(btn => {
        btn.addEventListener('click', () => {
            const ratio = parseFloat(btn.dataset.massRatio);
            const newM2 = Math.min(3.0, Math.max(0.0, Number((state.centralMass * ratio).toFixed(2))));
            state.secondaryMass = newM2;
            sliderCtrls.m2?.setValue(newM2, false);
            resetPeriodTracking();
            const f = computeCentralForce(body.x, body.y, body.hConst);
            body.ax = f.ax;
            body.ay = f.ay;
            recomputeTrajectoryPreview();
            syncForceHints();
            renderSectorsComparisonList();
            updateReadouts();
            if (state.frame === 'cm' && state.cameraMode === 'fit') fitOrbitToCanvas();
            else updateVisualScene();
        });
    });

    // 5. Seletor de Lei de Força Central & Atalhos de Bertrand
    document.getElementById('select-force-law')?.addEventListener('change', (e) => {
        const prevLaw = state.forceLaw;
        state.forceLaw = e.target.value;
        updateForceParamBlocksVisibility();
        updateBertrandButtons();
        clearPresetHighlight();

        // Em força repulsiva, ângulo voltado ao centro gera deflexão hiperbólica mais didática;
        // ao sair de repulsiva para uma lei atrativa, restaura órbita elíptica ligada
        if (state.forceLaw === 'repulsive' && Math.abs(state.gammaDeg) < 10) {
            state.r0 = 2.00;
            state.v0 = 5.60;
            state.gammaDeg = -55;
            sliderCtrls.r0?.setValue(state.r0, false);
            sliderCtrls.v0?.setValue(state.v0, false);
            sliderCtrls.gamma?.setValue(state.gammaDeg, false);
        } else if (prevLaw === 'repulsive' && state.forceLaw !== 'repulsive') {
            state.r0 = 1.60;
            state.v0 = Number(Math.PI.toFixed(2));
            state.gammaDeg = 0;
            sliderCtrls.r0?.setValue(state.r0, false);
            sliderCtrls.v0?.setValue(state.v0, false);
            sliderCtrls.gamma?.setValue(state.gammaDeg, false);
        }
        applyInitialConditions({ resetView: true });
    });

    document.querySelectorAll('[data-bertrand]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.forceLaw = 'power';
            state.exponentN = parseFloat(btn.dataset.bertrand);
            sliderCtrls.exponent?.setValue(state.exponentN, false);
            updateBertrandButtons();
            clearPresetHighlight();
            applyInitialConditions({ resetView: false });
        });
    });

    // 6. Sliders Duplos Sincronizados (.sim-dual-slider)
    sliderCtrls.exponent = syncDualSlider('#slider-exponent', '#num-exponent', (val) => {
        state.exponentN = val;
        updateBertrandButtons();
        clearPresetHighlight();
        applyInitialConditions({ resetView: false });
    });

    sliderCtrls.gr = syncDualSlider('#slider-gr', '#num-gr', (val) => {
        state.grAlpha = val;
        resetPeriodTracking();
        recomputeTrajectoryPreview();
        syncForceHints();
        updateReadouts();
        updateVisualScene();
    });

    sliderCtrls.yukawa = syncDualSlider('#slider-yukawa', '#num-yukawa', (val) => {
        state.yukawaLambda = val;
        resetPeriodTracking();
        recomputeTrajectoryPreview();
        syncForceHints();
        updateReadouts();
        updateVisualScene();
    });

    sliderCtrls.mu = syncDualSlider('#slider-mu', '#num-mu', (val) => {
        state.centralMass = val;
        resetPeriodTracking();
        const f = computeCentralForce(body.x, body.y, body.hConst);
        body.ax = f.ax;
        body.ay = f.ay;
        recomputeTrajectoryPreview();
        syncForceHints();
        renderSectorsComparisonList();
        updateReadouts();
        updateVisualScene();
    });

    sliderCtrls.m2 = syncDualSlider('#slider-m2', '#num-m2', (val) => {
        state.secondaryMass = val;
        resetPeriodTracking();
        const f = computeCentralForce(body.x, body.y, body.hConst);
        body.ax = f.ax;
        body.ay = f.ay;
        recomputeTrajectoryPreview();
        syncForceHints();
        renderSectorsComparisonList();
        updateReadouts();
        updateVisualScene();
    });

    sliderCtrls.r0 = syncDualSlider('#slider-distancia', '#num-distancia', (val) => {
        state.r0 = val;
        clearPresetHighlight();
        applyInitialConditions({ resetView: false });
    });

    sliderCtrls.v0 = syncDualSlider('#slider-velocidade', '#num-velocidade', (val) => {
        state.v0 = val;
        clearPresetHighlight();
        applyInitialConditions({ resetView: false });
    });

    sliderCtrls.gamma = syncDualSlider('#slider-angulo', '#num-angulo', (val) => {
        state.gammaDeg = val;
        clearPresetHighlight();
        applyInitialConditions({ resetView: false });
    });

    sliderCtrls.sectorDt = syncDualSlider('#slider-sector-dt', '#num-sector-dt', (val) => {
        state.sectorDt = val;
        updateCaptureButtonUI();
        updateReadouts();
    });

    // 7. Switches de Camadas Visuais (todos invocam updateVisualScene imediatamente!)
    const bindSwitch = (id, key, afterFn = null) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            state[key] = e.target.checked;
            if (afterFn) afterFn(e.target.checked);
            updateVisualScene();
        });
    };

    bindSwitch('show-velocity', 'showVelocity');
    bindSwitch('show-force', 'showForce');
    bindSwitch('show-position', 'showPosition');
    bindSwitch('show-preview', 'showPreview', () => recomputeTrajectoryPreview());
    bindSwitch('show-orbit-trail', 'showTrail');
    bindSwitch('toggle-long-trail', 'longTrail');
    bindSwitch('show-grid', 'showGrid');
    bindSwitch('show-kepler-geometry', 'showKeplerGeometry');
    bindSwitch('show-lrl-vector', 'showLrlVector');
    bindSwitch('switch-auto-sectors', 'autoSectors', (enabled) => {
        if (enabled && !state.activeSector && state.isRunning) {
            startSectorCapture(true);
        }
    });

    // 8. Ações da 2ª e 3ª Leis de Kepler
    document.getElementById('btn-capture-sector')?.addEventListener('click', () => {
        startSectorCapture(false);
    });

    document.getElementById('btn-clear-sectors')?.addEventListener('click', () => {
        clearAllSectors();
    });

    document.getElementById('btn-record-third-law')?.addEventListener('click', () => {
        recordThirdLawOrbit();
    });

    document.getElementById('btn-clear-third-law')?.addEventListener('click', () => {
        state.thirdLawRecords = [];
        renderThirdLawTable();
    });

    // 9. Gráficos Multicanal (MultiSeriesPlot — com Tela Cheia e Manter Registros nativos)
    areaPlot = new MultiSeriesPlot('#canvas-area-plot', {
        maxPoints: 140,
        mode: 'time-series',
        title: 'Relação Tempo × Área (2ª Lei de Kepler)',
        series: [
            { id: 'A', label: 'Área A(t)', color: theme.cyan, unit: ' UA²' }
        ],
        showLegend: true,
        showGrid: true
    });

    document.querySelectorAll('#areaplot-mode-selector .segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#areaplot-mode-selector .segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            createAreaPlot(btn.dataset.areaMode || 'accumulated');
        });
    });

    energyPlot = new MultiSeriesPlot('#canvas-energy-plot', {
        maxPoints: 140,
        mode: 'time-series',
        title: 'Conservação de Energia & Espaço de Fase Radial',
        series: [
            { id: 'K', label: 'Cinética K', color: theme.rose, unit: '' },
            { id: 'U', label: 'Potencial U', color: theme.cyan, unit: '' },
            { id: 'E', label: 'Total E', color: theme.emerald, unit: '' }
        ],
        showLegend: true,
        showGrid: true
    });

    document.querySelectorAll('#energyplot-mode-selector .segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#energyplot-mode-selector .segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setEnergyPlotMode(btn.dataset.plotMode || 'time-series');
        });
    });
}

// =============================================================================
// 13. LOOP PRINCIPAL DE ANIMAÇÃO
// =============================================================================
let lastFrameTime = performance.now();
let telemetryTick = 0;

function animate(now) {
    requestAnimationFrame(animate);

    if (document.hidden) {
        lastFrameTime = now;
        return;
    }

    const elapsedReal = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    if (state.isRunning) {
        const simDt = elapsedReal * YEARS_PER_REAL_SEC * state.speed;
        stepPhysics(simDt);
        const metrics = updateReadouts();

        if (++telemetryTick % 2 === 0) {
            pushTelemetrySample(metrics);
        }
        updateVisualScene();
    }
}

// =============================================================================
// 14. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    theme = readThemeTokens();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupPointerEvents();
    setupUI();
    applyPreset('eliptica');
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});
