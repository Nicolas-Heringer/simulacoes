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
    initModal,
    initSidebarCollapse,
    initTabs,
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
    setFieldState
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
    initModal,
    initSidebarCollapse,
    initTabs,
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
    setFieldState
};

// Catálogo Canônico Completo: 71 Ícones Vetoriais SVG em assets/icons/
const ICONS_LIST = [
    // Transporte, Navegação & UI (18)
    'play', 'pause', 'step', 'refresh', 'refresh-cw', 'rotate',
    'camera-reset', 'stopwatch', 'collapse', 'expand', 'focus',
    'arrow-left', 'chevron-right', 'sliders', 'toggle-switch',
    'chart-line', 'book-open', 'book',
    // Auxiliares & Presets (3)
    'sparkles', 'lightbulb', 'dice',
    // Dispositivos, Mouse, Teclado & Gestos Táteis (17)
    'mouse', 'mouse-left', 'mouse-right', 'mouse-wheel', 'mouse-scroll',
    'mouse-drag-horizontal', 'keyboard', 'key', 'smartphone', 'mobile',
    'tablet', 'touch', 'touch-drag', 'touch-pan', 'touch-pinch',
    'pinch', 'screen-rotate',
    // Clima, Geofísica, Ecologia & Termodinâmica (10)
    'globe', 'sun', 'snowflake', 'leaf', 'flower',
    'thermometer', 'cyclone', 'wind', 'gauge', 'pressure',
    // Mecânica, Oscilações, Ondas, Óptica & Eletromagnetismo (11)
    'gravity-fall', 'motion-oscillate', 'spring', 'pendulum',
    'wave-sine', 'fft-bars', 'prism', 'dipole', 'magnetic-field',
    'electron-drift', 'orbital',
    // Álgebra Linear, Tensores & Geometria (4)
    'compass', 'axis-3d', 'matrix-basis', 'chladni-plate',
    // Dinâmica de Partículas & Redes Cristalinas (8)
    'particle-single', 'particle-moving', 'particles-double', 'particles-opposite',
    'particles-three', 'particle-circle', 'particle-grid', 'salt-nacl'
];

let clickCount = 0;
let scene, camera, renderer, controls;
let currentMesh = null, wireMesh = null, pointsMesh = null;
let testLight = null;
let autoRotateActive = true;

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

    const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#facc15';
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

    if (controls) controls.update();

    // Rotação suave no eixo vertical Y
    if (autoRotateActive && currentMesh) {
        currentMesh.rotation.y += 0.005 * simTimeScale;
        if (wireMesh) wireMesh.rotation.y = currentMesh.rotation.y;
        if (pointsMesh) pointsMesh.rotation.y = currentMesh.rotation.y;
    }

    // Telemetria do Rodapé e Avanço Temporal
    if (isSimRunning) {
        simTime += 0.016 * simTimeScale;
    }

    const timerSpan = document.getElementById('footer-sim-timer');
    if (timerSpan) {
        timerSpan.textContent = `t = ${simTime.toFixed(2)}s`;
    }

    // 1. Alimentação contínua do Mini-Gráfico Canal Único (RealtimePlot)
    const rad = parseFloat(document.getElementById('slider-demo-radius')?.value || 1.0);
    if (plotInstance) {
        const waveVal = Math.sin(simTime * 3) * rad * 0.8 + (Math.cos(simTime * 7) * 0.2);
        plotInstance.push(waveVal);

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
            multiPlotInstance.push({ K, U, E });
        }

        const kReadout = document.getElementById('readout-demo-k');
        const uReadout = document.getElementById('readout-demo-u');
        if (kReadout) kReadout.textContent = `${K.toFixed(2)} J`;
        if (uReadout) uReadout.textContent = `${U.toFixed(2)} J`;
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function changeThemeColor(color) {
    document.documentElement.style.setProperty('--accent-color', color);
    document.documentElement.style.setProperty('--accent-nav', color);
    document.documentElement.style.setProperty('--accent-btn', color);
    document.documentElement.style.setProperty('--accent-card', color);
    document.documentElement.style.setProperty('--accent-text', color);
    document.documentElement.style.setProperty('--accent-slider', color);
    document.documentElement.style.setProperty('--accent-switch', color);
    document.documentElement.style.setProperty('--accent-hud', color);

    if (testLight) testLight.color.set(color);
    if (pointsMesh && pointsMesh.material) pointsMesh.material.color.set(color);

    document.querySelectorAll('.theme-dot-btn').forEach(d => {
        d.classList.toggle('active', d.getAttribute('data-color') === color);
    });

    const globalGroup = document.querySelector('.color-dots-group[data-target="global"]');
    if (globalGroup) {
        globalGroup.querySelectorAll('.color-dot').forEach(d => {
            d.classList.toggle('active', d.getAttribute('data-color') === color);
        });
    }
}

