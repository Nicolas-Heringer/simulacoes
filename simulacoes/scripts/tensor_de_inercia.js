// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Claude Opus 4.6
// Simulação: Tensor de Inércia — Visualização Interativa
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import {
    initBottomSheet,
    initSidebarCollapse,
    initTabs,
    inlineSVGImages,
    initKaTeXAutoRender,
    diagonalizeSymmetric3x3,
    syncDualSlider,
    initFocusMirrorToolbar
} from './sim-ui.js';

// =============================================================================
// CONSTANTES E CONFIGURAÇÃO
// =============================================================================

const COLORS = {
    axisX:      0xef4444,  // vermelho
    axisY:      0x22c55e,  // verde
    axisZ:      0x3b82f6,  // azul
    accent:     0xfacc15,  // amarelo (accent do site)
    mass:       0xfacc15,  // cor da massa pontual
    trajectory: 0xfacc15,  // trajetória pontilhada
    grid:       0x334155,  // linhas do grid
    axisLine:   0xf97316,  // eixo de rotação selecionado
    ellipsoid:  0x38bdf8,  // elipsoide de inércia
    body:       0x8b5cf6,  // corpo extenso
    background: 0x0f172a,  // fundo da cena
};

const MASS_COLORS = [
    0xfacc15, 0x38bdf8, 0xf472b6, 0x4ade80,
    0xa78bfa, 0xfb923c, 0x2dd4bf, 0xe879f9,
];

// =============================================================================
// ESTADO GLOBAL DA SIMULAÇÃO
// =============================================================================

const state = {
    currentPart: 1,
    isPlaying: false,
    angularSpeed: 1.0,  // rad/s
    time: 0,

    // Eixo de rotação (vetor unitário)
    rotationAxis: new THREE.Vector3(0, 1, 0),
    axisMode: 'y',

    // Part 1: Massa pontual única
    singleMass: { mass: 1.0, position: new THREE.Vector3(2, 0, 0) },

    // Part 2: Várias massas pontuais
    masses: [],
    nextMassId: 0,

    // Part 3: Corpo extenso
    bodyType: 'solid-sphere',
    bodyMass: 2.0,
    bodyDimensions: { radius: 1.0, height: 2.0, width: 1.0, depth: 1.0 },

    // Tensor de inércia calculado (3x3)
    inertiaTensor: [[0,0,0],[0,0,0],[0,0,0]],
    momentAboutAxis: 0,
    eigenvalues: [0, 0, 0],
    eigenvectors: [[1,0,0],[0,1,0],[0,0,1]],
};

// =============================================================================
// THREE.JS — SETUP PRINCIPAL
// =============================================================================

let renderer, scene, camera, orbitControls, dragControls;
let canvasArea, clock;
let animationGroup;  // grupo que gira

// Objetos 3D
let axisArrow, trajectoryLine, gridHelper;
let massObjects = [];      // esferas de massas pontuais
let bodyMesh = null;        // mesh do corpo extenso
let principalAxesGroup;     // setas dos eixos principais

// Elipsoide mini-renderer
let ellipsoidRenderer, ellipsoidScene, ellipsoidCamera, ellipsoidMesh;

function init() {
    canvasArea = document.getElementById('canvas-area');

    // --- Renderer principal ---
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(COLORS.background);
    canvasArea.appendChild(renderer.domElement);

    // --- Cena ---
    scene = new THREE.Scene();

    // --- Câmera ---
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(5, 4, 6);
    camera.lookAt(0, 0, 0);

    // --- Controles de órbita ---
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 30;

    // --- Iluminação ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xfacc15, 0.3, 20);
    pointLight.position.set(-3, 5, -3);
    scene.add(pointLight);

    // --- Grid ---
    gridHelper = new THREE.GridHelper(20, 20, COLORS.grid, COLORS.grid);
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // --- Eixos de referência (XYZ) ---
    const axesSize = 8;
    const axesHelper = new THREE.AxesHelper(axesSize);
    scene.add(axesHelper);

    // Labels dos eixos com sprites
    addAxisLabel('X', new THREE.Vector3(axesSize + 0.3, 0, 0), COLORS.axisX);
    addAxisLabel('Y', new THREE.Vector3(0, axesSize + 0.3, 0), COLORS.axisY);
    addAxisLabel('Z', new THREE.Vector3(0, 0, axesSize + 0.3), COLORS.axisZ);

    // --- Grupo de animação (rotação) ---
    animationGroup = new THREE.Group();
    scene.add(animationGroup);

    // --- Grupo de eixos principais ---
    principalAxesGroup = new THREE.Group();
    scene.add(principalAxesGroup);

    // --- Eixo de rotação visual ---
    createRotationAxisVisual();

    // --- Clock ---
    clock = new THREE.Clock();

    // --- Inicializar elipsoide ---
    initEllipsoidRenderer();

    // --- Iniciar cena ---
    handleResize();
    window.addEventListener('resize', handleResize);

    // --- Criar cena inicial (Part 1) ---
    rebuildScene();

    // --- Iniciar loop ---
    animate();
}

