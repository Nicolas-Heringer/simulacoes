// =============================================================================
// Autor: Nicolas Heringer
// Design System & Laboratório de Interface (UI Lab) — Fonte da Verdade Canônica
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    getSVGContent,
    setElementIcon,
    inlineSVGImages,
    setGlobalAccent,
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    MultiSeriesPlot,
    openPlotFullscreenModal,
    initModal,
    initOnboardingModal,
    initOnboardingQRCode,
    getCanonicalSimulationUrl,
    initSidebarCollapse,
    initTabs,
    initViewportFix,
    initBottomSheet,
    initFocusMirrorToolbar,
    renderMath,
    renderMathToString,
    initKaTeXAutoRender,
    det2x2,
    trace2x2,
    eigen2x2,
    det3x3,
    trace3x3,
    solveEigenvaluesSymmetric3x3,
    diagonalizeSymmetric3x3,
    MatrixTensorEditor,
    setFieldState,
    getTheme,
    getThemeColors,
    setTheme,
    toggleTheme,
    onThemeChange,
    initThemeToggle
} from './sim-ui.js';

// Re-exporta todos os controladores e utilitários para retrocompatibilidade
export {
    getSVGContent,
    setElementIcon,
    inlineSVGImages,
    setGlobalAccent,
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    MultiSeriesPlot,
    openPlotFullscreenModal,
    initModal,
    initOnboardingModal,
    initOnboardingQRCode,
    getCanonicalSimulationUrl,
    initSidebarCollapse,
    initTabs,
    initViewportFix,
    initBottomSheet,
    initFocusMirrorToolbar,
    renderMath,
    renderMathToString,
    initKaTeXAutoRender,
    det2x2,
    trace2x2,
    eigen2x2,
    det3x3,
    trace3x3,
    solveEigenvaluesSymmetric3x3,
    diagonalizeSymmetric3x3,
    MatrixTensorEditor,
    setFieldState,
    getTheme,
    getThemeColors,
    setTheme,
    toggleTheme,
    onThemeChange,
    initThemeToggle
};

// Catálogo Canônico Completo: 75 Ícones Vetoriais SVG em assets/icons/
const ICONS_LIST = [
    // Transporte, Navegação & UI (19)
    'play', 'pause', 'step', 'refresh', 'refresh-cw', 'rotate',
    'camera-reset', 'stopwatch', 'collapse', 'expand', 'focus',
    'arrow-left', 'chevron-right', 'sliders', 'gear', 'toggle-switch',
    'chart-line', 'book-open', 'book',
    // Auxiliares & Presets (3)
    'sparkles', 'lightbulb', 'dice',
    // Dispositivos, Mouse, Teclado & Gestos Táteis (17)
    'mouse', 'mouse-left', 'mouse-right', 'mouse-wheel', 'mouse-scroll',
    'mouse-drag-horizontal', 'keyboard', 'key', 'smartphone', 'mobile',
    'tablet', 'touch', 'touch-drag', 'touch-pan', 'touch-pinch',
    'pinch', 'screen-rotate',
    // Clima, Geofísica, Ecologia & Termodinâmica (11)
    'globe', 'sun', 'moon', 'snowflake', 'leaf', 'flower',
    'thermometer', 'cyclone', 'wind', 'gauge', 'pressure',
    // Mecânica, Oscilações, Ondas, Óptica & Eletromagnetismo (11)
    'gravity-fall', 'motion-oscillate', 'spring', 'pendulum',
    'wave-sine', 'fft-bars', 'prism', 'dipole', 'magnetic-field',
    'electron-drift', 'orbital',
    // Álgebra Linear, Tensores & Geometria (4)
    'compass', 'axis-3d', 'matrix-basis', 'chladni-plate',
    // Dinâmica de Partículas & Redes Cristalinas (10)
    'particle-single', 'particle-moving', 'particles-double', 'particles-opposite',
    'particles-three', 'particle-circle', 'particle-grid', 'salt-nacl',
    'radial-inward', 'radial-outward'
];

let scene, camera, renderer, controls;
let currentMesh = null, wireMesh = null, pointsMesh = null;
let testLight = null;

// Relógio da Simulação e Variáveis de Controle
let simTime = 0.0;
let isSimRunning = false;
let simTimeScale = 1.0;
let plotInstance = null;
let multiPlotInstance = null;
let playControl = null;

const container = document.getElementById('three-container');

function initThreeScene() {
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.id = 'simulationCanvas';
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    testLight = new THREE.DirectionalLight(0xfacc15, 2.5);
    testLight.position.set(5, 5, 5);
    scene.add(testLight);

    buildMeshGeometry('sphere', 1.0, 16);

    window.addEventListener('resize', onWindowResize);
}

function buildMeshGeometry(type, radius, steps) {
    if (currentMesh) scene.remove(currentMesh);
    if (wireMesh) scene.remove(wireMesh);
    if (pointsMesh) scene.remove(pointsMesh);

    let geom;
    if (type === 'sphere') {
        geom = new THREE.SphereGeometry(radius, steps, steps);
    } else if (type === 'cube') {
        geom = new THREE.BoxGeometry(radius * 1.5, radius * 1.5, radius * 1.5, steps, steps, steps);
    } else if (type === 'torus') {
        geom = new THREE.TorusGeometry(radius, radius * 0.35, steps, steps);
    } else if (type === 'cylinder') {
        geom = new THREE.CylinderGeometry(radius, radius, radius * 1.8, steps);
    } else {
        geom = new THREE.IcosahedronGeometry(radius, Math.min(steps, 4));
    }

    const material = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.35,
        metalness: 0.2,
    });
    currentMesh = new THREE.Mesh(geom, material);
    scene.add(currentMesh);

    const wireMat = new THREE.MeshBasicMaterial({ color: 0x64748b, wireframe: true });
    wireMesh = new THREE.Mesh(geom, wireMat);
    scene.add(wireMesh);

    const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--stage-accent').trim() || '#facc15';
    const ptsMat = new THREE.PointsMaterial({ color: accentHex, size: 0.035 });
    pointsMesh = new THREE.Points(geom, ptsMat);
    scene.add(pointsMesh);

    const swWire = document.getElementById('switch-demo-wireframe');
    if (swWire) wireMesh.visible = swWire.checked;

    const swPts = document.getElementById('switch-demo-points');
    if (swPts) pointsMesh.visible = swPts.checked;

    const swLight = document.getElementById('switch-demo-light');
    if (swLight && testLight) testLight.visible = swLight.checked;
}

