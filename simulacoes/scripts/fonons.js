import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initFocusMirrorToolbar,
    initBottomSheet,
    initTabs,
    initKaTeXAutoRender,
    inlineSVGImages
} from './sim-ui.js';

// =============================================================================
// 1. CONSTANTES & CONFIGURAÇÃO DOS TEMPLATES DE REDE
// =============================================================================
const TEMPLATES = {
    'uniforme_10': { px: 18, py: 18, padrao: 'uniforme', massas: [1], ks: { horizontal: 22, vertical: 22 } },
    'uniforme_20': { px: 28, py: 28, padrao: 'uniforme', massas: [1], ks: { horizontal: 16, vertical: 16 } },
    'uniforme_50': { px: 46, py: 46, padrao: 'uniforme', massas: [1], ks: { horizontal: 12, vertical: 12 } },
    'linhas_20':   { px: 28, py: 28, padrao: 'linhas', massas: [1, 4.5], ks: { horizontal: 16, vertical: 16 } },
    'linhas_50':   { px: 46, py: 46, padrao: 'linhas', massas: [1, 4.5], ks: { horizontal: 12, vertical: 12 } },
    'checkerboard_20': { px: 28, py: 28, padrao: 'checkerboard', massas: [1, 4.5], ks: { horizontal: 16, vertical: 16 } },
    'checkerboard_50': { px: 46, py: 46, padrao: 'checkerboard', massas: [1, 4.5], ks: { horizontal: 12, vertical: 12 } }
};

const state = {
    isRunning: true,
    speed: 1.0,
    time: 0.0,
    templateKey: 'uniforme_50',
    raioInfluencia: 80,
    intensidade: 250,
    amortecimento: 0.005
};

// =============================================================================
// 2. CLASSES FÍSICAS (PARTÍCULA, MOLA & REDE CRISTALINA)
// =============================================================================
class Particula {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.origX = x;
        this.origY = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;
        this.massa = 1.0;
        this.fixa = false;
    }

    aplicarForca(fx, fy) {
        this.ax += fx / this.massa;
        this.ay += fy / this.massa;
    }

    resetarForcas() {
        this.ax = 0;
        this.ay = 0;
    }
}

class Mola {
    constructor(p1, p2, k) {
        this.p1 = p1;
        this.p2 = p2;
        this.k = k;
    }

    aplicarForcas() {
        // Deslocamento relativo a partir do equilíbrio
        const dx = (this.p2.x - this.p1.x) - (this.p2.origX - this.p1.origX);
        const dy = (this.p2.y - this.p1.y) - (this.p2.origY - this.p1.origY);

        const fx = this.k * dx;
        const fy = this.k * dy;

        this.p1.aplicarForca(fx, fy);
        this.p2.aplicarForca(-fx, -fy);
    }
}

class SistemaParticulas {
    constructor() {
        this.particulas = [];
        this.molas = [];
    }

    gerarRede(largura, altura, config) {
        this.particulas = [];
        this.molas = [];

        const px = config.px;
        const py = config.py;
        const padrao = config.padrao;
        const massas = config.massas;
        const ks = config.ks;

        const margin = 20;
        const areaW = Math.max(100, largura - margin * 2);
        const areaH = Math.max(100, altura - margin * 2);

        const nColunas = Math.max(3, Math.floor(areaW / px) + 1);
        const nLinhas = Math.max(3, Math.floor(areaH / py) + 1);

        const startX = (largura - (nColunas - 1) * px) / 2;
        const startY = (altura - (nLinhas - 1) * py) / 2;

        const grid = [];

        for (let i = 0; i < nColunas; i++) {
            grid[i] = [];
            for (let j = 0; j < nLinhas; j++) {
                const x = startX + i * px;
                const y = startY + j * py;
                const p = new Particula(x, y);

                // Atribuição de massas
                if (padrao === 'linhas') {
                    p.massa = massas[j % massas.length];
                } else if (padrao === 'checkerboard') {
                    p.massa = massas[(i + j) % massas.length];
                } else {
                    p.massa = massas[0];
                }

                // Bordas fixas para reflexão de ondas
                if (i === 0 || i === nColunas - 1 || j === 0 || j === nLinhas - 1) {
                    p.fixa = true;
                }

                grid[i][j] = p;
                this.particulas.push(p);
            }
        }

        // Conectar molas ortogonais
        for (let i = 0; i < nColunas; i++) {
            for (let j = 0; j < nLinhas; j++) {
                const p1 = grid[i][j];
                if (i < nColunas - 1) {
                    const p2 = grid[i + 1][j];
                    this.molas.push(new Mola(p1, p2, ks.horizontal));
                }
                if (j < nLinhas - 1) {
                    const p2 = grid[i][j + 1];
                    this.molas.push(new Mola(p1, p2, ks.vertical));
                }
            }
        }
    }