// =============================================================================
// LABEL DE TEXTO COMO SPRITE
// =============================================================================

function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 42px Inter, sans-serif';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.5, 0.5, 1);
    return sprite;
}

function addAxisLabel(text, position, color) {
    const sprite = createTextSprite(text, color);
    sprite.position.copy(position);
    scene.add(sprite);
}

// =============================================================================
// EIXO DE ROTAÇÃO VISUAL
// =============================================================================

function createRotationAxisVisual() {
    if (axisArrow) scene.remove(axisArrow);

    const dir = state.rotationAxis.clone().normalize();
    const origin = dir.clone().multiplyScalar(-6);
    const length = 12;

    // Linha do eixo
    const points = [
        origin,
        origin.clone().add(dir.clone().multiplyScalar(length))
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: COLORS.axisLine,
        dashSize: 0.3,
        gapSize: 0.15,
        linewidth: 1,
    });
    axisArrow = new THREE.Line(geometry, material);
    axisArrow.computeLineDistances();
    scene.add(axisArrow);
}

// =============================================================================
// TRAJETÓRIA CIRCULAR PONTILHADA
// =============================================================================

function createTrajectoryCircle(position, axis) {
    // Calcular raio perpendicular ao eixo
    const n = axis.clone().normalize();
    const proj = n.clone().multiplyScalar(position.dot(n));
    const perp = position.clone().sub(proj);
    const radius = perp.length();

    if (radius < 0.001) return null;

    // Criar círculo no plano perpendicular ao eixo
    const segments = 128;
    const points = [];

    // Vetores ortogonais no plano
    const u = perp.clone().normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const p = proj.clone()
            .add(u.clone().multiplyScalar(Math.cos(angle) * radius))
            .add(v.clone().multiplyScalar(Math.sin(angle) * radius));
        points.push(p);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: COLORS.trajectory,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.5,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
}

// =============================================================================
// MASSA PONTUAL — ESFERA 3D
// =============================================================================

function createMassSphere(position, color = COLORS.mass, massValue = 1.0) {
    const radius = 0.1 + Math.min(massValue * 0.05, 0.25);
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.3,
        roughness: 0.4,
        emissive: color,
        emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);

    // Glow
    const glowGeo = new THREE.SphereGeometry(radius * 1.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.1,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    return mesh;
}

// =============================================================================
// CORPOS EXTENSOS
// =============================================================================

function createExtendedBody(type, dims, mass) {
    let geometry;
    const { radius, height, width, depth } = dims;

    switch (type) {
        case 'solid-sphere':
            geometry = new THREE.SphereGeometry(radius, 32, 32);
            break;
        case 'hollow-sphere':
            geometry = new THREE.SphereGeometry(radius, 32, 32);
            break;
        case 'solid-cylinder':
            geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
            break;
        case 'hollow-cylinder':
            geometry = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
            break;
        case 'rod':
            geometry = new THREE.CylinderGeometry(0.05, 0.05, height, 16);
            break;
        case 'rectangular':
            geometry = new THREE.BoxGeometry(width, height, depth);
            break;
        default:
            geometry = new THREE.SphereGeometry(radius, 32, 32);
    }

    const isHollow = type === 'hollow-sphere' || type === 'hollow-cylinder';

    const material = new THREE.MeshStandardMaterial({
        color: COLORS.body,
        metalness: 0.2,
        roughness: 0.5,
        transparent: isHollow,
        opacity: isHollow ? 0.4 : 0.85,
        side: isHollow ? THREE.DoubleSide : THREE.FrontSide,
    });

    // Wireframe para corpos ocos
    const mesh = new THREE.Mesh(geometry, material);

    if (isHollow) {
        const wireGeo = new THREE.WireframeGeometry(geometry);
        const wireMat = new THREE.LineBasicMaterial({
            color: COLORS.body,
            transparent: true,
            opacity: 0.3,
        });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        mesh.add(wire);
    }

    return mesh;
}