function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}

function animate() {
    requestAnimationFrame(animate);

    if (document.hidden) return;

    if (controls) controls.update();

    // Telemetria do Rodapé e Avanço Temporal (Só avança e alimenta gráficos quando isSimRunning === true)
    const rad = parseFloat(document.getElementById('slider-demo-radius')?.value || 1.0);
    if (isSimRunning) {
        simTime += 0.016 * simTimeScale;
        if (currentMesh) {
            currentMesh.rotation.y += 0.005 * simTimeScale;
            if (wireMesh) wireMesh.rotation.y = currentMesh.rotation.y;
            if (pointsMesh) pointsMesh.rotation.y = currentMesh.rotation.y;
        }

        // 1. Alimentação contínua do Mini-Gráfico Canal Único (RealtimePlot)
        if (plotInstance) {
            const waveVal = Math.sin(simTime * 3) * rad * 0.8 + (Math.cos(simTime * 7) * 0.2);
            plotInstance.push(waveVal, simTime);

            const valSpan = document.getElementById('plot-current-val');
            if (valSpan) {
                valSpan.textContent = `${(waveVal * 1.5).toFixed(2)} rad/s`;
            }
        }

        // 2. Alimentação do MultiSeriesPlot (Série Temporal K, U, E e Espaço de Fase x, p)
        if (multiPlotInstance) {
            const x = rad * Math.cos(simTime * 2.2);
            const p = -rad * Math.sin(simTime * 2.2);
            const E = 12.5 * (rad * rad);
            const K = E * (Math.sin(simTime * 2.2) ** 2);
            const U = E - K;

            if (multiPlotInstance.mode === 'phase-space') {
                multiPlotInstance.pushPhasePoint(x, p);
            } else {
                multiPlotInstance.push({ K, U, E }, simTime);
            }

            const kReadout = document.getElementById('readout-demo-k');
            const uReadout = document.getElementById('readout-demo-u');
            if (kReadout) kReadout.textContent = `${K.toFixed(2)} J`;
            if (uReadout) uReadout.textContent = `${U.toFixed(2)} J`;
        }
    }

    const timerSpan = document.getElementById('footer-sim-timer');
    if (timerSpan) {
        timerSpan.textContent = `t = ${simTime.toFixed(2)}s`;
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// =============================================================================
// WORKBENCH DE ESQUEMA DE CORES (CLARO & ESCURO — REGRA 90/10)
// =============================================================================

const COMPONENT_TARGETS = ['nav', 'btn', 'card', 'slider', 'switch', 'hud', 'divider', 'text'];

const SWATCH_SLOTS = {
    light: ['#b45309', '#0369a1', '#0f766e', '#1e1b4b', '#be123c'],
    dark:  ['#facc15', '#38bdf8', '#2dd4bf', '#818cf8', '#fb7185']
};

const NEUTRAL_TOKENS = {
    light: { default: '#18181b', divider: '#475569' },
    dark:  { default: '#e2e8f0', divider: '#94a3b8' }
};

const SURFACE_PRESETS = {
    light: {
        slate:   { bgMain: '#e2e8f0', bgSurface: '#ffffff', bgPanel: '#f1f5f9', bgCard: '#ffffff', bgRecessed: '#f8fafc' },
        neutral: { bgMain: '#e4e4e7', bgSurface: '#ffffff', bgPanel: '#f4f4f5', bgCard: '#ffffff', bgRecessed: '#fafafa' },
        warm:    { bgMain: '#e7e5e4', bgSurface: '#fafaf9', bgPanel: '#f5f5f4', bgCard: '#ffffff', bgRecessed: '#fafaf9' }
    },
    dark: {
        slate:   { bgMain: '#070b16', bgSurface: '#0f172a', bgPanel: 'rgba(15, 23, 42, 0.80)', bgCard: 'rgba(30, 41, 59, 0.65)', bgRecessed: 'rgba(0, 0, 0, 0.35)' },
        neutral: { bgMain: '#09090b', bgSurface: '#18181b', bgPanel: 'rgba(24, 24, 27, 0.85)', bgCard: 'rgba(39, 39, 42, 0.65)', bgRecessed: 'rgba(0, 0, 0, 0.40)' },
        warm:    { bgMain: '#0c0a09', bgSurface: '#1c1917', bgPanel: 'rgba(28, 25, 23, 0.85)', bgCard: 'rgba(41, 37, 36, 0.65)', bgRecessed: 'rgba(0, 0, 0, 0.40)' }
    }
};

const BORDER_PRESETS = {
    light: {
        subtle:  { width: '1px',   borderColor: '#cbd5e1', borderSubtle: '#e2e8f0', borderStrong: '#94a3b8' },
        defined: { width: '1.5px', borderColor: '#94a3b8', borderSubtle: '#cbd5e1', borderStrong: '#64748b' },
        strong:  { width: '1.5px', borderColor: '#64748b', borderSubtle: '#94a3b8', borderStrong: '#334155' }
    },
    dark: {
        subtle:  { width: '1px',   borderColor: 'rgba(255, 255, 255, 0.10)', borderSubtle: 'rgba(255, 255, 255, 0.06)', borderStrong: 'rgba(255, 255, 255, 0.22)' },
        defined: { width: '1.5px', borderColor: 'rgba(255, 255, 255, 0.18)', borderSubtle: 'rgba(255, 255, 255, 0.11)', borderStrong: 'rgba(255, 255, 255, 0.32)' },
        strong:  { width: '1.5px', borderColor: 'rgba(255, 255, 255, 0.28)', borderSubtle: 'rgba(255, 255, 255, 0.18)', borderStrong: 'rgba(255, 255, 255, 0.45)' }
    }
};

const PALETTE_PRESETS = {
    ouro: {
        light: {
            global: '#b45309',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { nav: 'neutral', divider: 'neutral' }
        },
        dark: {
            global: '#facc15',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { divider: 'neutral' }
        }
    },
    azul: {
        light: {
            global: '#0369a1',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { nav: 'neutral', card: '#b45309', divider: 'neutral' }
        },
        dark: {
            global: '#38bdf8',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { card: '#facc15', divider: 'neutral' }
        }
    },
    petroleo: {
        light: {
            global: '#0f766e',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { nav: 'neutral', divider: 'neutral' }
        },
        dark: {
            global: '#2dd4bf',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { divider: 'neutral' }
        }
    },
    indigo: {
        light: {
            global: '#1e1b4b',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { nav: 'neutral', divider: 'neutral' }
        },
        dark: {
            global: '#818cf8',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { divider: 'neutral' }
        }
    },
    grafite: {
        light: {
            global: '#1e1b4b',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { hud: '#0369a1', divider: 'neutral' }
        },
        dark: {
            global: '#e2e8f0',
            surface: 'warm',
            borders: 'strong',
            dividers: 'clean',
            overrides: { hud: '#38bdf8', divider: 'neutral' }
        }
    }
};

function createThemeStateFromPreset(presetId, mode) {
    const p = PALETTE_PRESETS[presetId]?.[mode] || PALETTE_PRESETS.grafite[mode];
    const components = {};
    COMPONENT_TARGETS.forEach(t => {
        components[t] = p.overrides?.[t] || 'auto';
    });
    return {
        paletteId: presetId,
        global: p.global,
        surface: p.surface,
        borders: p.borders,
        dividers: p.dividers,
        components
    };
}

const workbenchState = {
    light: createThemeStateFromPreset('grafite', 'light'),
    dark:  createThemeStateFromPreset('indigo', 'dark')
};

function resolveComponentColor(mode, state, target) {
    if (target === 'global') {
        return state.global === 'neutral' ? NEUTRAL_TOKENS[mode].default : state.global;
    }
    const val = state.components[target] || 'auto';
    if (val === 'auto') {
        return state.global === 'neutral' ? NEUTRAL_TOKENS[mode].default : state.global;
    }
    if (val === 'neutral') {
        return target === 'divider' ? NEUTRAL_TOKENS[mode].divider : NEUTRAL_TOKENS[mode].default;
    }
    return val;
}

function applyWorkbenchStateToDOM() {
    const mode = getTheme();
    const state = workbenchState[mode];
    const root = document.documentElement;

    // 1. Superfície
    const surf = SURFACE_PRESETS[mode][state.surface] || SURFACE_PRESETS[mode].slate;
    root.style.setProperty('--bg-main', surf.bgMain);
    root.style.setProperty('--bg-surface', surf.bgSurface);
    root.style.setProperty('--bg-panel', surf.bgPanel);
    root.style.setProperty('--bg-card', surf.bgCard);
    root.style.setProperty('--bg-recessed', surf.bgRecessed);

    // 2. Contornos / Bordas
    const brd = BORDER_PRESETS[mode][state.borders] || BORDER_PRESETS[mode].defined;
    root.style.setProperty('--ui-border-width', brd.width);
    root.style.setProperty('--border-color', brd.borderColor);
    root.style.setProperty('--border-subtle', brd.borderSubtle);
    root.style.setProperty('--border-strong', brd.borderStrong);

    // 3. Estilo de Divisores
    root.setAttribute('data-divider-style', state.dividers || 'clean');

    // 4. Cor Global + Componentes
    const globalColor = resolveComponentColor(mode, state, 'global');
    root.style.setProperty('--accent-color', globalColor);
    root.style.setProperty('--accent-color-hover', globalColor);
    root.style.setProperty('--accent-fg', mode === 'light' ? '#ffffff' : '#0c0a09');

    COMPONENT_TARGETS.forEach(target => {
        const resolved = resolveComponentColor(mode, state, target);
        root.style.setProperty(`--accent-${target}`, resolved);
    });

    // Mantém os elementos 3D do palco escuro (luz direcional e vértices da geometria)
    // fixos nos tokens do palco (--stage-accent), sem alterar com o tema claro/escuro da UI.
    if (plotInstance) plotInstance.render();
    if (multiPlotInstance) multiPlotInstance.render();

    syncWorkbenchControlsUI();
}

function syncWorkbenchControlsUI() {
    const mode = getTheme();
    const state = workbenchState[mode];
    const slots = SWATCH_SLOTS[mode];

    const modeBadge = document.getElementById('workbench-mode-badge');
    if (modeBadge) {
        modeBadge.textContent = mode === 'light' ? 'Modo Claro' : 'Modo Escuro';
    }

    // Atualiza dots da barra rápida superior
    document.querySelectorAll('.theme-dot-btn').forEach(dot => {
        const pid = dot.getAttribute('data-palette-id');
        if (pid && PALETTE_PRESETS[pid]) {
            const c = PALETTE_PRESETS[pid][mode].global;
            dot.style.background = c;
            dot.setAttribute('data-color', c);
            dot.classList.toggle('active', state.paletteId === pid);
        }
    });

    // Atualiza botões das 5 paletas base
    document.querySelectorAll('.palette-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-palette') === state.paletteId);
    });

    // Atualiza pílulas de estrutura
    ['surface', 'borders', 'dividers'].forEach(key => {
        const group = document.querySelector(`.structure-pill-group[data-structure="${key}"]`);
        if (!group) return;
        group.querySelectorAll('.structure-pill-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-val') === state[key]);
        });
    });

    // Atualiza grupos de cores por componente
    document.querySelectorAll('.color-dots-group').forEach(group => {
        const target = group.getAttribute('data-target');
        const currentSetting = target === 'global' ? state.global : (state.components[target] || 'auto');
        const resolvedHex = resolveComponentColor(mode, state, target);

        // Atualiza os 5 dots com as cores calibradas do modo atual (Claro vs Escuro)
        group.querySelectorAll('.color-dot[data-slot]').forEach(dot => {
            const idx = Number(dot.getAttribute('data-slot'));
            const slotColor = slots[idx] || slots[0];
            dot.style.setProperty('--c', slotColor);
            dot.setAttribute('data-color', slotColor);
            dot.classList.toggle(
                'active',
                currentSetting !== 'auto' &&
                currentSetting !== 'neutral' &&
                currentSetting.toLowerCase() === slotColor.toLowerCase()
            );
        });

        const inheritBtn = group.querySelector('.color-dot-inherit');
        if (inheritBtn) {
            inheritBtn.classList.toggle('active', currentSetting === 'auto');
        }

        const neutralBtn = group.querySelector('.color-dot-neutral');
        if (neutralBtn) {
            neutralBtn.classList.toggle('active', currentSetting === 'neutral');
        }

        const picker = group.querySelector('.color-picker-input');
        if (picker && resolvedHex.startsWith('#') && resolvedHex.length === 7) {
            picker.value = resolvedHex;
        }
    });
}