function setupListeners() {
    // --- CONTROLE DE MODO FOCO / RECOLHIMENTO DA SIDEBAR (DESKTOP) ---
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    // --- CONTROLE DE BOTTOM SHEET (MOBILE & TABLETS <= 900PX) ---
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
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

    // --- BOTÃO FLUTUANTE DE ROTAÇÃO NO CANVAS ---
    const btnAutoRotate = document.getElementById('btn-quick-autorotate');
    if (btnAutoRotate) {
        btnAutoRotate.addEventListener('click', () => {
            autoRotateActive = !autoRotateActive;
            btnAutoRotate.classList.toggle('active', autoRotateActive);
        });
    }

    // --- BARRA DE TEMAS FLUTUANTE (CANVAS) ---
    document.querySelectorAll('.theme-dot-btn').forEach(dot => {
        dot.addEventListener('click', () => {
            const color = dot.getAttribute('data-color');
            if (color) changeThemeColor(color);
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

        document.addEventListener('click', (e) => {
            if (!colorTooltip.contains(e.target) && e.target !== btnOpenTooltip && !btnOpenTooltip.contains(e.target)) {
                colorTooltip.classList.add('hidden');
            }
        });
    }

    // Gerenciador dos pontos de cor do Popover
    document.querySelectorAll('.color-dots-group').forEach(group => {
        const targetComponent = group.getAttribute('data-target');

        const inheritBtn = group.querySelector('.color-dot-inherit');
        if (inheritBtn) {
            inheritBtn.addEventListener('click', () => {
                group.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                inheritBtn.classList.add('active');
                if (targetComponent !== 'global') {
                    document.documentElement.style.removeProperty(`--accent-${targetComponent}`);
                }
            });
        }

        group.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const color = dot.getAttribute('data-color');
                if (inheritBtn) inheritBtn.classList.remove('active');
                group.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                dot.classList.add('active');

                if (targetComponent === 'global') {
                    changeThemeColor(color);
                } else {
                    const cssVar = `--accent-${targetComponent}`;
                    document.documentElement.style.setProperty(cssVar, color);
                }
            });
        });
    });

    // Botão de Reset de Todas as Cores
    const btnResetColors = document.getElementById('btn-reset-all-colors');
    if (btnResetColors) {
        btnResetColors.addEventListener('click', () => {
            const defaultAccent = '#facc15';
            changeThemeColor(defaultAccent);
            document.querySelectorAll('.color-dots-group').forEach(group => {
                const targetComponent = group.getAttribute('data-target');
                const inheritBtn = group.querySelector('.color-dot-inherit');
                group.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));

                if (targetComponent === 'global') {
                    const yellowDot = group.querySelector('.color-dot[data-color="#facc15"]');
                    if (yellowDot) yellowDot.classList.add('active');
                } else {
                    if (inheritBtn) inheritBtn.classList.add('active');
                    document.documentElement.style.removeProperty(`--accent-${targetComponent}`);
                }
            });
        });
    }

    // --- BARRA DE TRANSPORTE / REPRODUÇÃO (ABA 1) ---
    playControl = initToggleButton('#btn-demo-primary', (active) => {
        isSimRunning = active;
        autoRotateActive = active;

        if (btnAutoRotate) {
            btnAutoRotate.classList.toggle('active', active);
        }

        const headerBadge = document.getElementById('header-status-badge');
        const footerBadge = document.getElementById('footer-status-badge');
        const footerText = document.getElementById('footer-status-text');
        const fpsVal = document.getElementById('hud-fps-val');

        if (active) {
            if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Executando</span>';
            if (footerText) footerText.textContent = 'Simulação Ativa';
            if (footerBadge) footerBadge.classList.add('badge-accent');
            if (fpsVal) {
                fpsVal.textContent = '60 fps (Ativo)';
                fpsVal.style.color = 'var(--color-emerald, #22c55e)';
            }
        } else {
            if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Pausado</span>';
            if (footerText) footerText.textContent = 'Simulação Pausada';
            if (footerBadge) footerBadge.classList.remove('badge-accent');
            if (fpsVal) {
                fpsVal.textContent = 'Pausado (0 fps)';
                fpsVal.style.color = 'var(--color-yellow, #facc15)';
            }
        }
    });

    // Botão Step (Avançar 1 passo de delta t)
    const btnStep = document.getElementById('btn-transport-step');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (isSimRunning) {
                if (playControl) playControl.setState(0);
                isSimRunning = false;
                autoRotateActive = false;
                if (btnAutoRotate) btnAutoRotate.classList.remove('active');
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
            if (isSimRunning) {
                if (playControl) playControl.setState(0);
                isSimRunning = false;
                autoRotateActive = false;
                if (btnAutoRotate) btnAutoRotate.classList.remove('active');
            }
            simTime = 0.0;
            if (currentMesh) {
                currentMesh.rotation.set(0, 0, 0);
                if (wireMesh) wireMesh.rotation.set(0, 0, 0);
                if (pointsMesh) pointsMesh.rotation.set(0, 0, 0);
            }
            const headerBadge = document.getElementById('header-status-badge');
            const footerText = document.getElementById('footer-status-text');
            const footerBadge = document.getElementById('footer-status-badge');
            const fpsVal = document.getElementById('hud-fps-val');

            if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Pronto</span>';
            if (footerText) footerText.textContent = 'Simulação Reiniciada';
            if (footerBadge) footerBadge.classList.remove('badge-accent');
            if (fpsVal) {
                fpsVal.textContent = 'Pronto (60 fps)';
                fpsVal.style.color = 'var(--color-emerald, #22c55e)';
            }
        });
    }

    // Speed Selector Pills
    document.querySelectorAll('#transport-speed-pills .speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#transport-speed-pills .speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            simTimeScale = parseFloat(btn.dataset.speed || '1.0');
        });
    });

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

    // --- CLIQUE E CONTADORES DE TESTE ---
    const registerClick = () => {
        clickCount++;
        const spanClicks = document.getElementById('hud-click-count');
        if (spanClicks) spanClicks.textContent = `${clickCount}`;
    };

    document.querySelectorAll('.btn-primary, .btn-secondary, .btn-preset, .segment-btn, .btn-icon, .sim-btn, .speed-btn').forEach(b => {
        b.addEventListener('click', registerClick);
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
    syncDualSlider('#slider-demo-radius', '#input-demo-radius', (rad) => {
        const hudRadius = document.getElementById('hud-sphere-radius');
        if (hudRadius) hudRadius.textContent = rad.toFixed(2);
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
            setFieldState(fieldEl, 'ready', 'Configuração pronta! Clique no botão pulsante para executar.');
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

/** Configura a demonstração do MatrixTensorEditor 2x2 */
function setupMatrixEditorDemo() {
    const containerEl = document.getElementById('demo-matrix-editor');
    if (!containerEl) return;

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
        const card = document.createElement('div');
        card.className = 'icon-card';
        card.title = `Copiar código HTML do ícone ${name}.svg`;
        card.innerHTML = `
            <img src="../assets/icons/${name}.svg" class="icon-svg" style="width: 22px; height: 22px;" alt="${name}">
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

    inlineSVGImages();
}

window.addEventListener('DOMContentLoaded', async () => {
    initThreeScene();
    setupListeners();
    animate();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
});