// =============================================================================
// CÁLCULOS DO TENSOR DE INÉRCIA
// =============================================================================

/**
 * Tensor de inércia de uma massa pontual em (x, y, z)
 * I_ij = m * (r² δ_ij - r_i * r_j)
 */
function pointMassTensor(m, x, y, z) {
    const r2 = x*x + y*y + z*z;
    return [
        [m * (r2 - x*x), m * (-x*y),       m * (-x*z)],
        [m * (-y*x),      m * (r2 - y*y),   m * (-y*z)],
        [m * (-z*x),      m * (-z*y),        m * (r2 - z*z)],
    ];
}

/**
 * Tensor de inércia para corpos extensos (fórmulas analíticas, no CM)
 */
function extendedBodyTensor(type, mass, dims) {
    const m = mass;
    const { radius: R, height: h, width: w, depth: d } = dims;

    switch (type) {
        case 'solid-sphere':
            // I = (2/5) m R²
            { const I = (2/5) * m * R * R;
              return [[I,0,0],[0,I,0],[0,0,I]]; }

        case 'hollow-sphere':
            // I = (2/3) m R²
            { const I = (2/3) * m * R * R;
              return [[I,0,0],[0,I,0],[0,0,I]]; }

        case 'solid-cylinder':
            // Eixo do cilindro = Y
            // Ixx = Izz = (1/12) m (3R² + h²)
            // Iyy = (1/2) m R²
            { const Iyy = 0.5 * m * R * R;
              const Ixx = (1/12) * m * (3*R*R + h*h);
              return [[Ixx,0,0],[0,Iyy,0],[0,0,Ixx]]; }

        case 'hollow-cylinder':
            // Iyy = m R²
            // Ixx = Izz = (1/12) m (6R² + h²)
            { const Iyy = m * R * R;
              const Ixx = (1/12) * m * (6*R*R + h*h);
              return [[Ixx,0,0],[0,Iyy,0],[0,0,Ixx]]; }

        case 'rod':
            // Barra fina ao longo de Y
            // Iyy ≈ 0
            // Ixx = Izz = (1/12) m L²
            { const I = (1/12) * m * h * h;
              return [[I,0,0],[0,0,0],[0,0,I]]; }

        case 'rectangular':
            // Ixx = (1/12) m (h² + d²)
            // Iyy = (1/12) m (w² + d²)
            // Izz = (1/12) m (w² + h²)
            { const Ixx = (1/12) * m * (h*h + d*d);
              const Iyy = (1/12) * m * (w*w + d*d);
              const Izz = (1/12) * m * (w*w + h*h);
              return [[Ixx,0,0],[0,Iyy,0],[0,0,Izz]]; }

        default:
            return [[0,0,0],[0,0,0],[0,0,0]];
    }
}

/**
 * Somar dois tensores 3x3
 */