    atualizar(dt, amortecimento) {
        // Zera acelerações
        for (let i = 0; i < this.particulas.length; i++) {
            this.particulas[i].resetarForcas();
        }

        // Calcula forças de mola
        for (let i = 0; i < this.molas.length; i++) {
            this.molas[i].aplicarForcas();
        }

        // Integração numérica Euler-Cromer com amortecimento
        const dampingFactor = Math.max(0, 1 - amortecimento * 60 * dt);

        for (let i = 0; i < this.particulas.length; i++) {
            const p = this.particulas[i];
            if (p.fixa) {
                p.vx = 0;
                p.vy = 0;
                continue;
            }

            p.vx = (p.vx + p.ax * dt) * dampingFactor;
            p.vy = (p.vy + p.ay * dt) * dampingFactor;

            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }

    aplicarPulsoCentral(forcaMax) {
        let centroX = 0;
        let centroY = 0;
        let total = 0;

        for (let i = 0; i < this.particulas.length; i++) {
            centroX += this.particulas[i].origX;
            centroY += this.particulas[i].origY;
            total++;
        }
        centroX /= total;
        centroY /= total;

        for (let i = 0; i < this.particulas.length; i++) {
            const p = this.particulas[i];
            if (p.fixa) continue;
            const dx = p.origX - centroX;
            const dy = p.origY - centroY;
            const dist = Math.hypot(dx, dy);

            const raioPulso = 160;
            if (dist < raioPulso) {
                const peso = Math.pow(1 - dist / raioPulso, 1.2);
                const f = peso * forcaMax;
                if (dist > 1) {
                    p.vx += (dx / dist) * f;
                    p.vy += (dy / dist) * f;
                    p.x += (dx / dist) * (f * 0.04);
                    p.y += (dy / dist) * (f * 0.04);
                } else {
                    p.vy += f;
                    p.y += f * 0.04;
                }
            }
        }
    }

    calcularEnergiaCineticaMedia() {
        let somaK = 0;
        let contagem = 0;
        for (let i = 0; i < this.particulas.length; i++) {
            const p = this.particulas[i];
            if (!p.fixa) {
                somaK += 0.5 * p.massa * (p.vx * p.vx + p.vy * p.vy);
                contagem++;
            }
        }
        return contagem > 0 ? (somaK / contagem) : 0;
    }
}

// =============================================================================
// 3. CANVAS, PALETA E RENDERIZAÇÃO
// =============================================================================
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
const sistema = new SistemaParticulas();
let plotEnergia = null;

// Ponteiro tátil / mouse
const pointer = {
    isDown: false,
    id: null,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0
};

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);

        // Regenerar a grade adaptada ao novo tamanho
        const config = TEMPLATES[state.templateKey] || TEMPLATES['uniforme_50'];
        sistema.gerarRede(w, h, config);
        atualizarHUDInfo();
    }
}

function getCanvasLogicalWidth() {
    return canvas.clientWidth || (canvas.width / (window.devicePixelRatio || 1));
}

