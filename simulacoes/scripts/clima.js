// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Tesselação de Voronoi & Dinâmica Climática Planetária (SCVT)
// Módulo: Main Thread (Abas 1 a 4: Matemática, Ciência, Estações e Clima/Ventos)
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    initSidebarCollapse,
    initBottomSheet,
    initTabs,
    initFocusMirrorToolbar,
    syncDualSlider,
    initModal,
    inlineSVGImages,
    initKaTeXAutoRender
} from './sim-ui.js';

// Constantes Físicas Planetárias
const REAL_EARTH_RADIUS_KM = 6371; // Raio médio real da Terra em km
const REAL_EARTH_SURFACE_KM2 = 510065600; // Área superficial total da Terra (~510 milhões de km²)
const REAL_TROPOSPHERE_KM = 12;    // Espessura média da troposfera terrestre (~12 km)
const AXIAL_TILT_DEG = 23.44;      // Inclinação do eixo terrestre em relação à Eclíptica
const AXIAL_TILT_RAD = (AXIAL_TILT_DEG * Math.PI) / 180.0;

// URL da Textura de Alta Resolução da Terra (NASA Blue Marble / Three.js CDN)
const EARTH_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_TEXTURE_FALLBACK = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';

// =============================================================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// =============================================================================

const state = {
    // Aba Ativa: 'tab-math', 'tab-science', 'tab-seasons' ou 'tab-atmosphere'
    activeTab: 'tab-math',

    // Parâmetros de Geometria (Aba 1)
    numCells: 500,
    isAutoLloyd: false,
    lloydIteration: 0,
    lloydAvgShift: 0.0,
    lloydSpeed: 10,

    // Parâmetros de Escala Planetária e Atmosférica (Aba 2)
    coreRadius: 0.93,
    shellOpacity: 0.85,

    // Parâmetros de Mecânica Orbital e Estações (Aba 3)
    dayOfYear: 172,
    hourOfDay: 12.0,
    isPlayingOrbit: false,
    isPlayingDiurnal: false,
    orbitSpeed: 30,
    diurnalSpeed: 6.0,
    showAxialTilt: true,
    showPolarAxis: true,
    showSunTerminator: true,
    showEclipticPlane: true,

    // Parâmetros Astronômicos Acoplados
    sunDeclinationRad: 0.0,  // Declinação solar orbital acoplada (δ em radianos)

    // Visualização 3D Comum
    showEarthTexture: true,
    showStars: true,
    showConstellations: true,
    showGenerators: true,
    showWireframe: true,
    showGraticule: true,
    autoRotate: false
};

// =============================================================================
// 2. DADOS ASTRONÔMICOS: ESTRELAS DO ZODÍACO E CONSTELAÇÕES CELESTES
// =============================================================================

function raDecToXYZ(raHours, decDeg, radius = 75.0) {
    const raRad = (raHours / 24.0) * 2.0 * Math.PI;
    const decRad = (decDeg / 180.0) * Math.PI;

    const x = radius * Math.cos(decRad) * Math.cos(raRad);
    const y = radius * Math.sin(decRad);
    const z = radius * Math.cos(decRad) * Math.sin(raRad);
    return [x, y, z];
}

const CONSTELLATIONS = [
    { name: 'Áries', sign: 'Aries', stars: [[2.11, 23.46], [1.91, 20.80], [1.89, 19.29]], lines: [[0, 1], [1, 2]] },
    { name: 'Touro', sign: 'Taurus', stars: [[4.60, 16.51], [5.44, 28.61], [3.79, 24.11], [5.63, 21.14], [4.47, 19.18]], lines: [[0, 4], [4, 2], [0, 3], [3, 1]] },
    { name: 'Gêmeos', sign: 'Gemini', stars: [[7.58, 31.89], [7.76, 28.03], [6.63, 16.40], [7.34, 21.98], [6.73, 25.13], [6.38, 22.51]], lines: [[0, 4], [4, 5], [5, 2], [1, 3], [3, 2], [0, 1]] },
    { name: 'Câncer', sign: 'Cancer', stars: [[8.97, 11.86], [8.28, 9.19], [8.72, 18.15], [8.74, 18.01]], lines: [[0, 2], [2, 3], [3, 1]] },
    { name: 'Leão', sign: 'Leo', stars: [[10.14, 11.97], [10.33, 19.84], [11.82, 14.57], [11.23, 20.52], [9.88, 23.77], [10.27, 23.42]], lines: [[0, 1], [1, 5], [5, 4], [1, 3], [3, 2], [2, 0]] },
    { name: 'Virgem', sign: 'Virgo', stars: [[13.42, -11.16], [12.69, -1.45], [13.04, 10.96], [11.84, 1.77], [12.33, -0.67], [13.58, -0.60]], lines: [[0, 4], [4, 1], [1, 3], [1, 5], [5, 2], [5, 0]] },
    { name: 'Libra', sign: 'Libra', stars: [[15.28, -9.38], [14.85, -16.04], [15.59, -14.79], [15.07, -25.25]], lines: [[0, 1], [1, 3], [3, 2], [2, 0]] },
    { name: 'Escorpião', sign: 'Scorpius', stars: [[16.49, -26.43], [16.09, -19.80], [16.01, -22.62], [17.62, -43.00], [17.56, -37.10], [17.51, -37.29], [16.84, -34.29]], lines: [[1, 2], [2, 0], [0, 6], [6, 3], [3, 4], [4, 5]] },
    { name: 'Sagitário', sign: 'Sagittarius', stars: [[18.40, -34.38], [18.92, -26.30], [19.04, -29.88], [18.36, -29.83], [18.47, -25.42], [18.09, -30.42]], lines: [[0, 3], [3, 4], [4, 1], [1, 2], [2, 0], [3, 5]] },
    { name: 'Capricórnio', sign: 'Capricornus', stars: [[20.30, -12.54], [20.35, -14.78], [21.78, -16.13], [21.67, -16.66], [20.86, -26.92]], lines: [[0, 1], [1, 4], [4, 3], [3, 2], [2, 0]] },
    { name: 'Aquário', sign: 'Aquarius', stars: [[21.52, -5.57], [22.09, -0.32], [22.91, -15.82], [20.79, -9.50], [22.36, -1.39]], lines: [[3, 0], [0, 1], [1, 4], [4, 2]] },
    { name: 'Peixes', sign: 'Pisces', stars: [[2.03, 2.76], [23.06, 3.28], [1.23, 7.59], [1.69, 15.35], [23.29, 3.28]], lines: [[0, 2], [2, 3], [0, 1], [1, 4]] },
    { name: 'Cruzeiro do Sul', stars: [[12.44, -63.10], [12.79, -59.69], [12.52, -57.11], [12.25, -58.75]], lines: [[0, 2], [1, 3]] },
    { name: 'Órion', stars: [[5.92, 7.41], [5.24, -8.20], [5.42, 6.35], [5.79, -9.67], [5.68, -1.94], [5.60, -1.20], [5.53, -0.30]], lines: [[0, 2], [2, 6], [6, 5], [5, 4], [4, 1], [1, 3], [3, 0]] }
];

function getGeographicLocation(latDeg, lonDeg) {
    if (latDeg > 66.5) return 'Círculo Polar Ártico';
    if (latDeg < -60) return 'Antártica / Oceano Austral';

    if (latDeg >= -56 && latDeg <= 13 && lonDeg >= -82 && lonDeg <= -34) return 'América do Sul';
    if (latDeg > 13 && latDeg <= 75 && lonDeg >= -168 && lonDeg <= -52) return 'América do Norte';
    if (latDeg >= -35 && latDeg <= 37 && lonDeg >= -18 && lonDeg <= 52) return 'África';
    if (latDeg >= 36 && latDeg <= 71 && lonDeg >= -10 && lonDeg <= 42) return 'Europa';
    if (latDeg >= 0 && latDeg <= 75 && lonDeg > 42 && lonDeg <= 180) return 'Ásia';
    if (latDeg >= -50 && latDeg <= -10 && lonDeg >= 110 && lonDeg <= 180) return 'Oceania / Austrália';

    if (lonDeg >= -70 && lonDeg <= 20) return 'Oceano Atlântico';
    if (lonDeg > 20 && lonDeg <= 110) return 'Oceano Índico';
    return 'Oceano Pacífico';
}

const CALENDAR_MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CALENDAR_SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDayOfYearFromDate(dayOfMonth, monthIdx) {
    const safeMonth = Math.max(0, Math.min(11, monthIdx));
    const maxDays = DAYS_IN_MONTH[safeMonth] || 31;
    const clampedDay = Math.max(1, Math.min(maxDays, Math.floor(dayOfMonth) || 1));
    let doy = 0;
    for (let m = 0; m < safeMonth; m++) {
        doy += DAYS_IN_MONTH[m];
    }
    doy += clampedDay;
    return Math.max(1, Math.min(365, doy));
}