function addTensors(A, B) {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

/**
 * Momento de inércia em relação a um eixo n̂:  I = n̂ᵀ · I · n̂
 */
function momentAboutAxis(tensor, axis) {
    const n = [axis.x, axis.y, axis.z];
    let result = 0;
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            result += n[i] * tensor[i][j] * n[j];
    return result;
}

/**
 * Diagonalização exata do tensor simétrico via método de Jacobi nativo (sim-ui.js)
 */
function diagonalizeTensor(tensor) {
    try {
        return diagonalizeSymmetric3x3(tensor);
    } catch (e) {
        console.warn('Diagonalização falhou:', e);
        return {
            values: [tensor[0][0], tensor[1][1], tensor[2][2]],
            vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        };
    }
}


// =============================================================================
// RECONSTRUIR CENA
// =============================================================================

function clearAnimationGroup() {
    while (animationGroup.children.length > 0) {
        const child = animationGroup.children[0];
        animationGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    }
    massObjects = [];
    bodyMesh = null;

    // Limpar eixos principais
    while (principalAxesGroup.children.length > 0) {
        const c = principalAxesGroup.children[0];
        principalAxesGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    }
}

function rebuildScene() {
    clearAnimationGroup();
    state.time = 0;
    animationGroup.rotation.set(0, 0, 0);
    animationGroup.quaternion.identity();

    const axis = state.rotationAxis.clone().normalize();

    if (state.currentPart === 1) {
        // Uma massa pontual
        const pos = state.singleMass.position;
        const sphere = createMassSphere(pos, COLORS.mass, state.singleMass.mass);
        animationGroup.add(sphere);
        massObjects.push(sphere);

        // Trajetória
        const traj = createTrajectoryCircle(pos, axis);
        if (traj) scene.add(traj);
        // Guardar referência para limpar
        if (!scene.userData.trajectories) scene.userData.trajectories = [];
        scene.userData.trajectories.forEach(t => scene.remove(t));
        scene.userData.trajectories = traj ? [traj] : [];

    } else if (state.currentPart === 2) {
        // Múltiplas massas
        scene.userData.trajectories?.forEach(t => scene.remove(t));
        scene.userData.trajectories = [];

        state.masses.forEach((m, i) => {
            const color = MASS_COLORS[i % MASS_COLORS.length];
            const sphere = createMassSphere(m.position, color, m.mass);
            animationGroup.add(sphere);
            massObjects.push(sphere);

            const traj = createTrajectoryCircle(m.position, axis);
            if (traj) {
                scene.add(traj);
                scene.userData.trajectories.push(traj);
            }
        });

    } else if (state.currentPart === 3) {
        // Corpo extenso
        scene.userData.trajectories?.forEach(t => scene.remove(t));
        scene.userData.trajectories = [];

        bodyMesh = createExtendedBody(state.bodyType, state.bodyDimensions, state.bodyMass);
        animationGroup.add(bodyMesh);
    }

    // Atualizar eixo visual
    createRotationAxisVisual();

    // Calcular e exibir tensor
    computeAndDisplayTensor();

    // Atualizar drag controls
    setupDragControls();
}

// =============================================================================
// DRAG CONTROLS
// =============================================================================

function setupDragControls() {
    if (dragControls) {
        dragControls.dispose();
        dragControls = null;
    }

    if (state.currentPart === 3) return; // sem drag para corpos extensos

    const draggables = massObjects.filter(o => o);
    if (draggables.length === 0) return;

    dragControls = new DragControls(draggables, camera, renderer.domElement);

    dragControls.addEventListener('dragstart', () => {
        orbitControls.enabled = false;
    });

    dragControls.addEventListener('drag', (event) => {
        const obj = event.object;
        // Atualizar posição no estado
        if (state.currentPart === 1) {
            state.singleMass.position.copy(obj.position);
            updatePart1Inputs();
        } else if (state.currentPart === 2) {
            const idx = massObjects.indexOf(obj);
            if (idx >= 0 && state.masses[idx]) {
                state.masses[idx].position.copy(obj.position);
                updateMassList();
            }
        }
        rebuildTrajectories();
        computeAndDisplayTensor();
    });

    dragControls.addEventListener('dragend', () => {
        orbitControls.enabled = true;
    });
}

function rebuildTrajectories() {
    const axis = state.rotationAxis.clone().normalize();
    scene.userData.trajectories?.forEach(t => scene.remove(t));
    scene.userData.trajectories = [];

    const positions = state.currentPart === 1
        ? [state.singleMass.position]
        : state.masses.map(m => m.position);

    positions.forEach(pos => {
        const traj = createTrajectoryCircle(pos, axis);
        if (traj) {
            scene.add(traj);
            scene.userData.trajectories.push(traj);
        }
    });
}

// =============================================================================
// CALCULAR E EXIBIR TENSOR
// =============================================================================

function computeAndDisplayTensor() {
    let tensor = [[0,0,0],[0,0,0],[0,0,0]];

    if (state.currentPart === 1) {
        const { mass, position: p } = state.singleMass;
        tensor = pointMassTensor(mass, p.x, p.y, p.z);

    } else if (state.currentPart === 2) {
        state.masses.forEach(m => {
            const t = pointMassTensor(m.mass, m.position.x, m.position.y, m.position.z);
            tensor = addTensors(tensor, t);
        });

    } else if (state.currentPart === 3) {
        tensor = extendedBodyTensor(state.bodyType, state.bodyMass, state.bodyDimensions);
    }

    state.inertiaTensor = tensor;

    // Momento de inércia no eixo selecionado
    const axis = state.rotationAxis.clone().normalize();
    state.momentAboutAxis = momentAboutAxis(tensor, axis);

    // Diagonalização
    const diag = diagonalizeTensor(tensor);
    state.eigenvalues = diag.values;
    state.eigenvectors = diag.vectors;

    // Atualizar UI
    updateTensorDisplay();
    updateEllipsoid();
}

// =============================================================================
// ATUALIZAR UI — TENSOR
// =============================================================================

function updateTensorDisplay() {
    const T = state.inertiaTensor;

    // Células do tensor
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const el = document.getElementById(`I${i}${j}`);
            if (el) {
                el.textContent = T[i][j].toFixed(3);
                el.className = (i === j) ? 'diagonal' : 'off-diagonal';
            }
        }
    }

    // Momento de inércia no eixo
    const momentEl = document.getElementById('moment-value');
    if (momentEl) momentEl.textContent = `${state.momentAboutAxis.toFixed(4)} kg·m²`;

    // Badge no canvas
    const badgeEl = document.getElementById('badge-inertia-value');
    if (badgeEl) badgeEl.textContent = state.momentAboutAxis.toFixed(3);

    // Autovalores
    const eigenEl = document.getElementById('eigenvalues');
    if (eigenEl) {
        eigenEl.textContent = state.eigenvalues.map(v => v.toFixed(3)).join(', ');
    }

    // Eixos principais info
    const axesInfoEl = document.getElementById('principal-axes-info');
    if (axesInfoEl) {
        const strs = state.eigenvectors.map((v, i) =>
            `ê${i+1}=(${v.map(c => c.toFixed(2)).join(',')})`
        );
        axesInfoEl.textContent = strs.join(' ');
    }
}