function getCanvasLogicalHeight() {
    return canvas.clientHeight || (canvas.height / (window.devicePixelRatio || 1));
}

// Converte velocidade escalar para cor Plasma em HSL
function velocidadeParaCor(vx, vy) {
    const vel = Math.sqrt(vx * vx + vy * vy);
    const intensidade = Math.min(1.0, Math.pow(vel / 22.0, 0.75));

    // De Azul Profundo (220) até Amarelo Brilhante (60)
    const hue = Math.round((220 + intensidade * 200) % 360);
    const sat = Math.round(40 + intensidade * 60);
    const lum = Math.round(35 + intensidade * 30);

    return `hsl(${hue}, ${sat}%, ${lum}%)`;
}

function render() {
    const w = getCanvasLogicalWidth();
    const h = getCanvasLogicalHeight();

    ctx.clearRect(0, 0, w, h);

    // 1. Linhas sutis das molas
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < sistema.molas.length; i++) {
        const m = sistema.molas[i];
        ctx.moveTo(m.p1.x, m.p1.y);
        ctx.lineTo(m.p2.x, m.p2.y);
    }
    ctx.stroke();

    // 2. Partículas atômicas
    for (let i = 0; i < sistema.particulas.length; i++) {
        const p = sistema.particulas[i];
        const raio = 3.2 * Math.pow(p.massa, 0.38);

        ctx.beginPath();
        ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);

        if (p.fixa) {
            ctx.fillStyle = '#334155'; // Cinza escuro discreto nas bordas
        } else {
            ctx.fillStyle = velocidadeParaCor(p.vx, p.vy);
        }
        ctx.fill();
    }

    // 3. Indicador visual da área de influência tátil
    if (pointer.isDown) {
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, state.raioInfluencia, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.fill();
    }
}

// =============================================================================
// 4. INTERAÇÃO TÁTIL CALIBRADA VIA POINTER EVENTS (TOUCH & MOUSE)
// =============================================================================
function setupPointerEvents() {
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = getCanvasLogicalWidth() / rect.width;
        const scaleY = getCanvasLogicalHeight() / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    canvas.addEventListener('pointerdown', (e) => {
        const pos = getPointerPos(e);
        pointer.isDown = true;
        pointer.id = e.pointerId;
        pointer.x = pos.x;
        pointer.y = pos.y;
        pointer.prevX = pos.x;
        pointer.prevY = pos.y;
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!pointer.isDown || e.pointerId !== pointer.id) return;

        const pos = getPointerPos(e);
        pointer.prevX = pointer.x;
        pointer.prevY = pointer.y;
        pointer.x = pos.x;
        pointer.y = pos.y;

        const deltaX = pointer.x - pointer.prevX;
        const deltaY = pointer.y - pointer.prevY;

        // Aplica perturbação harmônica radial aos átomos vizinhos
        const rInf = state.raioInfluencia;
        const intensidade = state.intensidade * 0.12;

        for (let i = 0; i < sistema.particulas.length; i++) {
            const p = sistema.particulas[i];
            if (p.fixa) continue;

            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const dist = Math.hypot(dx, dy);

            if (dist < rInf) {
                const peso = Math.pow(1 - dist / rInf, 1.5);
                p.vx += deltaX * intensidade * peso;
                p.vy += deltaY * intensidade * peso;
            }
        }
    });

    const endPointer = (e) => {
        if (e.pointerId === pointer.id) {
            pointer.isDown = false;
            pointer.id = null;
        }
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
}

// =============================================================================
// 5. INTEGRAÇÃO COM DESIGN SYSTEM 2.0 (sim-ui.js)
// =============================================================================
function atualizarHUDInfo() {
    const elPart = document.getElementById('hud-particulas');
    const elMolas = document.getElementById('hud-molas');
    if (elPart) elPart.textContent = sistema.particulas.length.toLocaleString('pt-BR');
    if (elMolas) elMolas.textContent = sistema.molas.length.toLocaleString('pt-BR');
}

