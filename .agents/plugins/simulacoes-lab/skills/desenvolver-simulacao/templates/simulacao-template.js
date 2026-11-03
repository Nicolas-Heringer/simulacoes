import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    initToggleButton,
    syncDualSlider,
    initSidebarCollapse,
    initBottomSheet,
    initTabs,
    initFocusMirrorToolbar,
    inlineSVGImages,
    initKaTeXAutoRender
} from './sim-ui.js';

// --- 1. Estado da Simulação ---
const state = {
    isRunning: false,
    speed: 1.0,
    time: 0.0,
    param1: 1.0
};

// --- 2. Configuração Three.js ---
const container = document.getElementById('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grade Auxiliar
const grid = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
scene.add(grid);

// Objeto Exemplo
const geom = new THREE.SphereGeometry(1, 32, 32);
const mat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.3,
    metalness: 0.2
});
const mesh = new THREE.Mesh(geom, mat);
mesh.position.y = 1;
scene.add(mesh);

// --- 3. Resize e Layout ---
function onWindowResize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}
window.addEventListener('resize', onWindowResize);

// --- 4. Inicialização de UI (sim-ui.js) ---
function setupUI() {
    // Modo Foco Desktop (F)
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    // Mobile Bottom Sheet
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // Navegação por Abas
    initTabs();

    // Play / Pause
    const playControl = initToggleButton('#btn-play-sim', (active) => {
        state.isRunning = active;
        const statusEl = document.getElementById('footer-status-text');
        if (statusEl) statusEl.textContent = active ? 'Simulando...' : 'Pausado';
    });

    // Passo Único (dt)
    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning) playControl.setState(0);
        stepPhysics(0.016);
        updateVisualScene();
    });

    // Reset
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
        if (state.isRunning) playControl.setState(0);
        state.time = 0;
        updateTimerDisplay();
        updateVisualScene();
    });

    // Seletor Cíclico de Velocidade na Barra Flutuante (#btn-speed-cycle)
    const speedSteps = [0.5, 1.0, 2.0, 5.0];
    const btnSpeedCycle = document.getElementById('btn-speed-cycle');
    btnSpeedCycle?.addEventListener('click', () => {
        const idx = speedSteps.indexOf(state.speed);
        const nextSpeed = speedSteps[(idx + 1) % speedSteps.length];
        state.speed = nextSpeed;
        btnSpeedCycle.dataset.speed = nextSpeed.toFixed(1);
        btnSpeedCycle.textContent = `${nextSpeed.toFixed(1)}×`;
    });

    // Dual Slider
    syncDualSlider('#slider-param1', '#num-param1', (val) => {
        state.param1 = val;
        updateVisualScene();
    });

    // Barra Flutuante Espelhada para Modo Foco
    initFocusMirrorToolbar({
        scopeSelector: '.controls-panel',
        layoutSelector: '.sim-layout',
        onlyInFocusMode: true
    });
}

// --- 5. Física, Presentation Pass e Loop Principal ---
function stepPhysics(dt) {
    state.time += dt * state.speed;
    updateTimerDisplay();
}

function updateVisualScene() {
    mesh.position.y = 1 + Math.sin(state.time * 2) * 0.5;
    mesh.scale.setScalar(state.param1);
    renderer.render(scene, camera);
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('footer-sim-timer');
    if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;
}

let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    if (state.isRunning) {
        stepPhysics(dt);
    }

    controls.update();
    updateVisualScene();
}

// --- 6. Inicialização ---
window.addEventListener('DOMContentLoaded', async () => {
    setupUI();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});
