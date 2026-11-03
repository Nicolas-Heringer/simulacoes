/**
 * nova_simulacao.js
 * Da Inércia ao Movimento Circular — Laboratório Interativo.
 * Implementação dos Modos 1 (Inércia & Desvio) e 2 (Movimento Circular).
 * Em conformidade estrita com o Design System 2.0 e sim-ui.js.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    initToggleButton,
    syncDualSlider,
    initSidebarCollapse,
    initBottomSheet,
    initTabs,
    initFocusMirrorToolbar,
    initOnboardingModal,
    inlineSVGImages,
    initKaTeXAutoRender
} from './sim-ui.js';

// =============================================================================
// 1. ESTADO GLOBAL DA SIMULAÇÃO
// =============================================================================
const state = {
    mode: 1, // 1: Inércia & Desvio | 2: Movimento Circular
    isRunning: false,
    speed: 1.0,
    time: 0.0,

    // Modo 1: Inércia e Desvio por Força Resultante
    m1: {
        v0: 6.0,
        force: 8.0,
        mass: 1.0,
        pulseDuration: 1.2, // segundos que a força dura
        showGhost: true,
        showVectors: true,
        isForceActive: false,
        hasFiredForce: false,
        forceTimer: 0.0,

        // Cinemática e Dinâmica
        pos: new THREE.Vector3(-14, 0.6, 0),
        vel: new THREE.Vector3(6.0, 0, 0),
        acc: new THREE.Vector3(0, 0, 0),
        deflectionPoint: null,

        // Trajetória e Fantasma Inercial
        ghostPos: new THREE.Vector3(-14, 0.6, 0),
        ghostVel: new THREE.Vector3(6.0, 0, 0),
        realTrail: [],
        ghostTrail: []
    },

    // Modo 2: Movimento Circular e Força Centrípeta
    m2: {
        radius: 5.0,
        speed: 5.0,
        mass: 1.0,
        isCut: false, // se true, a força centrípeta foi cortada
        ghostMode: 'stream', // 'stream' (Fuga Contínua) ou 'newton' (Passo de Newton)
        showGhostTangent: true,
        showVecV: true,
        showVecA: true,
        showVecF: true,

        // Cinemática
        angle: 0.0,
        pos: new THREE.Vector3(5.0, 0.6, 0),
        vel: new THREE.Vector3(0, 0, 5.0),
        acc: new THREE.Vector3(-5.0, 0, 0),
        cutPos: new THREE.Vector3(),
        cutVel: new THREE.Vector3(),
        trail: [],

        // Fuga Contínua (Stream)
        streamGhostPos: new THREE.Vector3(),
        streamGhostVel: new THREE.Vector3(),
        streamGhostTrail: [],
        streamActive: false,

        // Construção Geométrica de Newton (Passo a Passo)
        dtStep: 0.35,
        newtonPtA: new THREE.Vector3(),
        newtonPtB: new THREE.Vector3(),
        newtonPtC: new THREE.Vector3()
    }
};

// =============================================================================
// 2. CONFIGURAÇÃO DE CENA, CÂMERA E RENDERIZADOR (THREE.JS)
// =============================================================================
const container = document.getElementById('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);

const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 14, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // evita passar para baixo do chão

// Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(8, 16, 10);
scene.add(dirLight);

// Grade Auxiliar do Chão
const grid = new THREE.GridHelper(36, 36, 0x38bdf8, 0x1e293b);
grid.position.y = 0;
scene.add(grid);

// =============================================================================
// 3. OBJETOS VISUAIS E ENTIDADES DA CENA
// =============================================================================
const SPHERE_RADIUS = 0.45;

// Objeto Real (Esfera Metálica Luminosa)
const realSphereGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
const realSphereMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, // Ciano luminoso
    metalness: 0.3,
    roughness: 0.2,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25
});
const realBody = new THREE.Mesh(realSphereGeom, realSphereMat);
realBody.castShadow = true;
scene.add(realBody);

// Silhueta / Objeto Fantasma Pontilhado (Inércia)
const ghostSphereGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 18, 18);
const ghostSphereMat = new THREE.MeshBasicMaterial({
    color: 0xc4b5fd, // Roxo claro translúcido
    wireframe: true,
    transparent: true,
    opacity: 0.75
});
const ghostBody = new THREE.Mesh(ghostSphereGeom, ghostSphereMat);
ghostBody.visible = true;
scene.add(ghostBody);

// Anel de Destaque da Silhueta Fantasma
const ghostRingGeom = new THREE.RingGeometry(SPHERE_RADIUS * 1.05, SPHERE_RADIUS * 1.25, 24);
const ghostRingMat = new THREE.MeshBasicMaterial({
    color: 0xa78bfa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
});
const ghostRing = new THREE.Mesh(ghostRingGeom, ghostRingMat);
ghostRing.rotation.x = Math.PI / 2;
ghostBody.add(ghostRing);

// Centro Atrativo do Modo 2 (Núcleo de Rotação)
const centerCoreGeom = new THREE.SphereGeometry(0.35, 24, 24);
const centerCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xeab308,
    emissiveIntensity: 0.8
});
const centerCore = new THREE.Mesh(centerCoreGeom, centerCoreMat);
centerCore.position.set(0, 0.4, 0);
centerCore.visible = false;
scene.add(centerCore);

// Círculo Guia da Órbita (Modo 2)
let orbitCircleLine = null;
function buildOrbitCircle(radius) {
    if (orbitCircleLine) {
        scene.remove(orbitCircleLine);
        orbitCircleLine.geometry.dispose();
    }
    const points = [];
    const segments = 96;
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(radius * Math.cos(theta), 0.05, radius * Math.sin(theta)));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
        color: 0x475569,
        dashSize: 0.5,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.6
    });
    orbitCircleLine = new THREE.Line(geom, mat);
    orbitCircleLine.computeLineDistances();
    scene.add(orbitCircleLine);
}

// Linhas de Trajetória (Rastro Real e Rastro Inercial Pontilhado - Trajetória Completa)
const MAX_TRAIL = 5000;

function appendTrailPoint(trail, newPos, minDistance = 0.04) {
    if (trail.length === 0) {
        trail.push(newPos.clone());
        return true;
    }
    const last = trail[trail.length - 1];
    if (last.distanceTo(newPos) >= minDistance) {
        if (trail.length < MAX_TRAIL) {
            trail.push(newPos.clone());
            return true;
        }
    }
    return false;
}

// 1. Rastro Real
const realTrailGeom = new THREE.BufferGeometry();
const realTrailPositions = new Float32Array(MAX_TRAIL * 3);
realTrailGeom.setAttribute('position', new THREE.BufferAttribute(realTrailPositions, 3));
const realTrailMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
const realTrailLine = new THREE.Line(realTrailGeom, realTrailMat);
scene.add(realTrailLine);

// 2. Trajetória Inercial Pontilhada (Dashed Line)
const ghostTrailGeom = new THREE.BufferGeometry();
const ghostTrailPositions = new Float32Array(MAX_TRAIL * 3);
ghostTrailGeom.setAttribute('position', new THREE.BufferAttribute(ghostTrailPositions, 3));
const ghostTrailMat = new THREE.LineDashedMaterial({
    color: 0xa8a8b8,
    dashSize: 0.4,
    gapSize: 0.25,
    transparent: true,
    opacity: 0.85
});
const ghostTrailLine = new THREE.Line(ghostTrailGeom, ghostTrailMat);
scene.add(ghostTrailLine);

// 3. Linha Tangente Pontilhada do Modo 2
const tangentLineGeom = new THREE.BufferGeometry();
const tangentPositions = new Float32Array(2 * 3);
tangentLineGeom.setAttribute('position', new THREE.BufferAttribute(tangentPositions, 3));
const tangentLineMat = new THREE.LineDashedMaterial({
    color: 0x34d399, // Verde suave
    dashSize: 0.35,
    gapSize: 0.2,
    transparent: true,
    opacity: 0.9
});
const tangentLine = new THREE.Line(tangentLineGeom, tangentLineMat);
tangentLine.visible = false;
scene.add(tangentLine);

// Vetores 3D com ArrowHelper
const originZero = new THREE.Vector3(0, 0, 0);
const dirX = new THREE.Vector3(1, 0, 0);

// Vetor Velocidade (Ciano/Verde)
const arrowVel = new THREE.ArrowHelper(dirX, originZero, 2, 0x10b981, 0.4, 0.25);
scene.add(arrowVel);

// Vetor Força (Rosa)
const arrowForce = new THREE.ArrowHelper(dirX, originZero, 2, 0xf43f5e, 0.4, 0.25);
arrowForce.visible = false;
scene.add(arrowForce);

// Vetor Aceleração Centrípeta (Laranja)
const arrowAccel = new THREE.ArrowHelper(dirX, originZero, 2, 0xf59e0b, 0.4, 0.25);
arrowAccel.visible = false;
scene.add(arrowAccel);

// 4. Elementos Visuais da Construção Geométrica de Newton (A -> B -> C)
// Linha inercial pontilhada A -> B
const newtonInertiaGeom = new THREE.BufferGeometry();
newtonInertiaGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
const newtonInertiaMat = new THREE.LineDashedMaterial({
    color: 0x34d399,
    dashSize: 0.3,
    gapSize: 0.18,
    transparent: true,
    opacity: 0.95
});
const newtonInertiaLine = new THREE.Line(newtonInertiaGeom, newtonInertiaMat);
newtonInertiaLine.visible = false;
scene.add(newtonInertiaLine);

// Seta de correção centrípeta radial B -> C (Puxão de Newton)
const arrowNewtonCorrection = new THREE.ArrowHelper(dirX, originZero, 1, 0xf43f5e, 0.35, 0.22);
arrowNewtonCorrection.visible = false;
scene.add(arrowNewtonCorrection);

// =============================================================================
// 4. ATUALIZAÇÃO E SINCRONIZAÇÃO DE RASTROS
// =============================================================================
function updateTrailGeometry(lineMesh, pointsArray) {
    const posAttr = lineMesh.geometry.attributes.position;
    for (let i = 0; i < pointsArray.length; i++) {
        posAttr.setXYZ(i, pointsArray[i].x, pointsArray[i].y, pointsArray[i].z);
    }
    lineMesh.geometry.setDrawRange(0, pointsArray.length);
    posAttr.needsUpdate = true;
    if (lineMesh.computeLineDistances) {
        lineMesh.computeLineDistances();
    }
}

function clearAllTrails() {
    state.m1.realTrail = [];
    state.m1.ghostTrail = [];
    state.m2.trail = [];
    updateTrailGeometry(realTrailLine, []);
    updateTrailGeometry(ghostTrailLine, []);
}

// =============================================================================
// 5. REDIMENSIONAMENTO E RESET DE CÂMERA
// =============================================================================
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

function resetCameraView() {
    camera.position.set(0, 14, 16);
    controls.target.set(0, 0, 0);
    controls.update();
}

// =============================================================================
// 6. FÍSICA E CINEMÁTICA DOS MODOS (DESACOPLADA DA APRESENTAÇÃO)
// =============================================================================

function getMassScale(mass) {
    return Math.cbrt(Math.max(0.1, mass));
}

function syncMode2KinematicsFromAngle() {
    const m2 = state.m2;
    if (m2.isCut) return;

    m2.pos.set(
        m2.radius * Math.cos(m2.angle),
        0.6,
        m2.radius * Math.sin(m2.angle)
    );
    m2.vel.set(
        -m2.speed * Math.sin(m2.angle),
        0,
        m2.speed * Math.cos(m2.angle)
    );
    const acMag = (m2.speed * m2.speed) / m2.radius;
    m2.acc.set(
        -Math.cos(m2.angle) * acMag,
        0,
        -Math.sin(m2.angle) * acMag
    );
}

// --- MODO 1: INÉRCIA E DESVIO ---
function resetMode1() {
    state.m1.pos.set(-14, 0.6, 0);
    state.m1.vel.set(state.m1.v0, 0, 0);
    state.m1.acc.set(0, 0, 0);
    state.m1.isForceActive = false;
    state.m1.hasFiredForce = false;
    state.m1.forceTimer = 0.0;
    state.m1.deflectionPoint = null;

    state.m1.ghostPos.set(-14, 0.6, 0);
    state.m1.ghostVel.set(state.m1.v0, 0, 0);

    clearAllTrails();
    updateVisualScene();
    updateReadouts();
}

function triggerMode1Force() {
    // Se a partícula já completou o percurso e parou no limite, reinicia suavemente para nova demonstração
    if (state.m1.pos.x > 22 || Math.abs(state.m1.pos.z) > 20) {
        resetMode1();
        if (playControl && !state.isRunning) {
            playControl.setState(1);
        }
    }

    if (state.m1.isForceActive) return;

    // Registra o ponto de deflexão no exato instante da ação
    state.m1.deflectionPoint = state.m1.pos.clone();
    state.m1.isForceActive = true;
    state.m1.hasFiredForce = true;
    state.m1.forceTimer = state.m1.pulseDuration;

    // Força orientada transversalmente (+Z)
    const accelZ = state.m1.force / state.m1.mass;
    state.m1.acc.set(0, 0, accelZ);

    // O corpo fantasma nasce exatamente aqui e continua na direção original v0 (+X)
    state.m1.ghostPos.copy(state.m1.pos);
    state.m1.ghostVel.set(state.m1.v0, 0, 0);
    state.m1.ghostTrail = [state.m1.ghostPos.clone()];

    updateVisualScene();
    updateReadouts();
}

function stepPhysicsMode1(dt) {
    const m1 = state.m1;

    // 1. Dinâmica do Pulso de Força
    if (m1.isForceActive) {
        m1.forceTimer -= dt;
        if (m1.forceTimer <= 0) {
            m1.isForceActive = false;
            m1.acc.set(0, 0, 0); // Força cessa: volta ao MRU, mas em nova direção!
        } else {
            m1.acc.set(0, 0, m1.force / m1.mass);
        }
    }

    // 2. Integração de Euler do Corpo Real
    m1.vel.addScaledVector(m1.acc, dt);
    m1.pos.addScaledVector(m1.vel, dt);
    appendTrailPoint(m1.realTrail, m1.pos);

    // 3. Integração da Silhueta Fantasma Inercial (sempre registrada após o disparo para permitir toggle com simulação pausada)
    if (m1.hasFiredForce) {
        m1.ghostPos.addScaledVector(m1.ghostVel, dt);
        appendTrailPoint(m1.ghostTrail, m1.ghostPos);
    }

    // Pausa suave ao atingir o limite da arena para que toda a trajetória fique visível para estudo
    if (m1.pos.x > 24 || Math.abs(m1.pos.z) > 22) {
        if (state.isRunning && playControl) {
            playControl.setState(0);
        }
    }
}

// --- MODO 2: MOVIMENTO CIRCULAR ---
function resetMode2() {
    const m2 = state.m2;
    m2.isCut = false;
    m2.angle = 0.0;
    syncMode2KinematicsFromAngle();

    // Reseta fluxo contínuo
    m2.streamActive = false;
    m2.streamGhostTrail = [];

    clearAllTrails();
    buildOrbitCircle(m2.radius);

    const btnCut = document.getElementById('btn-m2-cut-text');
    if (btnCut) btnCut.textContent = 'Cortar Força Centrípeta (F_c = 0)';
    document.getElementById('btn-m2-cut-force')?.classList.remove('btn-primary', 'tone-emerald');
    document.getElementById('btn-m2-cut-force')?.classList.add('btn-secondary');

    updateVisualScene();
    updateReadouts();
}

function setupNewtonStep() {
    const m2 = state.m2;
    if (m2.isCut) {
        newtonInertiaLine.visible = false;
        arrowNewtonCorrection.visible = false;
        ghostBody.visible = false;
        return;
    }

    const omega = m2.speed / m2.radius;

    // Ponto A: posição inicial do passo na circunferência
    m2.newtonPtA.copy(m2.pos);

    // Ponto B: onde estaria sem força (fuga inercial retilínea por dtStep)
    m2.newtonPtB.copy(m2.pos).addScaledVector(m2.vel, m2.dtStep);

    // Ponto C: posição real na circunferência após dtStep
    const nextAngle = m2.angle + omega * m2.dtStep;
    m2.newtonPtC.set(
        m2.radius * Math.cos(nextAngle),
        0.6,
        m2.radius * Math.sin(nextAngle)
    );

    if (m2.ghostMode === 'newton' && m2.showGhostTangent) {
        // Linha inercial A -> B (verde suave pontilhada)
        const posAttr = newtonInertiaLine.geometry.attributes.position;
        posAttr.setXYZ(0, m2.newtonPtA.x, m2.newtonPtA.y, m2.newtonPtA.z);
        posAttr.setXYZ(1, m2.newtonPtB.x, m2.newtonPtB.y, m2.newtonPtB.z);
        posAttr.needsUpdate = true;
        newtonInertiaLine.computeLineDistances();
        newtonInertiaLine.visible = true;

        // Esfera fantasma posicionada exatamente no vértice inercial B
        ghostBody.position.copy(m2.newtonPtB);
        ghostBody.visible = true;

        // Seta de correção centrípeta B -> C (o puxão da força para o círculo)
        const diff = m2.newtonPtC.clone().sub(m2.newtonPtB);
        const dist = diff.length();
        if (dist > 0.001) {
            arrowNewtonCorrection.position.copy(m2.newtonPtB);
            arrowNewtonCorrection.setDirection(diff.clone().normalize());
            arrowNewtonCorrection.setLength(dist, Math.min(dist * 0.4, 0.35), 0.2);
            arrowNewtonCorrection.visible = true;
        } else {
            arrowNewtonCorrection.visible = false;
        }
    } else {
        newtonInertiaLine.visible = false;
        arrowNewtonCorrection.visible = false;
        ghostBody.visible = false;
    }
}

function advanceNewtonStep() {
    const m2 = state.m2;
    if (m2.isCut) return;

    const omega = m2.speed / m2.radius;
    m2.angle += omega * m2.dtStep;
    syncMode2KinematicsFromAngle();

    appendTrailPoint(m2.trail, m2.pos);

    updateVisualScene();
    updateReadouts();
}

function toggleMode2CutForce() {
    const m2 = state.m2;
    m2.isCut = !m2.isCut;

    const btnCut = document.getElementById('btn-m2-cut-text');
    const btnElem = document.getElementById('btn-m2-cut-force');

    if (m2.isCut) {
        // Ponto de corte: o corpo mantém sua velocidade tangencial instantânea (1ª Lei de Newton)
        m2.cutPos = m2.pos.clone();
        m2.cutVel = m2.vel.clone();

        if (btnCut) btnCut.textContent = 'Restaurar Força Centrípeta';
        if (btnElem) {
            btnElem.classList.remove('btn-secondary');
            btnElem.classList.add('btn-primary', 'tone-emerald');
        }
    } else {
        // Restaura órbita
        m2.radius = m2.pos.length();
        if (m2.radius < 2.0) m2.radius = 2.0;
        if (m2.radius > 10.0) m2.radius = 10.0;
        m2.angle = Math.atan2(m2.pos.z, m2.pos.x);
        syncMode2KinematicsFromAngle();
        buildOrbitCircle(m2.radius);

        if (btnCut) btnCut.textContent = 'Cortar Força Centrípeta (F_c = 0)';
        if (btnElem) {
            btnElem.classList.remove('btn-primary', 'tone-emerald');
            btnElem.classList.add('btn-secondary');
        }
    }

    updateVisualScene();
    updateReadouts();
}

function stepPhysicsMode2(dt) {
    const m2 = state.m2;

    if (!m2.isCut) {
        const omega = m2.speed / m2.radius;
        m2.angle += omega * dt;
        syncMode2KinematicsFromAngle();
        appendTrailPoint(m2.trail, m2.pos);

        if (m2.ghostMode === 'stream') {
            // Se a esfera fantasma não está ativa ou já saiu da arena (> 22m), emite uma nova da posição atual
            if (!m2.streamActive || m2.streamGhostPos.length() > 22) {
                m2.streamGhostPos.copy(m2.pos);
                m2.streamGhostVel.copy(m2.vel);
                m2.streamGhostTrail = [m2.streamGhostPos.clone()];
                m2.streamActive = true;
            }

            // A esfera fantasma viaja em MRU em linha reta pela tangente
            m2.streamGhostPos.addScaledVector(m2.streamGhostVel, dt);
            appendTrailPoint(m2.streamGhostTrail, m2.streamGhostPos, 0.05);
        }
    } else {
        // FORÇA CENTRÍPETA CORTADA: Escape Retilíneo Uniforme pela Tangente
        m2.pos.addScaledVector(m2.cutVel, dt);
        appendTrailPoint(m2.trail, m2.pos);

        // Se escapar para muito longe, pausa para permitir inspeção da reta de escape
        if (m2.pos.length() > 28) {
            if (state.isRunning && playControl) {
                playControl.setState(0);
            }
        }
    }
}

// =============================================================================
// 6.5 PRESENTATION PASS: SINCRONIZAÇÃO VISUAL DA CENA 3D (updateVisualScene)
// =============================================================================
function updateVisualScene() {
    if (state.mode === 1) {
        const m1 = state.m1;

        // Oculta elementos exclusivos do Modo 2
        centerCore.visible = false;
        if (orbitCircleLine) orbitCircleLine.visible = false;
        tangentLine.visible = false;
        newtonInertiaLine.visible = false;
        arrowNewtonCorrection.visible = false;
        arrowAccel.visible = false;

        // Escala proporcional à massa e posição do corpo real
        const massScale = getMassScale(m1.mass);
        realBody.scale.setScalar(massScale);
        ghostBody.scale.setScalar(massScale);
        realBody.position.copy(m1.pos);

        // Rastro real
        updateTrailGeometry(realTrailLine, m1.realTrail);
        realTrailLine.visible = true;

        // Silhueta e trajetória fantasma inercial
        if (m1.hasFiredForce && m1.showGhost) {
            ghostBody.position.copy(m1.ghostPos);
            ghostBody.visible = true;
            updateTrailGeometry(ghostTrailLine, m1.ghostTrail);
            ghostTrailLine.visible = true;
        } else {
            ghostBody.visible = false;
            updateTrailGeometry(ghostTrailLine, []);
            ghostTrailLine.visible = false;
        }

        // Vetores (Velocidade e Força)
        if (m1.showVectors) {
            const speed = m1.vel.length();
            if (speed > 0.001) {
                arrowVel.visible = true;
                arrowVel.position.copy(m1.pos);
                arrowVel.setDirection(m1.vel.clone().normalize());
                arrowVel.setLength(Math.min(speed * 0.45, 5), 0.35, 0.2);
            } else {
                arrowVel.visible = false;
            }

            if (m1.isForceActive && m1.force > 0.001) {
                arrowForce.visible = true;
                arrowForce.position.copy(m1.pos);
                arrowForce.setDirection(new THREE.Vector3(0, 0, 1));
                arrowForce.setLength(Math.min(m1.force * 0.35, 5), 0.35, 0.2);
            } else {
                arrowForce.visible = false;
            }
        } else {
            arrowVel.visible = false;
            arrowForce.visible = false;
        }
    } else {
        const m2 = state.m2;

        centerCore.visible = true;
        if (orbitCircleLine) orbitCircleLine.visible = true;
        tangentLine.visible = false;

        const massScale = getMassScale(m2.mass);
        realBody.scale.setScalar(massScale);
        ghostBody.scale.setScalar(massScale);

        if (!m2.isCut) {
            syncMode2KinematicsFromAngle();
            realBody.position.copy(m2.pos);
            updateTrailGeometry(realTrailLine, m2.trail);
            realTrailLine.visible = true;

            if (m2.ghostMode === 'newton') {
                updateTrailGeometry(ghostTrailLine, []);
                ghostTrailLine.visible = false;
                setupNewtonStep();
            } else {
                newtonInertiaLine.visible = false;
                arrowNewtonCorrection.visible = false;

                if (m2.showGhostTangent) {
                    if (!m2.streamActive) {
                        m2.streamGhostPos.copy(m2.pos);
                        m2.streamGhostVel.copy(m2.vel);
                        m2.streamGhostTrail = [m2.streamGhostPos.clone()];
                        m2.streamActive = true;
                    }
                    ghostBody.position.copy(m2.streamGhostPos);
                    ghostBody.visible = true;
                    updateTrailGeometry(ghostTrailLine, m2.streamGhostTrail);
                    ghostTrailLine.visible = true;
                } else {
                    ghostBody.visible = false;
                    updateTrailGeometry(ghostTrailLine, []);
                    ghostTrailLine.visible = false;
                }
            }

            // Vetor Velocidade Linear (Verde)
            if (m2.showVecV && m2.vel.length() > 0.001) {
                arrowVel.visible = true;
                arrowVel.position.copy(m2.pos);
                arrowVel.setDirection(m2.vel.clone().normalize());
                arrowVel.setLength(Math.min(m2.speed * 0.45, 4.5), 0.35, 0.2);
            } else {
                arrowVel.visible = false;
            }

            // Vetor Aceleração Centrípeta (Laranja)
            const acMag = (m2.speed * m2.speed) / m2.radius;
            if (m2.showVecA && acMag > 0.001) {
                arrowAccel.visible = true;
                arrowAccel.position.copy(m2.pos);
                arrowAccel.setDirection(m2.acc.clone().normalize());
                arrowAccel.setLength(Math.min(acMag * 0.4, 4.5), 0.35, 0.2);
            } else {
                arrowAccel.visible = false;
            }

            // Vetor Força Centrípeta (Rosa)
            const fcMag = m2.mass * acMag;
            if (m2.showVecF && fcMag > 0.001) {
                arrowForce.visible = true;
                arrowForce.position.copy(m2.pos);
                arrowForce.setDirection(m2.acc.clone().normalize());
                arrowForce.setLength(Math.min(fcMag * 0.3, 4.5), 0.35, 0.2);
            } else {
                arrowForce.visible = false;
            }
        } else {
            // Força Centrípeta Cortada
            realBody.position.copy(m2.pos);
            updateTrailGeometry(realTrailLine, m2.trail);
            realTrailLine.visible = true;

            ghostBody.visible = false;
            updateTrailGeometry(ghostTrailLine, []);
            ghostTrailLine.visible = false;
            newtonInertiaLine.visible = false;
            arrowNewtonCorrection.visible = false;
            arrowAccel.visible = false;
            arrowForce.visible = false;

            if (m2.showVecV && m2.cutVel.length() > 0.001) {
                arrowVel.visible = true;
                arrowVel.position.copy(m2.pos);
                arrowVel.setDirection(m2.cutVel.clone().normalize());
                arrowVel.setLength(Math.min(m2.speed * 0.45, 4.5), 0.35, 0.2);
            } else {
                arrowVel.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}

// =============================================================================
// 7. ATUALIZAÇÃO DOS READOUTS E TELEMETRIA
// =============================================================================
function updateReadouts() {
    const timerEl = document.getElementById('footer-sim-timer');
    if (timerEl) {
        timerEl.textContent = `t = ${state.time.toFixed(2)}s`;
    }

    if (state.mode === 1) {
        const m1 = state.m1;
        const stateEl = document.getElementById('m1-val-force-state');
        const accelEl = document.getElementById('m1-val-accel');
        const speedEl = document.getElementById('m1-val-speed');
        const distGhostEl = document.getElementById('m1-val-dist-ghost');

        if (stateEl) {
            if (m1.isForceActive) {
                stateEl.textContent = `F_res = ${m1.force.toFixed(1)} N (Acelerado)`;
                stateEl.className = 'sim-readout-value tone-rose';
            } else if (m1.hasFiredForce) {
                stateEl.textContent = 'F_res = 0 (Novo MRU defletido)';
                stateEl.className = 'sim-readout-value tone-cyan';
            } else {
                stateEl.textContent = 'F_res = 0 (Inércia Retilínea)';
                stateEl.className = 'sim-readout-value tone-emerald';
            }
        }

        if (accelEl) {
            accelEl.textContent = `${m1.acc.length().toFixed(2)} m/s²`;
        }

        if (speedEl) {
            speedEl.textContent = `${m1.vel.length().toFixed(2)} m/s`;
        }

        if (distGhostEl) {
            if (m1.hasFiredForce) {
                const dist = m1.pos.distanceTo(m1.ghostPos);
                distGhostEl.textContent = `${dist.toFixed(2)} m`;
            } else {
                distGhostEl.textContent = '0.00 m';
            }
        }
    } else {
        const m2 = state.m2;
        const ac = (m2.speed * m2.speed) / m2.radius;
        const fc = m2.mass * ac;
        const omega = m2.speed / m2.radius;
        const period = (2 * Math.PI) / omega;

        const valAc = document.getElementById('m2-val-ac');
        const valFc = document.getElementById('m2-val-fc');
        const valOmega = document.getElementById('m2-val-omega');
        const valPeriod = document.getElementById('m2-val-period');

        if (valAc) valAc.textContent = m2.isCut ? '0.00 m/s²' : `${ac.toFixed(2)} m/s²`;
        if (valFc) valFc.textContent = m2.isCut ? '0.00 N' : `${fc.toFixed(2)} N`;
        if (valOmega) valOmega.textContent = m2.isCut ? '0.00 rad/s' : `${omega.toFixed(2)} rad/s`;
        if (valPeriod) valPeriod.textContent = m2.isCut ? '∞' : `${period.toFixed(2)} s`;
    }
}

// =============================================================================
// 8. ALTERNÂNCIA ENTRE MODOS DIDÁTICOS (MODO 1 <-> MODO 2)
// =============================================================================
function switchMode(newMode) {
    state.mode = newMode;
    const hudMode = document.getElementById('hud-active-mode');

    const ctrl1 = document.getElementById('controls-mode-1');
    const ctrl2 = document.getElementById('controls-mode-2');

    document.querySelectorAll('#mode-selector .segment-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.mode) === newMode);
    });

    if (newMode === 1) {
        if (ctrl1) ctrl1.style.display = 'block';
        if (ctrl2) ctrl2.style.display = 'none';
        if (hudMode) {
            hudMode.textContent = '1. Inércia & Desvio';
            hudMode.style.color = 'var(--color-cyan)';
        }
        centerCore.visible = false;
        if (orbitCircleLine) orbitCircleLine.visible = false;
        tangentLine.visible = false;
        newtonInertiaLine.visible = false;
        arrowNewtonCorrection.visible = false;
        resetMode1();
    } else {
        if (ctrl1) ctrl1.style.display = 'none';
        if (ctrl2) ctrl2.style.display = 'block';
        const pnlNewton = document.getElementById('panel-m2-newton');
        if (pnlNewton) {
            pnlNewton.style.display = state.m2.ghostMode === 'newton' ? 'block' : 'none';
        }
        if (hudMode) {
            hudMode.textContent = '2. Movimento Circular';
            hudMode.style.color = 'var(--color-emerald)';
        }
        resetMode2();
    }
}

// =============================================================================
// 9. CONFIGURAÇÃO DE CONTROLES E LISTENERS DE UI
// =============================================================================
let playControl = null;

function setupUI() {
    // 1. Modo Foco Desktop
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    // 2. Mobile Bottom Sheet
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // 3. Navegação por Abas (Parâmetros / Teoria)
    initTabs();

    // 4. Play / Pause
    playControl = initToggleButton('#btn-play-sim', (active) => {
        state.isRunning = active;
        const footerStatus = document.getElementById('footer-status-text');
        const hudStatus = document.getElementById('hud-status');
        const label = active ? 'Executando' : 'Pausado';
        if (footerStatus) footerStatus.textContent = label;
        if (hudStatus) hudStatus.textContent = label;
    });

    // 5. Botão Passo Único (dt)
    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning && playControl) playControl.setState(0);
        if (state.mode === 2 && state.m2.ghostMode === 'newton') {
            advanceNewtonStep();
        } else {
            stepPhysics(0.016);
            updateVisualScene();
            updateReadouts();
        }
    });

    // 6. Botão Reset
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
        state.time = 0.0;
        if (state.mode === 1) resetMode1();
        else resetMode2();
    });

    // 7. Ações Flutuantes do Canvas
    document.getElementById('btn-reset-camera')?.addEventListener('click', resetCameraView);

    // 9. Seletor de Modos Didáticos
    document.querySelectorAll('#mode-selector .segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = parseInt(btn.dataset.mode);
            if (m !== state.mode) {
                switchMode(m);
            }
        });
    });

    // --- MODO 1: CONTROLES ---
    document.getElementById('btn-apply-force-pulse')?.addEventListener('click', triggerMode1Force);

    syncDualSlider('#slider-m1-v0', '#num-m1-v0', (val) => {
        state.m1.v0 = val;
        if (!state.m1.hasFiredForce) {
            state.m1.vel.set(val, 0, 0);
            state.m1.ghostVel.set(val, 0, 0);
        }
        updateVisualScene();
        updateReadouts();
    });

    syncDualSlider('#slider-m1-force', '#num-m1-force', (val) => {
        state.m1.force = val;
        if (state.m1.isForceActive) {
            state.m1.acc.set(0, 0, state.m1.force / state.m1.mass);
        }
        updateVisualScene();
        updateReadouts();
    });

    syncDualSlider('#slider-m1-mass', '#num-m1-mass', (val) => {
        state.m1.mass = val;
        if (state.m1.isForceActive) {
            state.m1.acc.set(0, 0, state.m1.force / state.m1.mass);
        }
        updateVisualScene();
        updateReadouts();
    });

    document.getElementById('chk-m1-ghost')?.addEventListener('change', (e) => {
        state.m1.showGhost = e.target.checked;
        updateVisualScene();
    });

    document.getElementById('chk-m1-vectors')?.addEventListener('change', (e) => {
        state.m1.showVectors = e.target.checked;
        updateVisualScene();
    });

    // --- MODO 2: CONTROLES ---
    // Seletor de Representação: Fuga Contínua vs Passo de Newton
    document.querySelectorAll('#m2-ghost-mode-selector .segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#m2-ghost-mode-selector .segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.m2.ghostMode = btn.dataset.ghostMode;

            const pnlNewton = document.getElementById('panel-m2-newton');
            if (pnlNewton) {
                pnlNewton.style.display = state.m2.ghostMode === 'newton' ? 'block' : 'none';
            }

            resetMode2();
        });
    });

    // Botão de Avanço de Passo de Newton
    document.getElementById('btn-m2-newton-step')?.addEventListener('click', () => {
        advanceNewtonStep();
    });

    // Slider de Intervalo do Passo de Newton (dtStep)
    syncDualSlider('#slider-m2-dt-step', '#num-m2-dt-step', (val) => {
        state.m2.dtStep = val;
        updateVisualScene();
        updateReadouts();
    });

    document.getElementById('btn-m2-cut-force')?.addEventListener('click', toggleMode2CutForce);

    syncDualSlider('#slider-m2-radius', '#num-m2-radius', (val) => {
        state.m2.radius = val;
        buildOrbitCircle(val);
        if (!state.m2.isCut) {
            syncMode2KinematicsFromAngle();
            if (state.m2.streamActive && state.m2.streamGhostTrail.length <= 1) {
                state.m2.streamGhostPos.copy(state.m2.pos);
                state.m2.streamGhostVel.copy(state.m2.vel);
                state.m2.streamGhostTrail = [state.m2.streamGhostPos.clone()];
            }
        }
        updateVisualScene();
        updateReadouts();
    });

    syncDualSlider('#slider-m2-speed', '#num-m2-speed', (val) => {
        state.m2.speed = val;
        if (!state.m2.isCut) {
            syncMode2KinematicsFromAngle();
            if (state.m2.streamActive && state.m2.streamGhostTrail.length <= 1) {
                state.m2.streamGhostVel.copy(state.m2.vel);
            }
        } else if (state.m2.cutVel.length() > 0.001) {
            state.m2.cutVel.normalize().multiplyScalar(val);
        }
        updateVisualScene();
        updateReadouts();
    });

    syncDualSlider('#slider-m2-mass', '#num-m2-mass', (val) => {
        state.m2.mass = val;
        updateVisualScene();
        updateReadouts();
    });

    document.getElementById('chk-m2-ghost')?.addEventListener('change', (e) => {
        state.m2.showGhostTangent = e.target.checked;
        updateVisualScene();
    });

    document.getElementById('chk-m2-vec-v')?.addEventListener('change', (e) => {
        state.m2.showVecV = e.target.checked;
        updateVisualScene();
    });

    document.getElementById('chk-m2-vec-a')?.addEventListener('change', (e) => {
        state.m2.showVecA = e.target.checked;
        updateVisualScene();
    });

    document.getElementById('chk-m2-vec-f')?.addEventListener('change', (e) => {
        state.m2.showVecF = e.target.checked;
        updateVisualScene();
    });

    // 10. Barra Flutuante de Modo Foco
    initFocusMirrorToolbar({
        scopeSelector: '.controls-panel',
        layoutSelector: '.sim-layout',
        onlyInFocusMode: true
    });

    // 11. Modal de Instruções Iniciais (Exibido apenas na 1ª sessão e pelo botão Instruções)
    initOnboardingModal('#modal-onboarding', {
        triggerSelector: '#btn-open-onboarding'
    });
}

// =============================================================================
// 10. LOOP DE ANIMAÇÃO E EVOLUÇÃO TEMPORAL (FÍSICA DESACOPLADA DA APRESENTAÇÃO)
// =============================================================================
function stepPhysics(dt) {
    const scaledDt = dt * state.speed;
    state.time += scaledDt;

    if (state.mode === 1) {
        stepPhysicsMode1(scaledDt);
    } else {
        stepPhysicsMode2(scaledDt);
    }
}

let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    if (document.hidden) {
        lastTime = currentTime;
        return;
    }

    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    if (state.isRunning) {
        stepPhysics(dt);
        updateReadouts();
    }

    controls.update();
    updateVisualScene();
}

// =============================================================================
// 11. INICIALIZAÇÃO NO CARREGAMENTO DO DOM
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    setupUI();
    resetMode1();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});