function getZodiacConstellationInfo(dayOfYear) {
    let d = Math.max(1, Math.min(365, Math.floor(dayOfYear)));
    let monthIdx = 0;
    while (d > DAYS_IN_MONTH[monthIdx] && monthIdx < 11) {
        d -= DAYS_IN_MONTH[monthIdx];
        monthIdx++;
    }
    const dateFormatted = `${d} de ${CALENDAR_MONTHS[monthIdx]}`;
    const dateShort = `${d}/${CALENDAR_SHORT_MONTHS[monthIdx]}`;

    const lambdaOrbit = ((dayOfYear - 80 + 365) % 365) * (2.0 * Math.PI / 365.0);
    const sunDeclDeg = (Math.asin(Math.sin(AXIAL_TILT_RAD) * Math.sin(lambdaOrbit)) * 180.0 / Math.PI);

    let sunZodiac = 'Gêmeos';
    let midnightZodiac = 'Sagitário';

    if (dayOfYear >= 80 && dayOfYear < 111) { sunZodiac = 'Áries (Aries)'; midnightZodiac = 'Libra'; }
    else if (dayOfYear >= 111 && dayOfYear < 142) { sunZodiac = 'Touro (Taurus)'; midnightZodiac = 'Escorpião'; }
    else if (dayOfYear >= 142 && dayOfYear < 173) { sunZodiac = 'Gêmeos (Gemini)'; midnightZodiac = 'Sagitário'; }
    else if (dayOfYear >= 173 && dayOfYear < 204) { sunZodiac = 'Câncer (Cancer)'; midnightZodiac = 'Capricórnio'; }
    else if (dayOfYear >= 204 && dayOfYear < 235) { sunZodiac = 'Leão (Leo)'; midnightZodiac = 'Aquário'; }
    else if (dayOfYear >= 235 && dayOfYear < 266) { sunZodiac = 'Virgem (Virgo)'; midnightZodiac = 'Peixes'; }
    else if (dayOfYear >= 266 && dayOfYear < 297) { sunZodiac = 'Libra'; midnightZodiac = 'Áries'; }
    else if (dayOfYear >= 297 && dayOfYear < 328) { sunZodiac = 'Escorpião (Scorpius)'; midnightZodiac = 'Touro'; }
    else if (dayOfYear >= 328 && dayOfYear < 356) { sunZodiac = 'Sagitário (Sagittarius)'; midnightZodiac = 'Gêmeos'; }
    else if (dayOfYear >= 356 || dayOfYear < 20) { sunZodiac = 'Capricórnio (Capricornus)'; midnightZodiac = 'Câncer'; }
    else if (dayOfYear >= 20 && dayOfYear < 50) { sunZodiac = 'Aquário (Aquarius)'; midnightZodiac = 'Leão'; }
    else { sunZodiac = 'Peixes (Pisces)'; midnightZodiac = 'Virgem'; }

    return {
        dateFormatted,
        dateShort,
        lambdaOrbit,
        sunDeclDeg,
        sunZodiac,
        midnightZodiac,
        dayOfMonth: d,
        monthIdx
    };
}

// =============================================================================
// 3. CENA THREE.JS, HIERARQUIA DE TRANSFORMAÇÃO & ILUMINAÇÃO
// =============================================================================

const container = document.getElementById('three-container');
const cellTooltip = document.getElementById('cell-tooltip');

let scene, camera, renderer, controls;

// Hierarquia de Grupos da Terra
let earthSystemGroup = null;
let earthTiltGroup = null;
let earthSpinGroup = null;

// Malhas 3D
let globeCoreMesh = null;
let globeMesh = null;
let wireframeMesh = null;
let generatorPointsMesh = null;
let graticuleGroup = null;
let starfieldPointsMesh = null;
let constellationsGroup = null;
let polarAxisLineGroup = null;
let eclipticPlaneMesh = null;
let sunVisualGroup = null;
let hoverHighlightMesh = null;

let ambientLight = null, sunLight = null;
let globeGeometry = null, globeMaterial = null;
let earthTexture = null, earthSolidMaterial = null;

// Cache dos dados da malha para Raycasting e Física
let currentCellPositions = null;
let currentCellCount = 0;
let lastMeshPayload = null;

function initThreeScene() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b16);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 1.2, 2.6);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.2;
    controls.maxDistance = 10.0;
    controls.autoRotate = false;

    earthSystemGroup = new THREE.Group();
    scene.add(earthSystemGroup);

    earthTiltGroup = new THREE.Group();
    earthSystemGroup.add(earthTiltGroup);

    earthSpinGroup = new THREE.Group();
    earthTiltGroup.add(earthSpinGroup);

    // Carregamento da Textura da Terra com Fallback
    const textureLoader = new THREE.TextureLoader();
    earthTexture = textureLoader.load(
        EARTH_TEXTURE_URL,
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            renderer.render(scene, camera);
        },
        undefined,
        () => {
            earthTexture = textureLoader.load(
                EARTH_TEXTURE_FALLBACK,
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    if (earthSolidMaterial) {
                        earthSolidMaterial.map = tex;
                        earthSolidMaterial.needsUpdate = true;
                    }
                    renderer.render(scene, camera);
                },
                undefined,
                () => { createProceduralEarthTexture(); }
            );
        }
    );
    earthTexture.colorSpace = THREE.SRGBColorSpace;

    // Planeta Sólido Interno
    const coreGeo = new THREE.SphereGeometry(1.0, 64, 32);
    earthSolidMaterial = new THREE.MeshStandardMaterial({
        map: earthTexture,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.FrontSide,
        depthWrite: true,
        depthTest: true
    });
    globeCoreMesh = new THREE.Mesh(coreGeo, earthSolidMaterial);
    globeCoreMesh.scale.setScalar(state.coreRadius);
    globeCoreMesh.visible = (state.activeTab !== 'tab-math');
    globeCoreMesh.renderOrder = 1;
    earthSpinGroup.add(globeCoreMesh);

    // Iluminação
    ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    sunLight.position.set(5, 3, 4);
    scene.add(sunLight);

    // Marcador de Destaque no Hover
    const highlightGeo = new THREE.RingGeometry(0.01, 0.03, 16);
    const highlightMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.9
    });
    hoverHighlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    hoverHighlightMesh.visible = false;
    hoverHighlightMesh.renderOrder = 6;
    earthSpinGroup.add(hoverHighlightMesh);

    createGraticuleLines();
    createStarfieldAndConstellations();
    createAstronomicalGuides();

    window.addEventListener('resize', onWindowResize);

    if (window.ResizeObserver && container) {
        const resizeObserver = new ResizeObserver(() => {
            onWindowResize();
        });
        resizeObserver.observe(container);
    }

    setupHoverRaycasting();
}

function createProceduralEarthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f2b48';
    ctx.fillRect(0, 0, 1024, 512);

    ctx.fillStyle = '#2d5a3f';
    ctx.beginPath();
    ctx.ellipse(280, 200, 120, 80, 0, 0, Math.PI * 2);
    ctx.ellipse(320, 360, 70, 100, 0.2, 0, Math.PI * 2);
    ctx.ellipse(560, 220, 90, 80, 0, 0, Math.PI * 2);
    ctx.ellipse(540, 320, 80, 90, 0, 0, Math.PI * 2);
    ctx.ellipse(820, 360, 60, 50, 0, 0, Math.PI * 2);
    ctx.fill();

    const procTexture = new THREE.CanvasTexture(canvas);
    procTexture.colorSpace = THREE.SRGBColorSpace;
    if (earthSolidMaterial) {
        earthSolidMaterial.map = procTexture;
        earthSolidMaterial.needsUpdate = true;
    }
}

function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