function applyPalettePreset(paletteId) {
    const mode = getTheme();
    if (!PALETTE_PRESETS[paletteId]) return;
    workbenchState[mode] = createThemeStateFromPreset(paletteId, mode);
    applyWorkbenchStateToDOM();
}

function buildExportCSS() {
    const formatModeBlock = (mode, selector) => {
        const st = workbenchState[mode];
        const surf = SURFACE_PRESETS[mode][st.surface];
        const brd = BORDER_PRESETS[mode][st.borders];
        const globalCol = resolveComponentColor(mode, st, 'global');
        const accentFg = mode === 'light' ? '#ffffff' : '#0c0a09';
        const lines = [
            `${selector} {`,
            `    /* Paleta Base: ${st.paletteId} | Superfície: ${st.surface} | Bordas: ${st.borders} | Divisores: ${st.dividers} */`,
            `    --bg-main: ${surf.bgMain};`,
            `    --bg-surface: ${surf.bgSurface};`,
            `    --bg-panel: ${surf.bgPanel};`,
            `    --bg-card: ${surf.bgCard};`,
            `    --bg-recessed: ${surf.bgRecessed};`,
            `    --ui-border-width: ${brd.width};`,
            `    --border-color: ${brd.borderColor};`,
            `    --border-subtle: ${brd.borderSubtle};`,
            `    --border-strong: ${brd.borderStrong};`,
            `    --accent-color: ${globalCol};`,
            `    --accent-color-hover: ${globalCol};`,
            `    --accent-fg: ${accentFg};`
        ];
        COMPONENT_TARGETS.forEach(t => {
            const val = st.components[t];
            if (val && val !== 'auto') {
                lines.push(`    --accent-${t}: ${resolveComponentColor(mode, st, t)};`);
            }
        });
        lines.push(`}`);
        return lines.join('\n');
    };

    const currentDivStyle = workbenchState[getTheme()]?.dividers || 'clean';
    const dividerComment = currentDivStyle === 'clean'
        ? `/* Divisores padrão (Limpo): sem necessidade de atributo extra em <html> */`
        : `/* Divisores (${currentDivStyle}): aplique data-divider-style="${currentDivStyle}" no elemento <html> */`;

    return `${dividerComment}\n\n${formatModeBlock('dark', ':root')}\n\n${formatModeBlock('light', ':root[data-theme="light"]')}`;
}