function setupUI() {
    // Modo Foco Desktop (F)
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: resizeCanvas
    });

    // Mobile Bottom Sheet
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // Barra flutuante de contexto para Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // Barra de Transporte (Play / Pause)
    const playControl = initToggleButton('#btn-play-sim', (active) => {
        state.isRunning = active;
        const statusEl = document.getElementById('footer-status-text');
        if (statusEl) statusEl.textContent = active ? 'Ondas em Propagação' : 'Pausado';
    });

    // Passo Único
    document.getElementById('btn-step-sim')?.addEventListener('click', () => {
        if (state.isRunning) playControl.setState(0);
        sistema.atualizar(0.016, state.amortecimento);
    });

    // Reset da Rede (Zera velocidades mantendo a estrutura)
    const handleReset = () => {
        for (let i = 0; i < sistema.particulas.length; i++) {
            const p = sistema.particulas[i];
            p.x = p.origX;
            p.y = p.origY;
            p.vx = 0;
            p.vy = 0;
            p.ax = 0;
            p.ay = 0;
        }
        state.time = 0;
        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = 't = 0.00s';
    };
    document.getElementById('btn-reset-sim')?.addEventListener('click', handleReset);

    // Botão de Pulso Central Rápido
    document.getElementById('btn-quick-pulse')?.addEventListener('click', () => {
        sistema.aplicarPulsoCentral(state.intensidade * 0.8);
    });

    // Seletor de Velocidades
    document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.speed = parseFloat(btn.dataset.speed || '1.0');
        });
    });

    // Seletor de Topologias
    document.getElementById('seletor-de-template')?.addEventListener('change', (e) => {
        state.templateKey = e.target.value;
        const config = TEMPLATES[state.templateKey] || TEMPLATES['uniforme_50'];
        sistema.gerarRede(getCanvasLogicalWidth(), getCanvasLogicalHeight(), config);
        atualizarHUDInfo();
    });

    // Sliders Sincronizados
    syncDualSlider('#slider-raio', '#num-raio', (val) => {
        state.raioInfluencia = val;
    });

    syncDualSlider('#slider-intensidade', '#num-intensidade', (val) => {
        state.intensidade = val;
    });

    syncDualSlider('#slider-amortecimento', '#num-amortecimento', (val) => {
        state.amortecimento = val;
    });

    // Navegação de Abas via Design System
    initTabs();

    // Mini-Gráfico RealtimePlot
    plotEnergia = new RealtimePlot('#canvas-plot-energia', {
        maxPoints: 80,
        minVal: 0,
        maxVal: 15,
        color: '#38bdf8'
    });
}

// =============================================================================
// 6. LOOP PRINCIPAL DE ANIMAÇÃO
// =============================================================================
let lastTime = performance.now();

function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if (state.isRunning) {
        sistema.atualizar(dt * state.speed, state.amortecimento);
        state.time += dt * state.speed;

        const timerEl = document.getElementById('footer-sim-timer');
        if (timerEl) timerEl.textContent = `t = ${state.time.toFixed(2)}s`;
    }

    render();

    // Telemetria
    const kMedia = sistema.calcularEnergiaCineticaMedia();
    const hudEnergia = document.getElementById('hud-energia');
    const plotVal = document.getElementById('plot-valor-k');

    if (hudEnergia) hudEnergia.textContent = `${kMedia.toFixed(2)} u`;
    if (plotVal) plotVal.textContent = `${kMedia.toFixed(2)} u`;

    if (plotEnergia && state.isRunning) {
        plotEnergia.push(kMedia);
    }
}

// =============================================================================
// 7. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    inlineSVGImages();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupPointerEvents();
    setupUI();
    atualizarHUDInfo();
    initKaTeXAutoRender(document.body);
    requestAnimationFrame(animate);
});