function createGraticuleLines() {
    graticuleGroup = new THREE.Group();
    const R = 1.002;

    const eqPoints = [];
    for (let i = 0; i <= 128; i++) {
        const theta = (i / 128) * 2 * Math.PI;
        eqPoints.push(new THREE.Vector3(Math.cos(theta) * R, 0, Math.sin(theta) * R));
    }
    const eqGeo = new THREE.BufferGeometry().setFromPoints(eqPoints);
    const eqMat = new THREE.LineBasicMaterial({
        color: 0xfacc15,
        opacity: 0.75,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
    graticuleGroup.add(new THREE.Line(eqGeo, eqMat));

    const lats = [Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3];
    for (const lat of lats) {
        const latPoints = [];
        const rLat = R * Math.cos(lat);
        const yLat = R * Math.sin(lat);
        for (let i = 0; i <= 64; i++) {
            const theta = (i / 64) * 2 * Math.PI;
            latPoints.push(new THREE.Vector3(Math.cos(theta) * rLat, yLat, Math.sin(theta) * rLat));
        }
        const latGeo = new THREE.BufferGeometry().setFromPoints(latPoints);
        const latMat = new THREE.LineBasicMaterial({
            color: 0x64748b,
            opacity: 0.35,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });
        graticuleGroup.add(new THREE.Line(latGeo, latMat));
    }

    for (let m = 0; m < 8; m++) {
        const lon = (m / 8) * 2 * Math.PI;
        const lonPoints = [];
        for (let i = 0; i <= 64; i++) {
            const lat = -Math.PI / 2 + (i / 64) * Math.PI;
            lonPoints.push(new THREE.Vector3(
                R * Math.cos(lat) * Math.cos(lon),
                R * Math.sin(lat),
                R * Math.cos(lat) * Math.sin(lon)
            ));
        }
        const lonGeo = new THREE.BufferGeometry().setFromPoints(lonPoints);
        const lonMat = new THREE.LineBasicMaterial({
            color: 0x475569,
            opacity: 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });
        graticuleGroup.add(new THREE.Line(lonGeo, lonMat));
    }

    graticuleGroup.visible = state.showGraticule;
    graticuleGroup.renderOrder = 3;
    earthSpinGroup.add(graticuleGroup);
}

function createStarSpriteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.75)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
}

function createStarfieldAndConstellations() {
    const STAR_RADIUS = 75.0;
    const starSprite = createStarSpriteTexture();

    const numBackgroundStars = 2000;
    const starPositions = new Float32Array(numBackgroundStars * 3);
    const starColors = new Float32Array(numBackgroundStars * 3);

    for (let i = 0; i < numBackgroundStars; i++) {
        const z = 2.0 * Math.random() - 1.0;
        const theta = 2.0 * Math.PI * Math.random();
        const r = Math.sqrt(Math.max(0.0, 1.0 - z * z));

        starPositions[3 * i] = r * Math.cos(theta) * STAR_RADIUS;
        starPositions[3 * i + 1] = z * STAR_RADIUS;
        starPositions[3 * i + 2] = r * Math.sin(theta) * STAR_RADIUS;

        const starType = Math.random();
        let cr = 1.0, cg = 1.0, cb = 1.0;
        if (starType < 0.25) { cr = 0.75; cg = 0.85; cb = 1.0; }
        else if (starType < 0.65) { cr = 0.95; cg = 0.95; cb = 1.0; }
        else if (starType < 0.88) { cr = 1.0; cg = 0.92; cb = 0.70; }
        else { cr = 1.0; cg = 0.65; cb = 0.50; }

        const brightness = 0.6 + 0.4 * Math.random();
        starColors[3 * i] = cr * brightness;
        starColors[3 * i + 1] = cg * brightness;
        starColors[3 * i + 2] = cb * brightness;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
        size: 0.55,
        map: starSprite,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    starfieldPointsMesh = new THREE.Points(starGeo, starMat);
    starfieldPointsMesh.visible = (state.activeTab !== 'tab-math' && state.showStars);
    scene.add(starfieldPointsMesh);

    constellationsGroup = new THREE.Group();
    const constellationLines = [];
    const zodiacStarPositions = [];

    for (const c of CONSTELLATIONS) {
        const starCoords = c.stars.map(([ra, dec]) => raDecToXYZ(ra, dec, STAR_RADIUS * 0.99));

        for (const [x, y, z] of starCoords) {
            zodiacStarPositions.push(x, y, z);
        }

        for (const [s1, s2] of c.lines) {
            const p1 = starCoords[s1], p2 = starCoords[s2];
            if (p1 && p2) {
                constellationLines.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
            }
        }
    }

    const constLineGeo = new THREE.BufferGeometry();
    constLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(constellationLines, 3));
    const constLineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        opacity: 0.45,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
    constellationsGroup.add(new THREE.LineSegments(constLineGeo, constLineMat));

    const zodiacStarGeo = new THREE.BufferGeometry();
    zodiacStarGeo.setAttribute('position', new THREE.Float32BufferAttribute(zodiacStarPositions, 3));
    const zodiacStarMat = new THREE.PointsMaterial({
        size: 0.95,
        map: starSprite,
        color: 0xfacc15,
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    constellationsGroup.add(new THREE.Points(zodiacStarGeo, zodiacStarMat));

    constellationsGroup.visible = (state.activeTab !== 'tab-math' && state.showConstellations);
    scene.add(constellationsGroup);
}

function createSunGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(254, 240, 138, 0.95)');
    grad.addColorStop(0.45, 'rgba(250, 204, 21, 0.55)');
    grad.addColorStop(0.75, 'rgba(249, 115, 22, 0.18)');
    grad.addColorStop(1.0, 'rgba(249, 115, 22, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    return new THREE.CanvasTexture(canvas);
}

function createAstronomicalGuides() {
    // 1. Linha do Eixo Polar Norte-Sul
    polarAxisLineGroup = new THREE.Group();
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -1.35, 0),
        new THREE.Vector3(0, 1.35, 0)
    ]);
    const axisMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.05,
        gapSize: 0.02,
        linewidth: 2
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    axisLine.computeLineDistances();
    polarAxisLineGroup.add(axisLine);

    const poleGeo = new THREE.SphereGeometry(0.025, 16, 16);
    const northPoleMesh = new THREE.Mesh(poleGeo, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    northPoleMesh.position.set(0, 1.35, 0);
    polarAxisLineGroup.add(northPoleMesh);

    const southPoleMesh = new THREE.Mesh(poleGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    southPoleMesh.position.set(0, -1.35, 0);
    polarAxisLineGroup.add(southPoleMesh);

    polarAxisLineGroup.visible = (state.activeTab === 'tab-seasons' && state.showPolarAxis);
    earthTiltGroup.add(polarAxisLineGroup);

    // 2. Disco / Anel do Plano da Eclíptica
    const eclipticGeo = new THREE.RingGeometry(1.25, 1.75, 64);
    const eclipticMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.12,
        depthWrite: false
    });
    eclipticPlaneMesh = new THREE.Mesh(eclipticGeo, eclipticMat);
    eclipticPlaneMesh.rotation.x = Math.PI / 2;
    eclipticPlaneMesh.visible = (state.activeTab === 'tab-seasons' && state.showEclipticPlane);
    earthSystemGroup.add(eclipticPlaneMesh);

    // 3. Ponto Brilhante Distante do Sol (Visual Sun Orb & Solar Flare)
    sunVisualGroup = new THREE.Group();

    const sunSphereGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const sunSphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sunSphere = new THREE.Mesh(sunSphereGeo, sunSphereMat);
    sunVisualGroup.add(sunSphere);

    const sunGlowTex = createSunGlowTexture();
    const sunSpriteMat = new THREE.SpriteMaterial({
        map: sunGlowTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
    });
    const sunGlowSprite = new THREE.Sprite(sunSpriteMat);
    sunGlowSprite.scale.set(0.75, 0.75, 1.0);
    sunVisualGroup.add(sunGlowSprite);

    sunVisualGroup.visible = (state.activeTab === 'tab-seasons' || state.activeTab === 'tab-atmosphere');
    scene.add(sunVisualGroup);
}

// =============================================================================
// 5. SISTEMA DE PARTÍCULAS DE VENTO & STREAMLINES (ABA 4)
// =============================================================================

// =============================================================================
// 5. ATUALIZAÇÃO DOS DIRECT BUFFERS NATIVOS (MALHA DE VORONOI)
// =============================================================================