// =============================================================================
// ELIPSOIDE DE INÉRCIA (mini renderer)
// =============================================================================

function initEllipsoidRenderer() {
    const container = document.getElementById('ellipsoid-container');
    if (!container) return;

    ellipsoidRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    ellipsoidRenderer.setPixelRatio(window.devicePixelRatio);
    ellipsoidRenderer.setClearColor(0x000000, 0);
    container.appendChild(ellipsoidRenderer.domElement);

    ellipsoidScene = new THREE.Scene();
    ellipsoidCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    ellipsoidCamera.position.set(3, 2, 3);
    ellipsoidCamera.lookAt(0, 0, 0);

    // Iluminação
    ellipsoidScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dlight = new THREE.DirectionalLight(0xffffff, 0.7);
    dlight.position.set(3, 4, 3);
    ellipsoidScene.add(dlight);

    // Eixos de referência
    ellipsoidScene.add(new THREE.AxesHelper(2));

    // Esfera padrão (será escalada)
    const geo = new THREE.SphereGeometry(1, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: COLORS.ellipsoid,
        transparent: true,
        opacity: 0.4,
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
    });
    ellipsoidMesh = new THREE.Mesh(geo, mat);
    ellipsoidScene.add(ellipsoidMesh);

    // Wireframe
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({
        color: COLORS.ellipsoid,
        transparent: true,
        opacity: 0.3,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    ellipsoidMesh.add(wire);

    resizeEllipsoid();
}

function resizeEllipsoid() {
    const container = document.getElementById('ellipsoid-container');
    if (!container || !ellipsoidRenderer) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    ellipsoidRenderer.setSize(w, h);
    ellipsoidCamera.aspect = w / h;
    ellipsoidCamera.updateProjectionMatrix();
}

function updateEllipsoid() {
    if (!ellipsoidMesh) return;

    const vals = state.eigenvalues;
    const vecs = state.eigenvectors;

    // Escala proporcional aos momentos principais
    // Elipsoide de inércia: semi-eixos = 1/sqrt(I_i)
    // Para visualização, usamos escala normalizada
    const maxVal = Math.max(...vals.map(Math.abs), 0.001);
    const scales = vals.map(v => {
        const absV = Math.abs(v);
        if (absV < 1e-6) return 0.05;
        return Math.sqrt(maxVal / absV);
    });

    // Normalizar para tamanho visual agradável
    const maxScale = Math.max(...scales, 0.01);
    const normScales = scales.map(s => (s / maxScale) * 1.2);

    // Rotação baseada nos autovetores
    const rotMatrix = new THREE.Matrix4();
    const e = vecs;
    rotMatrix.set(
        e[0][0], e[1][0], e[2][0], 0,
        e[0][1], e[1][1], e[2][1], 0,
        e[0][2], e[1][2], e[2][2], 0,
        0,       0,       0,       1
    );

    ellipsoidMesh.matrix.identity();
    ellipsoidMesh.matrix.multiply(rotMatrix);
    ellipsoidMesh.matrix.scale(new THREE.Vector3(normScales[0], normScales[1], normScales[2]));
    ellipsoidMesh.matrixAutoUpdate = false;
    ellipsoidMesh.matrixWorldNeedsUpdate = true;

    // Atualizar eixos principais na cena principal
    updatePrincipalAxes();
}

function updatePrincipalAxes() {
    // Limpar
    while (principalAxesGroup.children.length > 0) {
        const c = principalAxesGroup.children[0];
        principalAxesGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
    }

    const colors = [0xef4444, 0x22c55e, 0x3b82f6]; // R, G, B

    state.eigenvectors.forEach((vec, i) => {
        const dir = new THREE.Vector3(vec[0], vec[1], vec[2]).normalize();
        const length = 3;
        const arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), length, colors[i], 0.2, 0.12);
        arrowHelper.line.material.opacity = 0.6;
        arrowHelper.line.material.transparent = true;
        principalAxesGroup.add(arrowHelper);

        // Também na direção oposta (pontilhada)
        const negDir = dir.clone().negate();
        const negPts = [new THREE.Vector3(0,0,0), negDir.clone().multiplyScalar(length)];
        const negGeo = new THREE.BufferGeometry().setFromPoints(negPts);
        const negMat = new THREE.LineDashedMaterial({
            color: colors[i],
            dashSize: 0.2,
            gapSize: 0.1,
            transparent: true,
            opacity: 0.3,
        });
        const negLine = new THREE.Line(negGeo, negMat);
        negLine.computeLineDistances();
        principalAxesGroup.add(negLine);
    });
}