function setupListeners() {
    // --- CONTROLE DE MODO FOCO / RECOLHIMENTO DA SIDEBAR (DESKTOP) ---
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    // --- CONTROLE DE PAINEL FLUTUANTE MOBILE (MOBILE & TABLETS <= 900PX) ---
    initBottomSheet({
        panelSelector: '.controls-panel',
        triggerSelector: '#btn-mobile-settings',
        defaultState: 'peek'
    });

    // --- DIAGNÓSTICO DE VIEWPORT MOBILE EM TEMPO REAL (ABA 4) ---
    initViewportFix((metrics) => {
        const elInner = document.getElementById('vp-diag-inner');
        const elVisual = document.getElementById('vp-diag-visual');
        const elDvh = document.getElementById('vp-diag-dvh');
        const elSafeBottom = document.getElementById('vp-diag-safe-bottom');
        const elKeyboard = document.getElementById('vp-diag-keyboard');

        if (elInner) elInner.textContent = `${metrics.innerWidth} × ${metrics.innerHeight} px`;
        if (elVisual) elVisual.textContent = `${metrics.visualWidth} × ${metrics.visualHeight} px`;
        if (elDvh) {
            elDvh.textContent = metrics.supportsDvh ? 'Suportado (100dvh ativo)' : 'Fallback JS (--app-height)';
            elDvh.className = `sim-readout-value ${metrics.supportsDvh ? 'tone-emerald' : 'tone-orange'}`;
        }
        if (elSafeBottom) elSafeBottom.textContent = metrics.safeBottom || '0px';
        if (elKeyboard) {
            elKeyboard.textContent = metrics.keyboardOpen ? 'Aberto (.is-keyboard-open)' : 'Recolhido';
            elKeyboard.className = `sim-readout-value ${metrics.keyboardOpen ? 'tone-orange' : 'tone-emerald'}`;
        }
    });

    // --- NAVEGAÇÃO ENTRE ABAS DO LABORATÓRIO (via initTabs) ---
    const tabLabels = {
        'panel-ui-buttons': 'Botões & Presets',
        'panel-ui-sliders': 'Sliders & Entradas',
        'panel-ui-switches': 'Switches & Toggles',
        'panel-ui-huds': 'HUDs & LaTeX',
        'panel-ui-icons': 'Galeria de Ícones'
    };

    initTabs(document, (tabId) => {
        const hudActiveComp = document.getElementById('hud-active-comp');
        if (hudActiveComp && tabLabels[tabId]) {
            hudActiveComp.textContent = tabLabels[tabId];
        }

        if (tabId === 'panel-ui-huds') {
            setTimeout(() => {
                if (plotInstance) plotInstance.resize();
                if (multiPlotInstance) multiPlotInstance.resize();
            }, 50);
        }
    });

    // --- BARRA DE TEMAS FLUTUANTE (CANVAS) & WORKBENCH DE CORES ---
    document.querySelectorAll('.theme-dot-btn').forEach(dot => {
        dot.addEventListener('click', () => {
            const pid = dot.getAttribute('data-palette-id');
            if (pid) applyPalettePreset(pid);
        });
    });

    document.querySelectorAll('.palette-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pid = btn.getAttribute('data-palette');
            if (pid) applyPalettePreset(pid);
        });
    });

    document.querySelectorAll('.structure-pill-group').forEach(group => {
        const structKey = group.getAttribute('data-structure');
        group.querySelectorAll('.structure-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = getTheme();
                workbenchState[mode][structKey] = btn.getAttribute('data-val');
                applyWorkbenchStateToDOM();
            });
        });
    });

    // --- POPOVER DE CORES AVANÇADO (CUSTOMIZAÇÃO POR COMPONENTE) ---
    const btnOpenTooltip = document.getElementById('btn-toggle-color-tooltip');
    const btnCloseTooltip = document.getElementById('btn-close-color-tooltip');
    const colorTooltip = document.getElementById('color-customizer-tooltip');

    if (btnOpenTooltip && colorTooltip) {
        btnOpenTooltip.addEventListener('click', (e) => {
            e.stopPropagation();
            colorTooltip.classList.toggle('hidden');
        });

        if (btnCloseTooltip) {
            btnCloseTooltip.addEventListener('click', () => {
                colorTooltip.classList.add('hidden');
            });
        }

        // Mantém o Workbench aberto enquanto o usuário testa abas, controles do painel lateral
        // ou alterna entre Modo Claro e Modo Escuro no cabeçalho; fecha ao clicar no ✕,
        // no botão de toggle da barra ou diretamente sobre o palco 3D (#simulationCanvas).
        document.addEventListener('click', (e) => {
            if (e.target && (e.target.id === 'simulationCanvas' || e.target === renderer?.domElement)) {
                colorTooltip.classList.add('hidden');
            }
        });
    }

    // Gerenciador dos pontos de cor, Auto, Neutro e Color Picker livre do Popover
    document.querySelectorAll('.color-dots-group').forEach(group => {
        const targetComponent = group.getAttribute('data-target');

        const inheritBtn = group.querySelector('.color-dot-inherit');
        if (inheritBtn) {
            inheritBtn.addEventListener('click', () => {
                const mode = getTheme();
                if (targetComponent !== 'global') {
                    workbenchState[mode].components[targetComponent] = 'auto';
                    applyWorkbenchStateToDOM();
                }
            });
        }

        const neutralBtn = group.querySelector('.color-dot-neutral');
        if (neutralBtn) {
            neutralBtn.addEventListener('click', () => {
                const mode = getTheme();
                if (targetComponent === 'global') {
                    workbenchState[mode].global = 'neutral';
                    workbenchState[mode].paletteId = 'custom';
                } else {
                    workbenchState[mode].components[targetComponent] = 'neutral';
                }
                applyWorkbenchStateToDOM();
            });
        }

        group.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const mode = getTheme();
                const color = dot.getAttribute('data-color');
                if (!color) return;
                if (targetComponent === 'global') {
                    workbenchState[mode].global = color;
                    workbenchState[mode].paletteId = 'custom';
                } else {
                    workbenchState[mode].components[targetComponent] = color;
                }
                applyWorkbenchStateToDOM();
            });
        });

        const picker = group.querySelector('.color-picker-input');
        if (picker) {
            picker.addEventListener('input', () => {
                const mode = getTheme();
                const color = picker.value;
                if (targetComponent === 'global') {
                    workbenchState[mode].global = color;
                    workbenchState[mode].paletteId = 'custom';
                } else {
                    workbenchState[mode].components[targetComponent] = color;
                }
                applyWorkbenchStateToDOM();
            });
        }
    });

    // Botão Copiar Tokens CSS
    const btnCopyTokens = document.getElementById('btn-copy-theme-tokens');
    const btnCopyTokensText = document.getElementById('btn-copy-theme-tokens-text');
    if (btnCopyTokens) {
        btnCopyTokens.addEventListener('click', async () => {
            const cssText = buildExportCSS();
            try {
                await navigator.clipboard.writeText(cssText);
                if (btnCopyTokensText) {
                    const prev = btnCopyTokensText.textContent;
                    btnCopyTokensText.textContent = 'Tokens Copiados!';
                    setTimeout(() => { btnCopyTokensText.textContent = prev; }, 2000);
                }
            } catch {
                console.log(cssText);
            }
        });
    }

    // Botão de Reset de Todas as Cores do Modo Atual
    const btnResetColors = document.getElementById('btn-reset-all-colors');
    if (btnResetColors) {
        btnResetColors.addEventListener('click', () => {
            const mode = getTheme();
            const defaultPreset = mode === 'light' ? 'grafite' : 'indigo';
            workbenchState[mode] = createThemeStateFromPreset(defaultPreset, mode);
            applyWorkbenchStateToDOM();
        });
    }

    // Reaplica automaticamente o estado correspondente ao alternar entre Claro e Escuro
    onThemeChange(() => {
        applyWorkbenchStateToDOM();
    });
    applyWorkbenchStateToDOM();

    // --- BARRA FLUTUANTE DE TRANSPORTE / REPRODUÇÃO ---
    playControl = initToggleButton('#btn-demo-primary', (active) => {
        isSimRunning = active;

        const headerBadge = document.getElementById('header-status-badge');
        const footerText = document.getElementById('footer-status-text');

        if (active) {
            if (headerBadge) {
                headerBadge.classList.remove('idle');
                headerBadge.innerHTML = '<span class="status-dot"></span><span>Executando</span>';
            }
            if (footerText) footerText.textContent = 'Simulação Ativa';
        } else {
            if (headerBadge) {
                headerBadge.classList.add('idle');
                headerBadge.innerHTML = '<span class="status-dot"></span><span>Pausado</span>';
            }
            if (footerText) footerText.textContent = 'Simulação Pausada';
        }
    });

    // Botão Step (Avançar 1 passo de delta t)
    const btnStep = document.getElementById('btn-transport-step');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (isSimRunning && playControl) {
                playControl.setState(0, true);
            }
            simTime += 0.05 * simTimeScale;
            if (currentMesh) {
                currentMesh.rotation.y += 0.02 * simTimeScale;
                if (wireMesh) wireMesh.rotation.y = currentMesh.rotation.y;
                if (pointsMesh) pointsMesh.rotation.y = currentMesh.rotation.y;
            }
        });
    }

    // Botão Reset (t = 0.00s)
    const btnReset = document.getElementById('btn-demo-secondary');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (isSimRunning && playControl) {
                playControl.setState(0, true);
            }
            simTime = 0.0;
            if (currentMesh) {
                currentMesh.rotation.set(0, 0, 0);
                if (wireMesh) wireMesh.rotation.set(0, 0, 0);
                if (pointsMesh) pointsMesh.rotation.set(0, 0, 0);
            }
            const headerBadge = document.getElementById('header-status-badge');
            const footerText = document.getElementById('footer-status-text');

            if (headerBadge) {
                headerBadge.classList.remove('idle');
                headerBadge.innerHTML = '<span class="status-dot"></span><span>Pronto</span>';
            }
            if (footerText) footerText.textContent = 'Simulação Pronta';
        });
    }

    // Botão Cíclico de Velocidade na Barra Flutuante de Transporte
    const speedCycleSteps = [0.5, 1.0, 2.0, 5.0];
    const btnSpeedCycle = document.getElementById('btn-speed-cycle');
    if (btnSpeedCycle) {
        btnSpeedCycle.addEventListener('click', () => {
            const currentIdx = speedCycleSteps.indexOf(simTimeScale);
            const nextSpeed = speedCycleSteps[(currentIdx + 1) % speedCycleSteps.length];
            simTimeScale = nextSpeed;
            btnSpeedCycle.dataset.speed = nextSpeed.toFixed(1);
            btnSpeedCycle.textContent = `${nextSpeed.toFixed(1)}×`;
        });
    }

    // Botão de Ação Primária, Botões de Tom e Ações de Câmera (Aba 1 & Canvas)
    const applyPulseRotation = (dx = 0.35, dy = 0) => {
        if (currentMesh) {
            currentMesh.rotation.x += dx;
            currentMesh.rotation.y += dy;
            if (wireMesh) wireMesh.rotation.copy(currentMesh.rotation);
            if (pointsMesh) pointsMesh.rotation.copy(currentMesh.rotation);
        }
    };

    document.getElementById('btn-demo-action')?.addEventListener('click', () => applyPulseRotation(0.35, 0));
    document.getElementById('btn-demo-tone-cyan')?.addEventListener('click', () => applyPulseRotation(0, 0.45));
    document.getElementById('btn-demo-outline')?.addEventListener('click', () => applyPulseRotation(-0.35, -0.35));

    const resetCameraView = (x = 0, y = 0, z = 3.8) => {
        if (!camera || !controls) return;
        camera.position.set(x, y, z);
        controls.target.set(0, 0, 0);
        controls.update();
    };
    document.getElementById('btn-canvas-reset-cam')?.addEventListener('click', () => resetCameraView(0, 0, 3.8));
    document.getElementById('btn-view-x')?.addEventListener('click', () => resetCameraView(3.8, 0, 0));
    document.getElementById('btn-view-y')?.addEventListener('click', () => resetCameraView(0, 3.8, 0.01));
    document.getElementById('btn-view-z')?.addEventListener('click', () => resetCameraView(0, 0, 3.8));

    // Toggle de demonstração do Tooltip de Inspeção (.cell-tooltip)
    const demoTooltip = document.getElementById('demo-cell-tooltip');
    const btnToggleTooltipDemo = document.getElementById('btn-toggle-tooltip-demo');
    if (demoTooltip && btnToggleTooltipDemo) {
        btnToggleTooltipDemo.addEventListener('click', () => {
            const visible = demoTooltip.classList.toggle('visible');
            btnToggleTooltipDemo.classList.toggle('is-active', visible);
            if (visible) {
                demoTooltip.style.left = '24px';
                demoTooltip.style.top = '112px';
            }
        });
    }

    // --- INICIALIZAÇÃO DOS GRÁFICOS EM TEMPO REAL (ABA 4) ---
    const plotCanvas = document.getElementById('plot-canvas');
    if (plotCanvas) {
        plotInstance = new RealtimePlot(plotCanvas, {
            maxPoints: 80,
            minVal: -1.5,
            maxVal: 1.5
        });
    }

    const multiPlotCanvas = document.getElementById('multi-plot-canvas');
    if (multiPlotCanvas) {
        multiPlotInstance = new MultiSeriesPlot(multiPlotCanvas, {
            maxPoints: 90,
            mode: 'time-series',
            showLegend: true,
            showGrid: true,
            series: [
                { id: 'K', label: 'K', color: '#38bdf8', unit: ' J' },
                { id: 'U', label: 'U', color: '#f43f5e', unit: ' J' },
                { id: 'E', label: 'E', color: '#facc15', unit: ' J' }
            ]
        });

        document.querySelectorAll('#multiplot-mode-selector .segment-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#multiplot-mode-selector .segment-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.getAttribute('data-plot-mode') || 'time-series';
                multiPlotInstance.mode = mode;
                multiPlotInstance.clear();
                const titleEl = document.getElementById('multiplot-title');
                if (titleEl) {
                    titleEl.textContent = mode === 'phase-space'
                        ? 'Retrato de Fase (x vs p)'
                        : 'Energias K(t), U(t), E(t)';
                }
            });
        });
    }

    // --- INICIALIZAÇÃO DO MODAL DIDÁTICO DE TEORIA (ABA 4) ---
    const theoryModal = initModal('#modal-theory-demo');
    const btnOpenTheoryModal = document.getElementById('btn-open-theory-modal');
    if (btnOpenTheoryModal && theoryModal) {
        btnOpenTheoryModal.addEventListener('click', () => {
            theoryModal.open();
        });
    }

    // --- INICIALIZAÇÃO DO MODAL DE INSTRUÇÕES INICIAIS (1ª SESSÃO + BOTÃO DICAS) ---
    initOnboardingModal('#modal-onboarding', {
        triggerSelector: '#btn-open-onboarding'
    });

    // Preset Grid Active Toggle
    const pBtns = ['btn-demo-p1', 'btn-demo-p2', 'btn-demo-p3', 'btn-demo-p4'];
    pBtns.forEach(id => {
        const b = document.getElementById(id);
        if (b) {
            b.addEventListener('click', () => {
                pBtns.forEach(otherId => {
                    const ob = document.getElementById(otherId);
                    if (ob) ob.classList.remove('active');
                });
                b.classList.add('active');
            });
        }
    });

    // Botão Aleatório / Sortear
    const btnDice = document.getElementById('btn-demo-dice');
    if (btnDice) {
        btnDice.addEventListener('click', () => {
            const randomIndex = Math.floor(Math.random() * pBtns.length);
            pBtns.forEach((id, idx) => {
                const b = document.getElementById(id);
                if (b) b.classList.toggle('active', idx === randomIndex);
            });
        });
    }

    // Botões de Ícones Compactos Active Toggle
    const iconBtns = ['btn-icon-play', 'btn-icon-pause', 'btn-icon-step', 'btn-icon-refresh', 'btn-icon-sparkles'];
    iconBtns.forEach(id => {
        const b = document.getElementById(id);
        if (b) {
            b.addEventListener('click', () => {
                iconBtns.forEach(otherId => {
                    const ob = document.getElementById(otherId);
                    if (ob) ob.classList.remove('active');
                });
                b.classList.add('active');
            });
        }
    });

    // Segmented Pills (Aba 3)
    const segBtns = ['btn-seg-1', 'btn-seg-2', 'btn-seg-3'];
    segBtns.forEach(id => {
        const b = document.getElementById(id);
        if (b) {
            b.addEventListener('click', () => {
                segBtns.forEach(otherId => {
                    const ob = document.getElementById(otherId);
                    if (ob) ob.classList.remove('active');
                });
                b.classList.add('active');
            });
        }
    });

    // --- SLIDERS SINCRONIZADOS (DUAL-INPUT) ---
    const geomLabels = { sphere: 'Esfera Geodésica', cube: 'Cubo Poligonal', torus: 'Torus / Toroide' };
    syncDualSlider('#slider-demo-radius', '#input-demo-radius', (rad) => {
        const hudRadius = document.getElementById('hud-sphere-radius');
        if (hudRadius) hudRadius.textContent = `${rad.toFixed(2)} m`;
        const tipRadius = document.getElementById('tooltip-demo-radius');
        if (tipRadius) tipRadius.textContent = `${rad.toFixed(2)} m`;
        const steps = parseInt(document.getElementById('slider-demo-steps')?.value || 16);
        const meshType = document.getElementById('select-demo-mesh')?.value || 'sphere';
        buildMeshGeometry(meshType, rad, steps);
    });

    syncDualSlider('#slider-demo-steps', '#input-demo-steps', (steps) => {
        const rad = parseFloat(document.getElementById('slider-demo-radius')?.value || 1.0);
        const meshType = document.getElementById('select-demo-mesh')?.value || 'sphere';
        buildMeshGeometry(meshType, rad, parseInt(steps));
    });

    const selectMesh = document.getElementById('select-demo-mesh');
    if (selectMesh) {
        selectMesh.addEventListener('change', (e) => {
            const rad = parseFloat(document.getElementById('slider-demo-radius')?.value || 1.0);
            const steps = parseInt(document.getElementById('slider-demo-steps')?.value || 16);
            buildMeshGeometry(e.target.value, rad, steps);
            const label = geomLabels[e.target.value] || e.target.value;
            const infoBadge = document.getElementById('demo-canvas-info-badge');
            if (infoBadge) infoBadge.textContent = `Cena 3D · ${label}`;
            const tipGeom = document.getElementById('tooltip-demo-geom');
            if (tipGeom) tipGeom.textContent = label.split(' ')[0];
        });
    }

    // --- SWITCHES ---
    const swWire = document.getElementById('switch-demo-wireframe');
    if (swWire) {
        swWire.addEventListener('change', (e) => {
            if (wireMesh) wireMesh.visible = e.target.checked;
        });
    }

    const swPts = document.getElementById('switch-demo-points');
    if (swPts) {
        swPts.addEventListener('change', (e) => {
            if (pointsMesh) pointsMesh.visible = e.target.checked;
        });
    }

    const swLight = document.getElementById('switch-demo-light');
    if (swLight) {
        swLight.addEventListener('change', (e) => {
            if (testLight) testLight.visible = e.target.checked;
        });
    }

    // --- DEMONSTRAÇÃO DE ESTADOS SEMÂNTICOS (setFieldState) ---
    setupSemanticStateDemo();

    // --- DEMONSTRAÇÃO DO EDITOR DE MATRIZES & TENSORES (MatrixTensorEditor) ---
    setupMatrixEditorDemo();

    // --- PLAYGROUND DE LATEX DINÂMICO ---
    setupMathPlayground();

    // --- GALERIA DE ÍCONES ---
    populateIconGallery();

    // --- BARRA FLUTUANTE ESPELHADA DO MODO FOCO ---
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel',
        layoutSelector: '.sim-layout',
        onlyInFocusMode: true
    });
}