function applyDirectBuffersToScene(payload) {
    const {
        meshPositions,
        meshNormals,
        meshColors,
        wireframePositions,
        generatorPositions,
        numCells
    } = payload;

    lastMeshPayload = payload;
    currentCellPositions = generatorPositions;
    currentCellCount = numCells;

    // --- MALHA 2: CASCA ATMOSFÉRICA POLIGONAL ---
    if (globeMesh) earthSpinGroup.remove(globeMesh);

    globeGeometry = new THREE.BufferGeometry();
    globeGeometry.setAttribute('position', new THREE.BufferAttribute(meshPositions, 3));
    globeGeometry.setAttribute('normal', new THREE.BufferAttribute(meshNormals, 3));
    globeGeometry.setAttribute('color', new THREE.BufferAttribute(meshColors, 3));

    const isMathTab = (state.activeTab === 'tab-math');
    const isAtmosphereTab = (state.activeTab === 'tab-atmosphere');
    const currentOpacity = isMathTab ? 1.0 : isAtmosphereTab ? 0.35 : state.shellOpacity;

    globeMaterial = new THREE.MeshStandardMaterial({
        vertexColors: isMathTab,
        color: isMathTab ? 0xffffff : 0x38bdf8,
        roughness: 0.55,
        metalness: 0.05,
        flatShading: true,
        side: THREE.FrontSide,
        transparent: currentOpacity < 1.0,
        opacity: currentOpacity,
        depthWrite: isMathTab,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: 1.0,
        polygonOffsetUnits: 1.0
    });

    globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    globeMesh.renderOrder = 2;
    earthSpinGroup.add(globeMesh);

    // --- MALHA 3: WIREFRAME DEDUPLICADO ---
    if (wireframeMesh) earthSpinGroup.remove(wireframeMesh);

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(wireframePositions, 3));
    const wireMat = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.75,
        depthTest: true,
        depthWrite: false
    });
    wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireframeMesh.visible = state.showWireframe;
    wireframeMesh.renderOrder = 4;
    earthSpinGroup.add(wireframeMesh);

    // --- MALHA 4: MARCADORES DOS CENTROS ---
    if (generatorPointsMesh) earthSpinGroup.remove(generatorPointsMesh);

    const genGeo = new THREE.BufferGeometry();
    genGeo.setAttribute('position', new THREE.BufferAttribute(generatorPositions, 3));
    const genMat = new THREE.PointsMaterial({
        size: 0.022,
        color: 0xffffff,
        depthTest: true,
        depthWrite: false
    });
    generatorPointsMesh = new THREE.Points(genGeo, genMat);
    generatorPointsMesh.visible = state.showGenerators;
    generatorPointsMesh.renderOrder = 5;
    earthSpinGroup.add(generatorPointsMesh);
}

// =============================================================================
// 7. INSPEÇÃO DE CÉLULAS POR HOVER (TOOLTIP & RAYCASTING)
// =============================================================================

function setupHoverRaycasting() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('pointermove', (e) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (!globeMesh || !currentCellPositions || currentCellCount === 0) {
            hideTooltip();
            return;
        }

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(globeMesh, false);

        if (intersects.length > 0) {
            const hitPoint = earthSpinGroup.worldToLocal(intersects[0].point.clone()).normalize();

            let nearestCell = 0;
            let maxDot = -2.0;

            for (let c = 0; c < currentCellCount; c++) {
                const gx = currentCellPositions[3 * c] / 1.004;
                const gy = currentCellPositions[3 * c + 1] / 1.004;
                const gz = currentCellPositions[3 * c + 2] / 1.004;

                const dot = hitPoint.x * gx + hitPoint.y * gy + hitPoint.z * gz;
                if (dot > maxDot) {
                    maxDot = dot;
                    nearestCell = c;
                }
            }

            const gx = currentCellPositions[3 * nearestCell] / 1.004;
            const gy = currentCellPositions[3 * nearestCell + 1] / 1.004;
            const gz = currentCellPositions[3 * nearestCell + 2] / 1.004;

            if (hoverHighlightMesh) {
                hoverHighlightMesh.position.set(gx * 1.006, gy * 1.006, gz * 1.006);
                hoverHighlightMesh.lookAt(gx * 2, gy * 2, gz * 2);
                hoverHighlightMesh.visible = true;
            }

            displayTooltip(e.clientX - rect.left, e.clientY - rect.top, gx, gy, gz, nearestCell);
        } else {
            hideTooltip();
        }
    });

    container.addEventListener('pointerleave', hideTooltip);
}

function hideTooltip() {
    if (cellTooltip) cellTooltip.classList.remove('visible');
    if (hoverHighlightMesh) hoverHighlightMesh.visible = false;
}

function displayTooltip(screenX, screenY, x, y, z, cellIndex) {
    if (!cellTooltip) return;

    const latRad = Math.asin(Math.max(-1.0, Math.min(1.0, y)));
    const lonRad = Math.atan2(-z, x);
    const latDeg = (latRad * 180.0 / Math.PI);
    const lonDeg = (lonRad * 180.0 / Math.PI);
    const latStr = `${Math.abs(latDeg).toFixed(1)}° ${latDeg >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(lonDeg).toFixed(1)}° ${lonDeg >= 0 ? 'E' : 'W'}`;
    const geoName = getGeographicLocation(latDeg, lonDeg);
    const avgAreaKm2 = REAL_EARTH_SURFACE_KM2 / Math.max(1, currentCellCount);

    if (state.activeTab === 'tab-math') {
        const thetaDeg = (Math.acos(Math.max(-1, Math.min(1, y))) * 180.0 / Math.PI).toFixed(1);
        const phiDeg = ((lonDeg + 360.0) % 360.0).toFixed(1);

        cellTooltip.innerHTML = `
            <div class="tooltip-header">Domínio Voronoi #${cellIndex + 1}</div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Ângulo Polar (θ):</span>
                <span class="tooltip-v">${thetaDeg}°</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Ângulo Azimutal (φ):</span>
                <span class="tooltip-v">${phiDeg}°</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Área Esférica (Aᵢ):</span>
                <span class="tooltip-v">${(4.0 * Math.PI / currentCellCount).toFixed(4)} sr</span>
            </div>
            <div class="tooltip-geo">Célula relaxada sobre a esfera S²</div>
        `;
    } else {
        cellTooltip.innerHTML = `
            <div class="tooltip-header">Célula Geodésica #${cellIndex + 1}</div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Latitude:</span>
                <span class="tooltip-v">${latStr}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Longitude:</span>
                <span class="tooltip-v">${lonStr}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-lbl">Área de Cobertura:</span>
                <span class="tooltip-v">~${(avgAreaKm2 * 1e-3).toFixed(0)}k km²</span>
            </div>
            <div class="tooltip-geo">${geoName}</div>
        `;
    }

    const maxX = container.clientWidth - 220;
    const maxY = container.clientHeight - 150;
    const posX = Math.min(screenX + 15, maxX);
    const posY = Math.min(screenY + 15, maxY);

    cellTooltip.style.left = `${posX}px`;
    cellTooltip.style.top = `${posY}px`;
    cellTooltip.classList.add('visible');
}

// =============================================================================
// 8. GERENCIAMENTO DAS ABAS PROGRESSIVAS (1, 2, 3 e 4)
// =============================================================================

