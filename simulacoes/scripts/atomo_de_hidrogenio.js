// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini 3.6 Flash
// Simulação: Átomo de Hidrogênio — Orbitais Quânticos
// Descrição: Solução analítica de Ψ_{n,l,mₗ}(r,θ,φ) via polinômios de Laguerre
//            e Legendre associados com amostragem Monte Carlo 3D (Three.js).
// =============================================================================

import * as THREE              from 'three';
import { OrbitControls }      from 'three/addons/controls/OrbitControls.js';
import {
    initSidebarCollapse,
    initBottomSheet,
    inlineSVGImages,
    syncDualSlider,
    initTabs,
    initFocusMirrorToolbar,
    initKaTeXAutoRender
} from './sim-ui.js';

// ============================================================================
// 1. FÍSICA — Funções Analíticas do Átomo de Hidrogênio
// ============================================================================

// Raio de Bohr: usamos unidades atômicas (a₀ = 1).
const A0 = 1.0;

/** Fatorial n! (n ≤ 20 cobre todos os casos com l ≤ 5, n ≤ 5). */
function fat(n) {
    if (n <= 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
}

/**
 * Polinômio de Laguerre Generalizado  Lₚᵅ(x)  por recorrência de 3 termos:
 *
 *   L₀ᵅ(x) = 1
 *   L₁ᵅ(x) = 1 + α − x
 *   (k+1) Lₖ₊₁ᵅ(x) = (2k+1+α−x) Lₖᵅ(x) − (k+α) Lₖ₋₁ᵅ(x)
 *
 * @param {number} p     — ordem (número de nós radiais = n − l − 1)
 * @param {number} alpha — parâmetro   (= 2l + 1)
 * @param {number} x     — argumento   (= ρ = 2r/(n·a₀))
 */
function laguerreAssoc(p, alpha, x) {
    if (p === 0) return 1.0;
    if (p === 1) return 1.0 + alpha - x;
    let Lprev = 1.0;
    let Lcurr = 1.0 + alpha - x;
    for (let k = 1; k < p; k++) {
        const Lnext = ((2 * k + 1 + alpha - x) * Lcurr - (k + alpha) * Lprev) / (k + 1);
        Lprev = Lcurr;
        Lcurr = Lnext;
    }
    return Lcurr;
}

/**
 * Polinômio de Legendre Associado  P_l^m(x),  com  m = |mₗ| ≥ 0.
 * Inclui o fator de fase de Condon–Shortley (−1)^m.
 * Recorrência estável para l ≤ 5:
 *
 *   P_m^m(x)   = (−1)^m · (2m−1)!! · (1−x²)^{m/2}
 *   P_{m+1}^m  = (2m+1) · x · P_m^m
 *   P_{l+1}^m  = [(2l−1)·x·P_l^m − (l+m−1)·P_{l−1}^m] / (l−m)
 *
 * @param {number} l    — momento angular azimutal
 * @param {number} m    — |mₗ|
 * @param {number} x    — cos θ
 */
function legendreAssoc(l, m, x) {
    // --- Valor inicial P_m^m ---
    let Pmm = 1.0;
    if (m > 0) {
        const sinT = Math.sqrt(Math.max(0.0, 1.0 - x * x));
        let fator = 1.0;
        for (let i = 1; i <= m; i++) {
            Pmm  *= -fator * sinT;
            fator += 2.0;
        }
    }
    if (l === m) return Pmm;

    // --- Um passo: P_{m+1}^m ---
    let Pprev = Pmm;
    let Pcurr = (2 * m + 1) * x * Pmm;
    if (l === m + 1) return Pcurr;

    // --- Recorrência até l ---
    for (let ll = m + 2; ll <= l; ll++) {
        const Pnext = ((2 * ll - 1) * x * Pcurr - (ll + m - 1) * Pprev) / (ll - m);
        Pprev = Pcurr;
        Pcurr = Pnext;
    }
    return Pcurr;
}

/**
 * Parte radial normalizada  R_{nl}(r)  (unidades atômicas, a₀ = 1):
 *
 *   R_{nl}(r) = N · exp(−ρ/2) · ρˡ · L_{n−l−1}^{2l+1}(ρ)
 *
 * onde  ρ = 2r / (n·a₀)  e  N = √[ (2/n·a₀)³ · (n−l−1)! / (2n·(n+l)!) ]
 *
 * @param {number} n — número quântico principal
 * @param {number} l — momento angular azimutal
 * @param {number} r — distância ao núcleo (em a₀)
 */
function R_nl(n, l, r) {
    const rho  = 2.0 * r / (n * A0);
    const p    = n - l - 1;                            // nós radiais
    const norm = Math.sqrt(
        Math.pow(2.0 / (n * A0), 3) * fat(p) / (2.0 * n * fat(n + l))
    );
    return norm * Math.exp(-rho / 2.0) * Math.pow(rho, l) * laguerreAssoc(p, 2 * l + 1, rho);
}

/**
 * Quadrado do fator de normalização dos harmônicos esféricos |K_{lm}|²:
 *
 *   |Y_l^m(θ,φ)|² = K² · [P_l^|m|(cosθ)]²   (sem dependência em φ para |Y|²)
 *
 *   K² = (2l+1) / (4π) · (l−|m|)! / (l+|m|)!
 */
function normK2(l, absm) {
    return (2 * l + 1) / (4 * Math.PI) * fat(l - absm) / fat(l + absm);
}

/**
 * Calcula  |Ψ_{nlmₗ}|²  e  arg(Ψ_{nlmₗ})  em coordenadas esféricas.
 *
 * A função de onda completa é:
 *   Ψ = R_{nl}(r) · K · P_l^|mₗ|(cosθ) · exp(i·mₗ·φ)
 *
 * Portanto:
 *   |Ψ|²   = R² · K² · [P_l^|mₗ|]²                  (sem φ)
 *   arg(Ψ) = arg(R · P_l^|mₗ|) + mₗ · φ
 *          = {0 ou π conforme sinal do prefator real} + mₗ·φ
 *
 * A fase revela:
 *   • Nós radiais:   troca de sinal de R_{nl} → salto de π na fase
 *   • Nós angulares: troca de sinal de P_l^|m| → salto de π na fase
 *   • Winding azimutal: gira mₗ voltas em 2π por volta no eixo z
 *
 * @param {number} n
 * @param {number} l
 * @param {number} ml  — mₗ (pode ser negativo)
 * @param {number} r
 * @param {number} cosTheta — cos θ ∈ [−1, 1]
 * @param {number} phi      — φ ∈ [0, 2π)
 * @returns {{ density: number, phase: number }}
 */
function calcularEstado(n, l, ml, r, cosTheta, phi) {
    if (r < 1e-12) return { density: 0.0, phase: 0.0 };

    const Rnl  = R_nl(n, l, r);
    const absm = Math.abs(ml);
    const Plm  = legendreAssoc(l, absm, cosTheta);
    const K2   = normK2(l, absm);

    const density = Rnl * Rnl * K2 * Plm * Plm;

    // Fase: sinal do prefator real (R·Plm) + winding azimutal (mₗ·φ)
    const signPrefator = Math.sign(Rnl) * Math.sign(Plm);
    const phaseOffset  = (signPrefator < 0) ? Math.PI : 0.0;
    const phase        = phaseOffset + ml * phi;

    return { density, phase };
}

// ============================================================================
// 2. AMOSTRAGEM — Monte Carlo por Rejeição (coordenadas esféricas)
// ============================================================================

/**
 * Gera `numPontos` pontos amostrados de  |Ψ|²·r²·sinθ  via rejeição.
 *
 * A amostragem é feita em coordenadas esféricas (r, cosθ, φ):
 *   1. Estimar max( |Ψ|²·r²·sinθ ) com ~6000 amostras aleatórias.
 *   2. Amostrar (r, cosθ, φ) uniformemente num semi-intervalo esférico.
 *   3. Aceitar com probabilidade proporcional a |Ψ|²·r²·sinθ / max.
 *   4. Converter para cartesianas e registrar fase.
 *
 * O raio máximo rmax ≈ 4.5·n² + 6  (em a₀) garante que > 99.9% da
 * probabilidade total está contida dentro da esfera de corte.
 *
 * @param {number} n
 * @param {number} l
 * @param {number} ml
 * @param {number} numPontos
 * @returns {Array<{x,y,z,density,phase}>}
 */
function gerarPontos(n, l, ml, numPontos) {
    const rmax   = n * n * 4.5 + 6;   // raio de corte em a₀
    const pontos = [];

    // --- Fase 1: estimar max(|Ψ|²·r²·sinθ) ---
    let maxVal = 1e-40;
    const N_EST = 7000;
    for (let i = 0; i < N_EST; i++) {
        const r    = Math.random() * rmax;
        const cosT = 2.0 * Math.random() - 1.0;
        const sinT = Math.sqrt(Math.max(0.0, 1.0 - cosT * cosT));
        // φ = 0 é suficiente aqui porque density não depende de φ
        const { density } = calcularEstado(n, l, ml, r, cosT, 0.0);
        const val = density * r * r * sinT;
        if (val > maxVal) maxVal = val;
    }
    maxVal *= 1.65;   // margem de segurança extra

    // --- Fase 2: amostragem por rejeição ---
    const MAX_TENTATIVAS = Math.min(numPontos * 1500, 10_000_000);
    let tentativas = 0;

    while (pontos.length < numPontos && tentativas < MAX_TENTATIVAS) {
        tentativas++;
        const r    = Math.random() * rmax;
        const cosT = 2.0 * Math.random() - 1.0;
        const sinT = Math.sqrt(Math.max(0.0, 1.0 - cosT * cosT));
        const phi  = Math.random() * 2.0 * Math.PI;

        const estado = calcularEstado(n, l, ml, r, cosT, phi);
        const val    = estado.density * r * r * sinT;

        if (Math.random() * maxVal < val) {
            pontos.push({
                x:       r * sinT * Math.cos(phi),
                y:       r * sinT * Math.sin(phi),
                z:       r * cosT,
                density: estado.density,
                phase:   estado.phase,
            });
        }
    }

    return pontos;
}

// ============================================================================
// 3. RENDERIZAÇÃO — Three.js
// ============================================================================

let scene, camera, renderer, orbitControls, pointCloud, container;

/** Função de redimensionamento contínuo da câmera e do renderer WebGL */
export function onWindowResize() {
    if (!container) container = document.getElementById('three-container');
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

/** Inicializa cena, câmera, renderer, OrbitControls e elementos fixos. */
function initScene() {
    container = document.getElementById('three-container');

    // Cena
    scene = new THREE.Scene();

    // Câmera perspectiva
    camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.01, 8000
    );
    camera.position.set(20, 10, 35);

    // Renderer com anti-aliasing
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x00000d);
    container.appendChild(renderer.domElement);

    // OrbitControls com damping suave
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping  = true;
    orbitControls.dampingFactor  = 0.06;
    orbitControls.minDistance    = 0.5;
    orbitControls.maxDistance    = 3000;

    // --- Núcleo (próton) ---
    const nucleusGeo = new THREE.SphereGeometry(0.45, 24, 24);
    const nucleusMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0 });
    scene.add(new THREE.Mesh(nucleusGeo, nucleusMat));

    // Halo do núcleo (glow)
    const haloGeo = new THREE.SphereGeometry(0.9, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xffdd50, transparent: true, opacity: 0.15,
    });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // --- Eixos de referência sutis ---
    const axesHelper = new THREE.AxesHelper(7);
    axesHelper.material.transparent = true;
    axesHelper.material.opacity     = 0.22;
    scene.add(axesHelper);

    // --- Campo de estrelas de fundo ---
    const starGeo = new THREE.BufferGeometry();
    const N_STARS = 2500;
    const starPos = new Float32Array(N_STARS * 3);
    for (let i = 0; i < N_STARS * 3; i++) {
        starPos[i] = (Math.random() - 0.5) * 5000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.7, sizeAttenuation: true,
    })));

    // Responsive resize
    const obs = new ResizeObserver(() => {
        if (!container.clientWidth) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
    obs.observe(container);

    // Loop de animação
    (function animate() {
        requestAnimationFrame(animate);
        orbitControls.update();
        renderer.render(scene, camera);
    })();
}

/**
 * Converte a fase arg(Ψ) em cor HSL circular.
 * Uma volta completa de φ percorre todo o espectro de cores.
 * Lobes com fase oposta (0 vs π) ganham cores opostas no disco de cores.
 *
 * @param {number} phase — em radianos (qualquer valor real)
 * @returns {THREE.Color}
 */
function faseParaCor(phase) {
    const hue = (((phase / (2 * Math.PI)) % 1.0) + 1.0) % 1.0;
    const cor = new THREE.Color();
    cor.setHSL(hue, 0.95, 0.60);
    return cor;
}

/**
 * Converte densidade normalizada t ∈ [0,1] em cor gradiente
 * azul escuro → ciano → branco.
 *
 * @param {number} t — densidade normalizada com correção de gama
 * @returns {THREE.Color}
 */
function densidadeParaCor(t) {
    const cor = new THREE.Color();
    if (t < 0.40) {
        const s = t / 0.40;
        cor.setRGB(0.00, s * 0.55, 0.08 + s * 0.88);
    } else if (t < 0.75) {
        const s = (t - 0.40) / 0.35;
        cor.setRGB(s * 0.14, 0.55 + s * 0.40, 0.96);
    } else {
        const s = (t - 0.75) / 0.25;
        cor.setRGB(0.14 + s * 0.83, 0.95 + s * 0.05, 0.96 + s * 0.04);
    }
    return cor;
}

/**
 * Constrói (ou reconstrói) a nuvem de pontos na cena Three.js.
 * Usa blending aditivo para efeito de luminescência nas regiões densas.
 *
 * @param {Array}  pontos — saída de gerarPontos()
 * @param {string} modo   — 'fase' | 'densidade'
 * @param {number} n      — número quântico principal (determina tamanho dos pontos)
 */
function criarNuvem(pontos, modo, n) {
    if (pointCloud) {
        scene.remove(pointCloud);
        pointCloud.geometry.dispose();
        pointCloud.material.dispose();
        pointCloud = null;
    }
    if (pontos.length === 0) return;

    // Máximo de densidade para normalizar o gradiente
    let maxDensidade = 0;
    for (const p of pontos) if (p.density > maxDensidade) maxDensidade = p.density;

    const N   = pontos.length;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
        const p = pontos[i];
        pos[i * 3]     = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;

        let c;
        if (modo === 'fase') {
            c = faseParaCor(p.phase);
        } else {
            // Correção de gama (γ ≈ 0.38) para realçar estrutura de baixa densidade
            const t = Math.pow(p.density / maxDensidade, 0.38);
            c = densidadeParaCor(t);
        }
        col[i * 3]     = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    // Tamanho dos pontos cresce levemente com n (orbitais maiores)
    const tamanho = Math.max(0.12, n * 0.10);

    const mat = new THREE.PointsMaterial({
        size:            tamanho,
        vertexColors:    true,
        sizeAttenuation: true,
        transparent:     true,
        opacity:         0.88,
        blending:        THREE.AdditiveBlending,   // brilho acumulado nas regiões densas
        depthWrite:      false,
    });

    pointCloud = new THREE.Points(geo, mat);
    scene.add(pointCloud);
}

// ============================================================================
// 4. INTERFACE DE USUÁRIO
// ============================================================================

const NOMES_L = ['s', 'p', 'd', 'f', 'g'];

// Referências DOM — Painel Lateral Principal
const selectN      = document.getElementById('select-n');
const selectL      = document.getElementById('select-l');
const selectMl     = document.getElementById('select-ml');
const selectMs     = document.getElementById('select-ms');
const selectModo   = document.getElementById('select-modo');
const sliderPts    = document.getElementById('slider-pontos');
const spanPts      = document.getElementById('span-pontos');
const btnGerar     = document.getElementById('btn-gerar');
const spanOrbital  = document.getElementById('span-orbital');
const spanEnergia  = document.getElementById('span-energia');
const statusMsg    = document.getElementById('status-msg');
const legendFase   = document.getElementById('legend-fase');
const legendDens   = document.getElementById('legend-density');

// Ações Flutuantes no Topo Direito & Rodapé
const btnQuickAutorotate   = document.getElementById('btn-quick-autorotate');
const footerEnergyMeta     = document.getElementById('footer-energy-meta');
const footerStatusText     = document.getElementById('footer-status-text');

/** Formata o badge do orbital com tipografia matemática via KaTeX quando disponível */
function formatarBadgeOrbital(n, l, ml) {
    const subshell = NOMES_L[l] || 's';
    const nomeOrbital = `${n}${subshell}`;
    const mlStr = ml >= 0 ? `+${ml}` : `${ml}`;
    const texStr = `(m_l = ${mlStr})`;

    if (window.katex && typeof window.katex.renderToString === 'function') {
        try {
            const mathHtml = window.katex.renderToString(texStr, { throwOnError: false });
            return `${nomeOrbital} <span class="badge-math">${mathHtml}</span>`;
        } catch (e) {
            // fallback em caso de erro de renderização
        }
    }
    return `${nomeOrbital} <span class="badge-math">(${texStr})</span>`;
}

/** Atualiza todos os badges do orbital em tempo real */
function atualizarBadges() {
    const n = parseInt(selectN.value) || 1;
    const l = parseInt(selectL.value) || 0;
    const ml = parseInt(selectMl.value) || 0;
    const descCompleta = formatarBadgeOrbital(n, l, ml);
    const energiaVal = (-13.6 / (n * n)).toFixed(3);
    const energiaStr = `E = ${energiaVal} eV`;

    if (spanOrbital) spanOrbital.innerHTML = descCompleta;
    if (spanEnergia) spanEnergia.textContent = energiaStr;
    if (footerEnergyMeta) footerEnergyMeta.textContent = energiaStr;
}

/** Preenche os <select> de l no painel lateral (0 … n−1). */
function atualizarSelectL() {
    const n = parseInt(selectN.value) || 1;
    const lPrev = parseInt(selectL.value) || 0;

    selectL.innerHTML = '';

    for (let l = 0; l < n; l++) {
        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = `${l}  (${NOMES_L[l]})`;
        selectL.appendChild(opt);
    }

    const valL = Math.min(lPrev, n - 1);
    selectL.value = valL;

    atualizarSelectMl();
    atualizarBadges();
}

/** Preenche os <select> de m_l no painel lateral (−l … +l). */
function atualizarSelectMl() {
    const l = parseInt(selectL.value) || 0;
    const mlPrev = parseInt(selectMl.value) || 0;

    selectMl.innerHTML = '';

    for (let ml = -l; ml <= l; ml++) {
        const opt = document.createElement('option');
        opt.value = ml;
        opt.textContent = ml >= 0 ? `+${ml}` : `${ml}`;
        selectMl.appendChild(opt);
    }

    const valMl = Math.max(-l, Math.min(l, mlPrev));
    selectMl.value = valMl;

    atualizarBadges();
}

/** Mostra a legenda de fase ou de densidade conforme o modo selecionado. */
function atualizarLegenda() {
    const modo = selectModo.value;
    if (modo === 'fase') {
        legendFase?.classList.remove('hidden');
        legendDens?.classList.add('hidden');
    } else {
        legendFase?.classList.add('hidden');
        legendDens?.classList.remove('hidden');
    }
}

/** Atualiza o texto de status e ativa/desativa os botões. */
function setStatus(msg, carregando = false) {
    if (statusMsg) {
        statusMsg.textContent = msg;
        statusMsg.className = carregando ? 'status loading' : 'status';
    }
    if (btnGerar) btnGerar.disabled = carregando;
}

// Pontos atuais em memória — permite recolorir sem recalcular
let pontosAtuais = null;
let nAtual = 1;

/** Recolore a nuvem existente com o novo modo, sem regenerar pontos. */
function recolorirNuvem() {
    if (pontosAtuais) criarNuvem(pontosAtuais, selectModo.value, nAtual);
}

// ---- Listeners dos Controles ----

// 1. Mudança em n
selectN.addEventListener('change', () => {
    atualizarSelectL();
    btnGerar.click();
});

// 2. Mudança em l
selectL.addEventListener('change', () => {
    atualizarSelectMl();
    btnGerar.click();
});

// 3. Mudança em ml
selectMl.addEventListener('change', () => {
    atualizarBadges();
    btnGerar.click();
});

// 4. Modo de Cor
selectModo.addEventListener('change', () => {
    atualizarLegenda();
    recolorirNuvem();
});

// 5. Slider de Pontos com Dual Slider
syncDualSlider('#slider-pontos', '#num-pontos', (val) => {
    const pts = parseInt(val);
    const formatted = pts.toLocaleString('pt-BR');
    if (spanPts) spanPts.textContent = formatted;
});

// 6. Alternância de Rotação da Câmera
btnQuickAutorotate?.addEventListener('click', () => {
    if (!orbitControls) return;
    orbitControls.autoRotate = !orbitControls.autoRotate;
    orbitControls.autoRotateSpeed = 0.8;
    btnQuickAutorotate.classList.toggle('active', orbitControls.autoRotate);
    const icon = btnQuickAutorotate.querySelector('.icon-svg');
    if (icon) icon.classList.toggle('icon-spin', orbitControls.autoRotate);
});

// 7. Abas: Parâmetros vs. Teoria
initTabs('.controls-panel');

// Cálculo e Geração do Orbital
btnGerar.addEventListener('click', () => {
    const n         = parseInt(selectN.value) || 1;
    const l         = parseInt(selectL.value) || 0;
    const ml        = parseInt(selectMl.value) || 0;
    const numPontos = parseInt(sliderPts.value) || 5000;
    const modo      = selectModo.value;

    setStatus('Calculando Ψ(r, θ, φ)…', true);

    // Cede o controle ao browser para renderizar o status antes de bloquear
    setTimeout(() => {
        const t0     = performance.now();
        const pontos = gerarPontos(n, l, ml, numPontos);
        const dt     = ((performance.now() - t0) / 1000).toFixed(2);

        pontosAtuais = pontos;
        nAtual       = n;

        criarNuvem(pontos, modo, n);
        atualizarBadges();

        // Reposicionar câmera para enquadrar o orbital
        const dist = n * n * 3.2 + 15;
        camera.position.set(dist * 0.55, dist * 0.30, dist * 0.78);
        orbitControls.target.set(0, 0, 0);
        orbitControls.update();

        // Mensagem de status final
        const ptsStr = pontos.length.toLocaleString('pt-BR');
        const msg = pontos.length < numPontos
            ? `⚠ ${ptsStr} pts (limite de tentativas) — ${dt}s`
            : `✓ ${ptsStr} pontos gerados em ${dt}s`;
        setStatus(msg, false);

        if (footerStatusText) {
            footerStatusText.textContent = `Orbital ${n}${NOMES_L[l]} pronto`;
        }
    }, 40);
});

// ============================================================================
// 5. INICIALIZAÇÃO
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    // Configura controladores de modo foco e responsividade mobile
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: onWindowResize
    });

    const layoutEl = document.querySelector('.sim-layout');
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek',
        onStateChange: (state) => {
            if (layoutEl) {
                layoutEl.classList.toggle('mobile-sheet-peek', state === 'peek');
            }
        }
    });

    if (layoutEl && window.innerWidth <= 900) {
        layoutEl.classList.add('mobile-sheet-peek');
    }

    // Barra Flutuante em Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // Popula l e ml com valores iniciais (n=1)
    atualizarSelectL();
    atualizarLegenda();

    // Monta cena Three.js
    initScene();

    // Transforma tags <img> de ícones em código SVG inline com currentColor
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);

    // Gera o orbital 1s automaticamente após a cena estar pronta
    setTimeout(() => btnGerar.click(), 450);
});