/** Configura a vitrine interativa de estados semânticos (setFieldState) */
function setupSemanticStateDemo() {
    const fieldEl = document.getElementById('demo-semantic-field');
    const wrapperEl = document.getElementById('demo-semantic-wrapper');
    const btnEl = document.getElementById('btn-semantic-action');
    const selector = document.getElementById('semantic-state-selector');
    if (!fieldEl || !selector) return;

    syncDualSlider('#slider-semantic-demo', '#input-semantic-demo');

    const applyDemoState = (mode) => {
        setFieldState(fieldEl, null, '');
        if (wrapperEl) setFieldState(wrapperEl, null);
        if (btnEl) {
            setFieldState(btnEl, null);
            btnEl.disabled = false;
        }

        if (mode === 'valid') {
            setFieldState(fieldEl, 'valid', 'Parâmetro dentro do regime físico de estabilidade linear.');
            if (wrapperEl) setFieldState(wrapperEl, 'valid');
            if (btnEl) setFieldState(btnEl, 'valid');
        } else if (mode === 'warning') {
            setFieldState(fieldEl, 'warning', 'Atenção: aproximação paraxial perde precisão para ângulos elevados.');
            if (wrapperEl) setFieldState(wrapperEl, 'warning');
            if (btnEl) setFieldState(btnEl, 'warning');
        } else if (mode === 'invalid') {
            setFieldState(fieldEl, 'invalid', 'Valor inválido: determinante nulo gera singularidade na inversão.');
            if (wrapperEl) setFieldState(wrapperEl, 'invalid');
            if (btnEl) setFieldState(btnEl, 'invalid');
        } else if (mode === 'ready') {
            setFieldState(fieldEl, 'ready', 'Configuração pronta! Parâmetros prontos para execução.');
            if (btnEl) setFieldState(btnEl, 'ready');
        } else if (mode === 'disabled') {
            setFieldState(fieldEl, 'disabled', 'Controle bloqueado no modo de simulação atual.');
            if (btnEl) {
                setFieldState(btnEl, 'disabled');
                btnEl.disabled = true;
            }
        }
    };

    selector.querySelectorAll('.segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selector.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyDemoState(btn.getAttribute('data-state-demo') || 'normal');
        });
    });

    applyDemoState('valid');
}