// =============================================================================
// DIAGONALIZAÇÃO ANIMADA
// =============================================================================

function animateDiagonalization() {
    const diag = diagonalizeTensor(state.inertiaTensor);
    state.eigenvalues = diag.values;
    state.eigenvectors = diag.vectors;

    // Construir quaternion de rotação a partir dos autovetores
    const e = diag.vectors;
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.set(
        e[0][0], e[1][0], e[2][0], 0,
        e[0][1], e[1][1], e[2][1], 0,
        e[0][2], e[1][2], e[2][2], 0,
        0,       0,       0,       1
    );

    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Animação suave
    const startQuat = animationGroup.quaternion.clone();
    const duration = 1500;
    const startTime = performance.now();

    state.isPlaying = false;
    updatePlayButton();

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        animationGroup.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            // Atualizar tensor exibido para forma diagonal
            const diagTensor = [
                [diag.values[0], 0, 0],
                [0, diag.values[1], 0],
                [0, 0, diag.values[2]],
            ];
            state.inertiaTensor = diagTensor;
            updateTensorDisplay();
        }
    }
    requestAnimationFrame(step);
}

// =============================================================================
// LOOP DE ANIMAÇÃO
// =============================================================================

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (state.isPlaying) {
        state.time += delta;
        const angle = state.angularSpeed * delta;
        const axis = state.rotationAxis.clone().normalize();
        const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        animationGroup.quaternion.premultiply(q);
    }

    orbitControls.update();
    renderer.render(scene, camera);

    // Render elipsoide
    if (ellipsoidRenderer && ellipsoidScene && ellipsoidCamera) {
        // Rotação lenta do elipsoide para efeito visual
        if (ellipsoidMesh) {
            // Manter a rotação via matrix, sem autoUpdate
        }
        ellipsoidRenderer.render(ellipsoidScene, ellipsoidCamera);
    }
}

// =============================================================================
// RESIZE
// =============================================================================

function handleResize() {
    const rect = canvasArea.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    resizeEllipsoid();
}