function switchTab(newTab) {
    state.activeTab = newTab;

    const btnTabMath = document.getElementById('btn-tab-math');
    const btnTabScience = document.getElementById('btn-tab-science');
    const btnTabSeasons = document.getElementById('btn-tab-seasons');
    const btnTabAtmosphere = document.getElementById('btn-tab-atmosphere');

    const panelMath = document.getElementById('panel-tab-math');
    const panelScience = document.getElementById('panel-tab-science');
    const panelSeasons = document.getElementById('panel-tab-seasons');
    const panelAtmosphere = document.getElementById('panel-tab-atmosphere');

    [btnTabMath, btnTabScience, btnTabSeasons, btnTabAtmosphere].forEach(b => b && b.classList.remove('active'));
    [panelMath, panelScience, panelSeasons, panelAtmosphere].forEach(p => p && (p.style.display = 'none'));

    // Configuração para cada Aba
    if (newTab === 'tab-math') {
        btnTabMath.classList.add('active');
        panelMath.style.display = 'block';

        if (globeCoreMesh) globeCoreMesh.visible = false;
        if (starfieldPointsMesh) starfieldPointsMesh.visible = false;
        if (constellationsGroup) constellationsGroup.visible = false;
        if (polarAxisLineGroup) polarAxisLineGroup.visible = false;
        if (eclipticPlaneMesh) eclipticPlaneMesh.visible = false;
        if (sunVisualGroup) sunVisualGroup.visible = false;

        earthTiltGroup.rotation.set(0, 0, 0);
        ambientLight.intensity = 1.35;
        sunLight.intensity = 1.4;
        sunLight.position.set(5, 3, 4);

        if (globeGeometry && lastMeshPayload) {
            globeGeometry.setAttribute('color', new THREE.BufferAttribute(lastMeshPayload.meshColors, 3));
            globeMaterial.vertexColors = true;
            globeMaterial.color.set(0xffffff);
            globeMaterial.transparent = false;
            globeMaterial.opacity = 1.0;
            globeMaterial.depthWrite = true;
            globeMaterial.polygonOffset = true;
            globeMaterial.polygonOffsetFactor = 1.0;
            globeMaterial.polygonOffsetUnits = 1.0;
            globeMaterial.needsUpdate = true;
        }
    } else if (newTab === 'tab-science') {
        btnTabScience.classList.add('active');
        panelScience.style.display = 'block';

        if (globeCoreMesh) {
            globeCoreMesh.visible = true;
            globeCoreMesh.scale.setScalar(state.coreRadius);
        }
        if (starfieldPointsMesh) starfieldPointsMesh.visible = state.showStars;
        if (constellationsGroup) constellationsGroup.visible = state.showConstellations;
        if (polarAxisLineGroup) polarAxisLineGroup.visible = false;
        if (eclipticPlaneMesh) eclipticPlaneMesh.visible = false;
        if (sunVisualGroup) sunVisualGroup.visible = false;

        earthTiltGroup.rotation.set(0, 0, 0);
        ambientLight.intensity = 1.35;
        sunLight.intensity = 1.4;
        sunLight.position.set(5, 3, 4);

        if (globeMaterial) {
            globeMaterial.vertexColors = false;
            globeMaterial.color.set(0x38bdf8);
            globeMaterial.transparent = state.shellOpacity < 1.0;
            globeMaterial.opacity = state.shellOpacity;
            globeMaterial.depthWrite = (state.shellOpacity >= 1.0);
            globeMaterial.polygonOffset = true;
            globeMaterial.polygonOffsetFactor = 1.0;
            globeMaterial.polygonOffsetUnits = 1.0;
            globeMaterial.needsUpdate = true;
        }
    } else if (newTab === 'tab-seasons') {
        btnTabSeasons.classList.add('active');
        panelSeasons.style.display = 'block';

        if (globeCoreMesh) {
            globeCoreMesh.visible = true;
            globeCoreMesh.scale.setScalar(state.coreRadius);
        }
        if (starfieldPointsMesh) starfieldPointsMesh.visible = state.showStars;
        if (constellationsGroup) constellationsGroup.visible = state.showConstellations;
        if (polarAxisLineGroup) polarAxisLineGroup.visible = state.showPolarAxis;
        if (eclipticPlaneMesh) eclipticPlaneMesh.visible = state.showEclipticPlane;
        if (sunVisualGroup) sunVisualGroup.visible = true;

        earthTiltGroup.rotation.set(state.showAxialTilt ? -AXIAL_TILT_RAD : 0, 0, 0);

        if (state.showSunTerminator) {
            ambientLight.intensity = 0.05;
            sunLight.intensity = 2.6;
        }

        if (globeMaterial) {
            globeMaterial.vertexColors = false;
            globeMaterial.color.set(0x38bdf8);
            globeMaterial.transparent = state.shellOpacity < 1.0;
            globeMaterial.opacity = state.shellOpacity;
            globeMaterial.depthWrite = (state.shellOpacity >= 1.0);
            globeMaterial.polygonOffset = true;
            globeMaterial.polygonOffsetFactor = 1.0;
            globeMaterial.polygonOffsetUnits = 1.0;
            globeMaterial.needsUpdate = true;
        }

        updateAstronomicalState();
    } else if (newTab === 'tab-atmosphere') {
        btnTabAtmosphere.classList.add('active');
        panelAtmosphere.style.display = 'block';

        if (globeCoreMesh) {
            globeCoreMesh.visible = true;
            globeCoreMesh.scale.setScalar(state.coreRadius);
        }
        if (starfieldPointsMesh) starfieldPointsMesh.visible = state.showStars;
        if (constellationsGroup) constellationsGroup.visible = false;
        if (polarAxisLineGroup) polarAxisLineGroup.visible = false;
        if (eclipticPlaneMesh) eclipticPlaneMesh.visible = false;
        if (sunVisualGroup) sunVisualGroup.visible = false;

        earthTiltGroup.rotation.set(-AXIAL_TILT_RAD, 0, 0);
        ambientLight.intensity = 1.35;
        sunLight.intensity = 1.4;
        sunLight.position.set(5, 3, 4);

        if (globeMaterial) {
            globeMaterial.vertexColors = false;
            globeMaterial.color.set(0x38bdf8);
            globeMaterial.transparent = true;
            globeMaterial.opacity = 0.35;
            globeMaterial.depthWrite = false;
            globeMaterial.polygonOffset = true;
            globeMaterial.polygonOffsetFactor = 1.0;
            globeMaterial.polygonOffsetUnits = 1.0;
            globeMaterial.needsUpdate = true;
        }
    }

    const footerInfo = document.getElementById('footer-sim-info');
    if (footerInfo) {
        if (newTab === 'tab-math') footerInfo.textContent = 'Etapa 1: Geometria (SCVT)';
        else if (newTab === 'tab-science') footerInfo.textContent = 'Etapa 2: Escala Planetária';
        else if (newTab === 'tab-seasons') footerInfo.textContent = 'Etapa 3: Estações do Ano';
        else if (newTab === 'tab-atmosphere') footerInfo.textContent = 'Etapa 4: Modelos Globais de Previsão';
    }

    updateHUDVisibility(newTab);
    requestAnimationFrame(onWindowResize);
}

function updateHUDVisibility(currentTab) {
    const isMath = (currentTab === 'tab-math');
    const isScience = (currentTab === 'tab-science');
    const isSeasons = (currentTab === 'tab-seasons');

    const simHud = document.getElementById('sim-hud');
    if (simHud) {
        simHud.style.display = (isMath || isScience || isSeasons) ? 'block' : 'none';
    }

    const rowIter = document.getElementById('hud-row-iter');
    const rowShift = document.getElementById('hud-row-shift');
    const rowPent = document.getElementById('hud-row-pent');
    const rowHex = document.getElementById('hud-row-hex');
    const rowHept = document.getElementById('hud-row-hept');
    const rowThickness = document.getElementById('hud-row-thickness');
    const rowExag = document.getElementById('hud-row-exaggeration');

    const rowSeasonDate = document.getElementById('hud-row-season-date');
    const rowSunDecl = document.getElementById('hud-row-sun-decl');
    const rowZodiac = document.getElementById('hud-row-zodiac');

    // Métricas Topológicas de Voronoi: exclusivo da Etapa 1
    if (rowIter) rowIter.style.display = isMath ? 'flex' : 'none';
    if (rowShift) rowShift.style.display = isMath ? 'flex' : 'none';
    if (rowPent) rowPent.style.display = isMath ? 'flex' : 'none';
    if (rowHex) rowHex.style.display = isMath ? 'flex' : 'none';
    if (rowHept) rowHept.style.display = isMath ? 'flex' : 'none';

    const hudSeparator = document.getElementById('hud-separator');
    if (hudSeparator) hudSeparator.style.display = 'none';

    // Espessura Visual & Exagero Vertical: exclusivo da Etapa 2 (Escala Planetária)
    if (rowThickness) rowThickness.style.display = isScience ? 'flex' : 'none';
    if (rowExag) rowExag.style.display = isScience ? 'flex' : 'none';

    // Métricas Astronômicas & Estações: exclusivo da Etapa 3 (Estações do Ano)
    if (rowSeasonDate) rowSeasonDate.style.display = isSeasons ? 'flex' : 'none';
    if (rowSunDecl) rowSunDecl.style.display = isSeasons ? 'flex' : 'none';
    if (rowZodiac) rowZodiac.style.display = isSeasons ? 'flex' : 'none';
}

// =============================================================================
// 9. MECÂNICA ORBITAL & RENDERIZAÇÃO DO MINI-ORRERY (ABA 3)
// =============================================================================