/** Configura a demonstração do MatrixTensorEditor 2x2 e Tensor Simétrico 3x3 */
function setupMatrixEditorDemo() {
    const containerEl = document.getElementById('demo-matrix-editor');
    if (containerEl) {
        const detEl = document.getElementById('matrix-demo-det');
        const trEl = document.getElementById('matrix-demo-tr');
        const eigEl = document.getElementById('matrix-demo-eig');

        const updateReadout = (analysis) => {
            if (!analysis) return;
            if (detEl) detEl.textContent = analysis.determinant.toFixed(2);
            if (trEl) trEl.textContent = analysis.trace.toFixed(2);
            if (eigEl) {
                if (analysis.isReal) {
                    eigEl.textContent = `${analysis.eigenvalues[0].toFixed(2)}, ${analysis.eigenvalues[1].toFixed(2)}`;
                } else {
                    const { re, im } = analysis.eigenvalues[0];
                    eigEl.textContent = `${re.toFixed(2)} ± ${Math.abs(im).toFixed(2)}i`;
                }
            }
        };

        const editor = new MatrixTensorEditor(containerEl, {
            dim: 2,
            symmetric: false,
            step: 0.1,
            labels: [['a_{11}', 'a_{12}'], ['a_{21}', 'a_{22}']],
            initialValue: [[1.2, 0.4], [0.2, 1.0]],
            onChange: (_M, analysis) => updateReadout(analysis)
        });

        editor.notifyChange();
    }

    const tensorEl = document.getElementById('demo-tensor3-editor');
    if (tensorEl) {
        const invEl = document.getElementById('tensor3-demo-inv');
        const eig3El = document.getElementById('tensor3-demo-eig');

        const tensorEditor = new MatrixTensorEditor(tensorEl, {
            dim: 3,
            symmetric: true,
            step: 0.2,
            labels: [
                ['I_{xx}', 'I_{xy}', 'I_{xz}'],
                ['I_{yx}', 'I_{yy}', 'I_{yz}'],
                ['I_{zx}', 'I_{zy}', 'I_{zz}']
            ],
            initialValue: [
                [3.0, 0.4, 0.0],
                [0.4, 2.0, 0.2],
                [0.0, 0.2, 1.0]
            ],
            onChange: (_M, analysis) => {
                if (!analysis) return;
                if (invEl) invEl.textContent = `${analysis.trace.toFixed(2)} / ${analysis.determinant.toFixed(2)}`;
                if (eig3El && Array.isArray(analysis.values)) {
                    eig3El.textContent = analysis.values.map(v => v.toFixed(2)).join(', ');
                }
            }
        });

        tensorEditor.notifyChange();
    }
}