// =============================================================================
// UI — EVENT LISTENERS
// =============================================================================

function initUI() {
    // Seletor de parte
    document.getElementById('part-select').addEventListener('change', (e) => {
        state.currentPart = parseInt(e.target.value);
        showPartControls();
        rebuildScene();
    });

    // Botões de eixo
    document.querySelectorAll('.axis-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.axis-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.axis;
            state.axisMode = mode;

            const customInputs = document.getElementById('custom-axis-inputs');
            if (mode === 'custom') {
                customInputs.style.display = 'flex';
                updateCustomAxis();
            } else {
                customInputs.style.display = 'none';
                switch (mode) {
                    case 'x': state.rotationAxis.set(1, 0, 0); break;
                    case 'y': state.rotationAxis.set(0, 1, 0); break;
                    case 'z': state.rotationAxis.set(0, 0, 1); break;
                }
                rebuildScene();
            }
        });
    });

    // Custom axis inputs
    ['axis-nx', 'axis-ny', 'axis-nz'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCustomAxis);
    });

    // Part 1 inputs
    ['mass-single', 'pos-x', 'pos-y', 'pos-z'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            state.singleMass.mass = parseFloat(document.getElementById('mass-single').value) || 1;
            state.singleMass.position.set(
                parseFloat(document.getElementById('pos-x').value) || 0,
                parseFloat(document.getElementById('pos-y').value) || 0,
                parseFloat(document.getElementById('pos-z').value) || 0,
            );
            rebuildScene();
        });
    });

    // Part 2: Add mass
    document.getElementById('add-mass-btn').addEventListener('click', () => {
        const id = state.nextMassId++;
        const angle = (state.masses.length / 4) * Math.PI;
        state.masses.push({
            id,
            mass: 1.0,
            position: new THREE.Vector3(
                2 * Math.cos(angle),
                0,
                2 * Math.sin(angle)
            ),
        });
        updateMassList();
        rebuildScene();
    });

    // Part 2: Clear masses
    document.getElementById('clear-masses-btn').addEventListener('click', () => {
        state.masses = [];
        updateMassList();
        rebuildScene();
    });

    // Part 3: Body type
    document.getElementById('body-type-select').addEventListener('change', (e) => {
        state.bodyType = e.target.value;
        updateBodyDimensionInputs();
        rebuildScene();
    });

    // Part 3: Body mass
    document.getElementById('body-mass').addEventListener('input', (e) => {
        state.bodyMass = parseFloat(e.target.value) || 1;
        rebuildScene();
    });

    // Play/Pause
    document.getElementById('play-pause-btn').addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        updatePlayButton();
    });

    // Reset
    document.getElementById('reset-btn').addEventListener('click', () => {
        state.isPlaying = false;
        state.time = 0;
        animationGroup.rotation.set(0, 0, 0);
        animationGroup.quaternion.identity();
        updatePlayButton();
        rebuildScene();
    });

    // Speed slider sincronizado
    syncDualSlider('#speed-slider', '#speed-input', (val) => {
        state.angularSpeed = val;
    });

    // Diagonalizar
    document.getElementById('diagonalize-btn').addEventListener('click', () => {
        animateDiagonalization();
    });

    // Inicializar subsistemas do Design System 2.0
    inlineSVGImages();
    initTabs('.controls-panel');
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: handleResize
    });
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });
    initBottomSheet('#controls-panel');
    initKaTeXAutoRender();

    // Inicializar UI
    showPartControls();
    updateBodyDimensionInputs();
}


function updateCustomAxis() {
    const nx = parseFloat(document.getElementById('axis-nx').value) || 0;
    const ny = parseFloat(document.getElementById('axis-ny').value) || 0;
    const nz = parseFloat(document.getElementById('axis-nz').value) || 0;
    const v = new THREE.Vector3(nx, ny, nz);
    if (v.length() > 0.001) {
        state.rotationAxis.copy(v.normalize());
    }
    rebuildScene();
}

function showPartControls() {
    document.querySelectorAll('.part-controls').forEach(el => el.style.display = 'none');
    const partId = `part${state.currentPart}-controls`;
    const el = document.getElementById(partId);
    if (el) el.style.display = 'flex';
}