function updateAstronomicalState() {
    const info = getZodiacConstellationInfo(state.dayOfYear);
    state.sunDeclinationRad = (info.sunDeclDeg * Math.PI) / 180.0;

    if (state.activeTab !== 'tab-seasons') return;

    const R_SUN = 6.0;
    const sunX = R_SUN * Math.cos(info.lambdaOrbit);
    const sunZ = -R_SUN * Math.sin(info.lambdaOrbit);
    sunLight.position.set(sunX, 0, sunZ);

    const R_SUN_VISUAL = 28.0;
    const sunVisualX = R_SUN_VISUAL * Math.cos(info.lambdaOrbit);
    const sunVisualZ = -R_SUN_VISUAL * Math.sin(info.lambdaOrbit);
    if (sunVisualGroup) {
        sunVisualGroup.position.set(sunVisualX, 0, sunVisualZ);
    }

    const dayRotationAngle = (state.hourOfDay / 24.0) * 2.0 * Math.PI;
    earthSpinGroup.rotation.y = dayRotationAngle;

    const spanSeasonDate = document.getElementById('stat-season-date');
    const spanSunDecl = document.getElementById('stat-sun-decl');
    const spanZodiac = document.getElementById('stat-zodiac-sign');
    const valDay = document.getElementById('val-day-of-year');
    const valHour = document.getElementById('val-hour-of-day');
    const labelOrreryMonth = document.getElementById('label-orrery-month');
    const badgeTitle = document.getElementById('span-season-badge-title');
    const badgeStatus = document.getElementById('span-season-badge-status');

    if (spanSeasonDate) spanSeasonDate.textContent = info.dateFormatted;
    if (spanSunDecl) spanSunDecl.textContent = `${info.sunDeclDeg >= 0 ? '+' : ''}${info.sunDeclDeg.toFixed(1)}° (${info.sunDeclDeg >= 0 ? 'Norte' : 'Sul'})`;
    if (valDay) valDay.textContent = `Dia ${Math.max(1, Math.min(365, Math.floor(state.dayOfYear)))}`;

    const inputDateDay = document.getElementById('input-date-day');
    const selectDateMonth = document.getElementById('select-date-month');
    if (inputDateDay && document.activeElement !== inputDateDay) {
        inputDateDay.value = info.dayOfMonth;
        inputDateDay.max = DAYS_IN_MONTH[info.monthIdx];
    }
    if (selectDateMonth && document.activeElement !== selectDateMonth) {
        selectDateMonth.value = String(info.monthIdx);
    }

    const inputDay = document.getElementById('input-day-of-year');
    if (inputDay && document.activeElement !== inputDay) {
        inputDay.value = Math.floor(state.dayOfYear);
    }

    const h = Math.floor(state.hourOfDay);
    const m = Math.floor((state.hourOfDay - h) * 60);
    if (valHour) valHour.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const inputHour = document.getElementById('input-hour-of-day');
    if (inputHour && document.activeElement !== inputHour) {
        inputHour.value = state.hourOfDay.toFixed(2);
    }
    if (labelOrreryMonth) labelOrreryMonth.textContent = info.dateShort;

    if (badgeTitle && badgeStatus) {
        badgeTitle.textContent = 'Mecânica Orbital & Estações';
        badgeStatus.textContent = `Declinação Solar (δ): ${info.sunDeclDeg >= 0 ? '+' : ''}${info.sunDeclDeg.toFixed(1)}° (${info.sunDeclDeg >= 0 ? 'Norte' : 'Sul'})`;
    }

    renderMiniOrrery(info);
}

function renderMiniOrrery(info) {
    const canvas = document.getElementById('canvas-mini-orrery');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const orbitRadius = 60;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const seasonMarkers = [
        { angle: 0, label: '20/Mar' },
        { angle: Math.PI / 2, label: '21/Jun' },
        { angle: Math.PI, label: '22/Set' },
        { angle: 3 * Math.PI / 2, label: '21/Dez' }
    ];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const sm of seasonMarkers) {
        const mx = cx + (orbitRadius + 14) * Math.cos(sm.angle);
        const my = cy - (orbitRadius + 14) * Math.sin(sm.angle);
        ctx.fillText(sm.label, mx, my + 3);
    }

    const solGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    solGrad.addColorStop(0, '#ffffff');
    solGrad.addColorStop(0.3, '#facc15');
    solGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = solGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();

    const earthX = cx + orbitRadius * Math.cos(info.lambdaOrbit);
    const earthY = cy - orbitRadius * Math.sin(info.lambdaOrbit);

    ctx.beginPath();
    ctx.moveTo(earthX, earthY);
    const sightX = cx - (orbitRadius + 22) * Math.cos(info.lambdaOrbit);
    const sightY = cy + (orbitRadius + 22) * Math.sin(info.lambdaOrbit);
    ctx.lineTo(sightX, sightY);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(info.sunZodiac.split(' ')[0], sightX, sightY);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(earthX, earthY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(earthX, earthY - 6);
    ctx.lineTo(earthX, earthY + 6);
    ctx.stroke();

    // Indicador do Polo Norte (amarelo) alinhado com o eixo dos solstícios
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(earthX, earthY + 5, 2, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================================================
// 10. COMUNICAÇÃO COM O WEB WORKER
// =============================================================================

let worker = null;
let isWorkerBusy = false;
let lastStepTimestamp = 0;
let lastOrbitTimestamp = 0;

function initWorker() {
    worker = new Worker('scripts/clima.worker.js?v=2.2');

    worker.onmessage = function (e) {
        const { type, payload } = e.data;

        if (type === 'MESH_BUFFERS_READY') {
            isWorkerBusy = false;
            state.lloydIteration = payload.iteration;
            state.lloydAvgShift = payload.avgShift;
            applyDirectBuffersToScene(payload);
            updateHUDStats(payload);
        }
    };

    generateNewRandomMesh();
}

function generateNewRandomMesh() {
    if (!worker) return;
    isWorkerBusy = true;
    worker.postMessage({
        type: 'GENERATE_INITIAL_MESH',
        payload: { numPoints: state.numCells }
    });
}

function updateHUDStats(payload) {
    const spanIter = document.getElementById('stat-lloyd-iter');
    const spanShift = document.getElementById('stat-lloyd-shift');
    const spanPent = document.getElementById('stat-pentagons');
    const spanHex = document.getElementById('stat-hexagons');
    const spanHept = document.getElementById('stat-heptagons');
    const spanStatus = document.getElementById('span-topology-status');
    const badgeTitle = document.getElementById('span-badge-title');

    if (spanIter) spanIter.textContent = `${payload.iteration}`;
    if (spanShift) spanShift.textContent = `${payload.avgShift.toExponential(2)}`;
    if (spanPent) {
        spanPent.innerHTML = `${payload.pentagons} ${payload.pentagons === 12 ? '<span style="color:#22c55e; font-size:0.75rem; font-weight:700;">(Exato 12!)</span>' : ''}`;
    }
    if (spanHex) spanHex.textContent = `${payload.hexagons}`;
    if (spanHept) spanHept.textContent = `${payload.heptagons + (payload.others || 0)}`;

    if (spanStatus) {
        spanStatus.textContent = `${payload.numCells} Células de Voronoi • Iteração ${payload.iteration}`;
    }

    if (badgeTitle && state.activeTab === 'tab-math') {
        if (payload.iteration === 0) {
            badgeTitle.textContent = 'Malha Inicial';
        } else if (payload.pentagons === 12 && (payload.heptagons + (payload.others || 0)) === 0) {
            badgeTitle.textContent = 'Malha Relaxada';
        } else {
            badgeTitle.textContent = `Iteração ${payload.iteration}`;
        }
    }

    updatePlanetaryScaleStats();
}

function updatePlanetaryScaleStats() {
    const spanVisualThickness = document.getElementById('stat-visual-thickness');
    const spanExaggeration = document.getElementById('stat-exaggeration');

    const thicknessFraction = (1.0 - state.coreRadius);
    const visualKm = thicknessFraction * REAL_EARTH_RADIUS_KM;
    const exaggerationFactor = visualKm / REAL_TROPOSPHERE_KM;

    if (spanVisualThickness) {
        spanVisualThickness.textContent = `${visualKm.toFixed(0)} km (${(thicknessFraction * 100).toFixed(1)}% de R)`;
    }
    if (spanExaggeration) {
        spanExaggeration.textContent = `${exaggerationFactor.toFixed(1)}x real (~12 km)`;
    }
}

// =============================================================================
// 11. LOOP PRINCIPAL DE ANIMAÇÃO
// =============================================================================

let lastFrameTimestamp = 0;

function animate(timestamp) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.1, (timestamp - (lastFrameTimestamp || timestamp)) / 1000.0);
    lastFrameTimestamp = timestamp;

    controls.update();

    // Rotação Automática da Terra (mantendo o universo imóvel)
    if (state.autoRotate) {
        if (state.activeTab === 'tab-seasons') {
            state.hourOfDay = (state.hourOfDay + state.diurnalSpeed * dt) % 24.0;
            const sliderHour = document.getElementById('slider-hour-of-day');
            if (sliderHour) sliderHour.value = state.hourOfDay.toFixed(2);
            updateAstronomicalState();
        } else {
            earthSpinGroup.rotation.y += 0.35 * dt;
        }
    }

    // Relaxamento de Lloyd (Aba 1)
    if (state.isAutoLloyd && worker && !isWorkerBusy) {
        const intervalMs = 1000.0 / Math.max(1, state.lloydSpeed);
        if (timestamp - lastStepTimestamp >= intervalMs) {
            lastStepTimestamp = timestamp;
            isWorkerBusy = true;
            worker.postMessage({ type: 'LLOYD_STEP', payload: { steps: 1 } });
        }
    }

    // Mecânica Orbital (Aba 3)
    if (state.activeTab === 'tab-seasons') {
        const dtOrbit = (timestamp - (lastOrbitTimestamp || timestamp)) / 1000.0;
        lastOrbitTimestamp = timestamp;

        if (state.isPlayingOrbit) {
            state.dayOfYear = (state.dayOfYear + state.orbitSpeed * dtOrbit) % 365.0;
            const sliderDay = document.getElementById('slider-day-of-year');
            if (sliderDay) sliderDay.value = Math.floor(state.dayOfYear);
            updateAstronomicalState();
        }

        if (state.isPlayingDiurnal && !state.autoRotate) {
            state.hourOfDay = (state.hourOfDay + state.diurnalSpeed * dtOrbit) % 24.0;
            const sliderHour = document.getElementById('slider-hour-of-day');
            if (sliderHour) sliderHour.value = state.hourOfDay.toFixed(2);
            updateAstronomicalState();
        }
    }

    renderer.render(scene, camera);
}