/** Configura o playground de fórmulas matemáticas interativas dinâmicas via KaTeX */
function setupMathPlayground() {
    const displayEl = document.getElementById('math-live-display');
    const modelSelect = document.getElementById('select-math-model');
    const sliderA = document.getElementById('slider-math-a');
    const inputA = document.getElementById('input-math-a');
    const sliderW = document.getElementById('slider-math-w');
    const inputW = document.getElementById('input-math-w');

    if (!displayEl || !modelSelect || !sliderA || !inputA || !sliderW || !inputW) return;

    function updateLiveMath() {
        const model = modelSelect.value;
        const aVal = parseFloat(inputA.value || sliderA.value || 1.5).toFixed(1);
        const wVal = parseFloat(inputW.value || sliderW.value || 3.0).toFixed(1);

        let tex = '';
        if (model === 'wave') {
            tex = `\\psi(x, t) = ${aVal} \\cos(k x - ${wVal} t)`;
        } else if (model === 'quantum') {
            tex = `\\Psi(x, t) = ${aVal} e^{i(k x - ${wVal} t)}`;
        } else if (model === 'decay') {
            tex = `x(t) = ${aVal} e^{-\\gamma t} \\cos(${wVal} t + \\phi_0)`;
        }

        renderMath(displayEl, tex, { displayMode: true });
    }

    syncDualSlider('#slider-math-a', '#input-math-a', () => updateLiveMath());
    syncDualSlider('#slider-math-w', '#input-math-w', () => updateLiveMath());
    modelSelect.addEventListener('change', updateLiveMath);

    updateLiveMath();
}

function populateIconGallery() {
    const gallery = document.getElementById('icon-gallery');
    if (!gallery) return;

    gallery.innerHTML = '';
    ICONS_LIST.forEach(name => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'icon-card';
        card.title = `Copiar código HTML do ícone ${name}.svg`;
        card.setAttribute('aria-label', `Copiar HTML do ícone ${name}.svg`);
        card.innerHTML = `
            <img src="../assets/icons/${name}.svg" class="icon-svg" alt="${name}">
            <span class="icon-card-name">${name}.svg</span>
        `;
        card.addEventListener('click', () => {
            const code = `<img src="../assets/icons/${name}.svg" class="icon-svg" alt="${name}">`;
            navigator.clipboard?.writeText(code);
            card.style.borderColor = 'var(--accent-color)';
            setTimeout(() => { card.style.borderColor = ''; }, 600);
        });
        gallery.appendChild(card);
    });

    inlineSVGImages(gallery);
}

window.addEventListener('DOMContentLoaded', async () => {
    initThreeScene();
    setupListeners();
    animate();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
});