function updatePlayButton() {
    const btn = document.getElementById('play-pause-btn');
    if (!btn) return;
    btn.textContent = state.isPlaying ? '⏸ Pausar' : '▶ Play';
    btn.classList.toggle('is-active', state.isPlaying);
}

function updatePart1Inputs() {
    document.getElementById('pos-x').value = state.singleMass.position.x.toFixed(1);
    document.getElementById('pos-y').value = state.singleMass.position.y.toFixed(1);
    document.getElementById('pos-z').value = state.singleMass.position.z.toFixed(1);
}

// =============================================================================
// UI — LISTA DE MASSAS (Part 2)
// =============================================================================

function updateMassList() {
    const container = document.getElementById('mass-list');
    container.innerHTML = '';

    state.masses.forEach((m, i) => {
        const color = MASS_COLORS[i % MASS_COLORS.length];
        const colorHex = '#' + color.toString(16).padStart(6, '0');

        const div = document.createElement('div');
        div.className = 'mass-item';
        div.innerHTML = `
            <span class="color-dot" style="background:${colorHex};"></span>
            <span class="mass-label">m</span>
            <input type="number" value="${m.mass.toFixed(1)}" step="0.1" min="0.1"
                   data-idx="${i}" data-field="mass" class="mass-field" />
            <span class="mass-label">x</span>
            <input type="number" value="${m.position.x.toFixed(1)}" step="0.5"
                   data-idx="${i}" data-field="px" class="mass-field" />
            <span class="mass-label">y</span>
            <input type="number" value="${m.position.y.toFixed(1)}" step="0.5"
                   data-idx="${i}" data-field="py" class="mass-field" />
            <span class="mass-label">z</span>
            <input type="number" value="${m.position.z.toFixed(1)}" step="0.5"
                   data-idx="${i}" data-field="pz" class="mass-field" />
            <button class="btn-remove" data-idx="${i}">✕</button>
        `;
        container.appendChild(div);
    });

    // Eventos para inputs
    container.querySelectorAll('.mass-field').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const field = e.target.dataset.field;
            const val = parseFloat(e.target.value) || 0;

            if (field === 'mass') state.masses[idx].mass = Math.max(val, 0.1);
            else if (field === 'px') state.masses[idx].position.x = val;
            else if (field === 'py') state.masses[idx].position.y = val;
            else if (field === 'pz') state.masses[idx].position.z = val;

            rebuildScene();
        });
    });

    // Eventos para remover
    container.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            state.masses.splice(idx, 1);
            updateMassList();
            rebuildScene();
        });
    });
}

// =============================================================================
// UI — DIMENSÕES DO CORPO EXTENSO (Part 3)
// =============================================================================

function updateBodyDimensionInputs() {
    const container = document.getElementById('body-dimensions');
    container.innerHTML = '';

    const type = state.bodyType;
    const dims = state.bodyDimensions;
    const fields = [];

    if (type === 'solid-sphere' || type === 'hollow-sphere') {
        fields.push({ label: 'Raio (m)', key: 'radius', value: dims.radius });
    } else if (type === 'solid-cylinder' || type === 'hollow-cylinder') {
        fields.push({ label: 'Raio (m)', key: 'radius', value: dims.radius });
        fields.push({ label: 'Altura (m)', key: 'height', value: dims.height });
    } else if (type === 'rod') {
        fields.push({ label: 'Comprimento (m)', key: 'height', value: dims.height });
    } else if (type === 'rectangular') {
        fields.push({ label: 'Largura X (m)', key: 'width', value: dims.width });
        fields.push({ label: 'Altura Y (m)', key: 'height', value: dims.height });
        fields.push({ label: 'Profundidade Z (m)', key: 'depth', value: dims.depth });
    }

    fields.forEach(f => {
        const row = document.createElement('div');
        row.className = 'input-row';
        row.innerHTML = `
            <label>${f.label}</label>
            <input type="number" class="sim-input body-dim-input"
                   data-key="${f.key}" value="${f.value.toFixed(1)}" step="0.1" min="0.1" />
        `;
        container.appendChild(row);
    });

    // Eventos
    container.querySelectorAll('.body-dim-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            state.bodyDimensions[key] = Math.max(parseFloat(e.target.value) || 0.1, 0.1);
            rebuildScene();
        });
    });
}

// =============================================================================
// INICIALIZAÇÃO
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    init();
    initUI();
});