// =============================================================================
// 12. INTERFACE DE USUÁRIO (EVENT LISTENERS)
// =============================================================================

function setupUIListeners() {
    // Alternância de Etapas da Simulação (1 a 4)
    const btnTabMath = document.getElementById('btn-tab-math');
    const btnTabScience = document.getElementById('btn-tab-science');
    const btnTabSeasons = document.getElementById('btn-tab-seasons');
    const btnTabAtmosphere = document.getElementById('btn-tab-atmosphere');

    function activateStage(stageKey) {
        const tabBtnParams = document.getElementById('tab-btn-params');
        if (tabBtnParams && !tabBtnParams.classList.contains('active')) {
            tabBtnParams.click();
        }
        switchTab(stageKey);
    }

    if (btnTabMath) btnTabMath.addEventListener('click', () => activateStage('tab-math'));
    if (btnTabScience) btnTabScience.addEventListener('click', () => activateStage('tab-science'));
    if (btnTabSeasons) btnTabSeasons.addEventListener('click', () => activateStage('tab-seasons'));
    if (btnTabAtmosphere) btnTabAtmosphere.addEventListener('click', () => activateStage('tab-atmosphere'));

    // Botão Flutuante de Rotação Automática da Terra
    const btnQuickAutoRotate = document.getElementById('btn-quick-autorotate');
    const toggleAutoRotate = document.getElementById('toggle-autorotate');

    function setAutoRotateState(enabled) {
        state.autoRotate = enabled;
        controls.autoRotate = false;
        if (btnQuickAutoRotate) btnQuickAutoRotate.classList.toggle('active', enabled);
        if (toggleAutoRotate) toggleAutoRotate.checked = enabled;
    }

    if (btnQuickAutoRotate) {
        btnQuickAutoRotate.addEventListener('click', () => setAutoRotateState(!state.autoRotate));
    }
    if (toggleAutoRotate) {
        toggleAutoRotate.addEventListener('change', (e) => setAutoRotateState(e.target.checked));
    }

    // --- CONTROLES DA ABA 1 (MATEMÁTICA) ---
    let meshDebounceTimer = null;
    syncDualSlider('#slider-num-cells', '#input-num-cells', (val) => {
        state.numCells = Math.round(val);
        stopAutoLloyd();
        clearTimeout(meshDebounceTimer);
        meshDebounceTimer = setTimeout(() => {
            generateNewRandomMesh();
        }, 150);
    });

    const btnRandom = document.getElementById('btn-random-mesh');
    if (btnRandom) {
        btnRandom.addEventListener('click', () => {
            stopAutoLloyd();
            generateNewRandomMesh();
        });
    }

    const btnAuto = document.getElementById('btn-auto-lloyd');
    if (btnAuto) {
        btnAuto.addEventListener('click', () => {
            state.isAutoLloyd = !state.isAutoLloyd;
            btnAuto.innerHTML = state.isAutoLloyd
                ? '<img src="../assets/icons/pause.svg" class="icon-svg" alt="Pause"> Pausar Relaxamento'
                : '<img src="../assets/icons/play.svg" class="icon-svg" alt="Play"> Relaxar (Lloyd Automático)';
            btnAuto.classList.toggle('active', state.isAutoLloyd);
            inlineSVGImages();
        });
    }

    function stopAutoLloyd() {
        state.isAutoLloyd = false;
        if (btnAuto) {
            btnAuto.innerHTML = '<img src="../assets/icons/play.svg" class="icon-svg" alt="Play"> Relaxar (Lloyd Automático)';
            btnAuto.classList.remove('active');
            inlineSVGImages();
        }
    }

    const btnStep = document.getElementById('btn-step-lloyd');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            stopAutoLloyd();
            if (worker && !isWorkerBusy) {
                isWorkerBusy = true;
                worker.postMessage({ type: 'LLOYD_STEP', payload: { steps: 1 } });
            }
        });
    }

    syncDualSlider('#slider-speed', '#input-speed', (val) => {
        state.lloydSpeed = Math.round(val);
    });

    // --- CONTROLES DA ABA 2 (CIÊNCIA & PLANETA) ---
    syncDualSlider('#slider-core-radius', '#input-core-radius', (val) => {
        state.coreRadius = parseFloat(val);
        if (globeCoreMesh) globeCoreMesh.scale.setScalar(state.coreRadius);
        updatePlanetaryScaleStats();
    });

    syncDualSlider('#slider-shell-opacity', '#input-shell-opacity', (val) => {
        state.shellOpacity = parseFloat(val);
        if (globeMaterial && state.activeTab !== 'tab-math') {
            globeMaterial.transparent = state.shellOpacity < 1.0;
            globeMaterial.opacity = state.shellOpacity;
            globeMaterial.depthWrite = (state.shellOpacity >= 1.0);
            globeMaterial.polygonOffset = true;
            globeMaterial.polygonOffsetFactor = 1.0;
            globeMaterial.polygonOffsetUnits = 1.0;
            globeMaterial.needsUpdate = true;
        }
    });

    const toggleEarthTexture = document.getElementById('toggle-earth-texture');
    if (toggleEarthTexture) {
        toggleEarthTexture.addEventListener('change', (e) => {
            state.showEarthTexture = e.target.checked;
            if (earthSolidMaterial) {
                earthSolidMaterial.map = state.showEarthTexture ? earthTexture : null;
                earthSolidMaterial.color.set(state.showEarthTexture ? 0xffffff : 0x061126);
                earthSolidMaterial.needsUpdate = true;
            }
        });
    }

    const toggleStars = document.getElementById('toggle-stars');
    if (toggleStars) {
        toggleStars.addEventListener('change', (e) => {
            state.showStars = e.target.checked;
            if (starfieldPointsMesh && state.activeTab !== 'tab-math') {
                starfieldPointsMesh.visible = state.showStars;
            }
        });
    }

    const toggleConstellations = document.getElementById('toggle-constellations');
    if (toggleConstellations) {
        toggleConstellations.addEventListener('change', (e) => {
            state.showConstellations = e.target.checked;
            if (constellationsGroup && state.activeTab !== 'tab-math') {
                constellationsGroup.visible = state.showConstellations;
            }
        });
    }

    // --- CONTROLES DA ABA 3 (ESTAÇÕES DO ANO) ---
    syncDualSlider('#slider-day-of-year', '#input-day-of-year', (val) => {
        state.dayOfYear = parseFloat(val);
        updateAstronomicalState();
    });

    syncDualSlider('#slider-hour-of-day', '#input-hour-of-day', (val) => {
        state.hourOfDay = parseFloat(val);
        updateAstronomicalState();
    });

    const btnPlayOrbit = document.getElementById('btn-play-orbit');
    if (btnPlayOrbit) {
        btnPlayOrbit.addEventListener('click', () => {
            state.isPlayingOrbit = !state.isPlayingOrbit;
            btnPlayOrbit.innerHTML = state.isPlayingOrbit
                ? '<img src="../assets/icons/pause.svg" class="icon-svg" alt="Pause"> Pausar Órbita'
                : '<img src="../assets/icons/play.svg" class="icon-svg" alt="Play"> Translação Anual';
            btnPlayOrbit.classList.toggle('active', state.isPlayingOrbit);
            inlineSVGImages();
        });
    }

    const btnPlayDiurnal = document.getElementById('btn-play-diurnal');
    if (btnPlayDiurnal) {
        btnPlayDiurnal.addEventListener('click', () => {
            state.isPlayingDiurnal = !state.isPlayingDiurnal;
            btnPlayDiurnal.innerHTML = state.isPlayingDiurnal
                ? '<img src="../assets/icons/pause.svg" class="icon-svg" alt="Pause"> Pausar Rotação'
                : '<img src="../assets/icons/rotate.svg" class="icon-svg" alt="Rotação"> Rotação Contínua';
            btnPlayDiurnal.classList.toggle('active', state.isPlayingDiurnal);
            inlineSVGImages();
        });
    }

    const btnSeasonJun = document.getElementById('btn-season-jun');
    const btnSeasonSep = document.getElementById('btn-season-sep');
    const btnSeasonDec = document.getElementById('btn-season-dec');
    const btnSeasonMar = document.getElementById('btn-season-mar');
    const seasonBtns = [btnSeasonJun, btnSeasonSep, btnSeasonDec, btnSeasonMar];

    function setSeasonDay(targetDay, activeBtn) {
        state.dayOfYear = targetDay;
        const sliderDay = document.getElementById('slider-day-of-year');
        if (sliderDay) sliderDay.value = targetDay;
        const inputDay = document.getElementById('input-day-of-year');
        if (inputDay) inputDay.value = targetDay;
        seasonBtns.forEach(b => b && b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
        updateAstronomicalState();
    }

    if (btnSeasonJun) btnSeasonJun.addEventListener('click', () => setSeasonDay(172, btnSeasonJun));
    if (btnSeasonSep) btnSeasonSep.addEventListener('click', () => setSeasonDay(265, btnSeasonSep));
    if (btnSeasonDec) btnSeasonDec.addEventListener('click', () => setSeasonDay(355, btnSeasonDec));
    if (btnSeasonMar) btnSeasonMar.addEventListener('click', () => setSeasonDay(80, btnSeasonMar));

    const inputDateDay = document.getElementById('input-date-day');
    const selectDateMonth = document.getElementById('select-date-month');

    function applyDateFromInputs() {
        if (!inputDateDay || !selectDateMonth) return;
        const monthIdx = parseInt(selectDateMonth.value, 10) || 0;
        const safeMonth = Math.max(0, Math.min(11, monthIdx));
        const maxDays = DAYS_IN_MONTH[safeMonth] || 31;
        let dayVal = parseInt(inputDateDay.value, 10);
        if (isNaN(dayVal) || dayVal < 1) dayVal = 1;
        if (dayVal > maxDays) dayVal = maxDays;

        inputDateDay.value = dayVal;
        inputDateDay.max = maxDays;

        const targetDoy = getDayOfYearFromDate(dayVal, safeMonth);
        state.dayOfYear = targetDoy;
        const sliderDay = document.getElementById('slider-day-of-year');
        if (sliderDay) sliderDay.value = targetDoy;
        const inputDay = document.getElementById('input-day-of-year');
        if (inputDay) inputDay.value = targetDoy;
        seasonBtns.forEach(b => b && b.classList.remove('active'));
        updateAstronomicalState();
    }

    if (inputDateDay) {
        inputDateDay.addEventListener('input', () => {
            applyDateFromInputs();
        });
        inputDateDay.addEventListener('change', () => {
            applyDateFromInputs();
        });
    }

    if (selectDateMonth) {
        selectDateMonth.addEventListener('change', () => {
            applyDateFromInputs();
        });
    }

    const toggleAxialTilt = document.getElementById('toggle-axial-tilt');
    if (toggleAxialTilt) {
        toggleAxialTilt.addEventListener('change', (e) => {
            state.showAxialTilt = e.target.checked;
            earthTiltGroup.rotation.set(state.showAxialTilt ? -AXIAL_TILT_RAD : 0, 0, 0);
        });
    }

    const togglePolarAxis = document.getElementById('toggle-polar-axis');
    if (togglePolarAxis) {
        togglePolarAxis.addEventListener('change', (e) => {
            state.showPolarAxis = e.target.checked;
            if (polarAxisLineGroup) polarAxisLineGroup.visible = state.showPolarAxis;
        });
    }

    const toggleSunTerminator = document.getElementById('toggle-sun-terminator');
    if (toggleSunTerminator) {
        toggleSunTerminator.addEventListener('change', (e) => {
            state.showSunTerminator = e.target.checked;
            ambientLight.intensity = state.showSunTerminator ? 0.05 : 1.35;
            sunLight.intensity = state.showSunTerminator ? 2.6 : 1.4;
        });
    }

    const toggleEcliptic = document.getElementById('toggle-ecliptic-plane');
    if (toggleEcliptic) {
        toggleEcliptic.addEventListener('change', (e) => {
            state.showEclipticPlane = e.target.checked;
            if (eclipticPlaneMesh) eclipticPlaneMesh.visible = state.showEclipticPlane;
        });
    }

    // Barra de Ferramentas e Popover de Camadas / Exibição (Topo Esquerdo)
    const btnOpenLayersPopover = document.getElementById('btn-toggle-layers-popover');
    const btnCloseLayersPopover = document.getElementById('btn-close-layers-popover');
    const layersPopover = document.getElementById('layers-popover');

    if (btnOpenLayersPopover && layersPopover) {
        btnOpenLayersPopover.addEventListener('click', (e) => {
            e.stopPropagation();
            layersPopover.classList.toggle('hidden');
            btnOpenLayersPopover.classList.toggle('active', !layersPopover.classList.contains('hidden'));
        });

        if (btnCloseLayersPopover) {
            btnCloseLayersPopover.addEventListener('click', () => {
                layersPopover.classList.add('hidden');
                btnOpenLayersPopover.classList.remove('active');
            });
        }

        document.addEventListener('click', (e) => {
            if (!layersPopover.contains(e.target) && !btnOpenLayersPopover.contains(e.target)) {
                layersPopover.classList.add('hidden');
                btnOpenLayersPopover.classList.remove('active');
            }
        });
    }

    const btnQuickGenerators = document.getElementById('btn-quick-generators');
    const btnQuickWireframe = document.getElementById('btn-quick-wireframe');
    const btnQuickGraticule = document.getElementById('btn-quick-graticule');

    const toggleGenerators = document.getElementById('toggle-generators');
    const toggleWireframe = document.getElementById('toggle-wireframe');
    const toggleGraticule = document.getElementById('toggle-graticule');

    function setGeneratorsVisible(visible) {
        state.showGenerators = visible;
        if (generatorPointsMesh) generatorPointsMesh.visible = visible;
        if (toggleGenerators) toggleGenerators.checked = visible;
        if (btnQuickGenerators) btnQuickGenerators.classList.toggle('active', visible);
    }

    function setWireframeVisible(visible) {
        state.showWireframe = visible;
        if (wireframeMesh) wireframeMesh.visible = visible;
        if (toggleWireframe) toggleWireframe.checked = visible;
        if (btnQuickWireframe) btnQuickWireframe.classList.toggle('active', visible);
    }

    function setGraticuleVisible(visible) {
        state.showGraticule = visible;
        if (graticuleGroup) graticuleGroup.visible = visible;
        if (toggleGraticule) toggleGraticule.checked = visible;
        if (btnQuickGraticule) btnQuickGraticule.classList.toggle('active', visible);
    }

    if (btnQuickGenerators) {
        btnQuickGenerators.addEventListener('click', () => setGeneratorsVisible(!state.showGenerators));
    }
    if (toggleGenerators) {
        toggleGenerators.addEventListener('change', (e) => setGeneratorsVisible(e.target.checked));
    }

    if (btnQuickWireframe) {
        btnQuickWireframe.addEventListener('click', () => setWireframeVisible(!state.showWireframe));
    }
    if (toggleWireframe) {
        toggleWireframe.addEventListener('change', (e) => setWireframeVisible(e.target.checked));
    }

    if (btnQuickGraticule) {
        btnQuickGraticule.addEventListener('click', () => setGraticuleVisible(!state.showGraticule));
    }
    if (toggleGraticule) {
        toggleGraticule.addEventListener('change', (e) => setGraticuleVisible(e.target.checked));
    }
}

// =============================================================================
// 13. INICIALIZAÇÃO
// =============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    initThreeScene();
    initWorker();
    setupUIListeners();

    // Inicialização dos Controladores do Design System 2.0
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    initTabs('.controls-panel');

    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    const modalTeoria = initModal('#modal-teoria');
    document.getElementById('btn-open-theory-modal')?.addEventListener('click', () => {
        modalTeoria?.open();
    });

    switchTab('tab-math');
    updatePlanetaryScaleStats();
    animate(performance.now());
    await inlineSVGImages();

    initKaTeXAutoRender(document.body);
});
