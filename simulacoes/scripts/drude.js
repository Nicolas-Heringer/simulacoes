// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Modelo de Drude — Condução Elétrica em Redes Cristalinas
// Descrição: Simulação microscópica do transporte de carga em metais, fônons,
//            velocidade de deriva, agitação térmica e espalhamento em múltiplas redes.
// Arquivo: scripts/drude.js (ES Module com suporte ao Design System 2.0)
// =============================================================================

import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initFocusMirrorToolbar,
    initBottomSheet,
    initModal,
    initTabs,
    initKaTeXAutoRender,
    inlineSVGImages,
    initOnboardingModal
} from './sim-ui.js';

// =============================================================================
// 1. ELEMENTOS DOM E CONFIGURAÇÃO DA INTERFACE
// =============================================================================
const canvas = document.getElementById('drudeCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Elementos de Entrada e Controle
const dirCampoBtns = document.querySelectorAll('#dirCampoControl .segment-btn');
const selectRede = document.getElementById('tipoRede');
const btnZerar = document.getElementById('btnZerar');
const btnToggleTracer = document.getElementById('btn-toggle-tracer');
const btnStepSim = document.getElementById('btn-step-sim');
const btnResetSim = document.getElementById('btn-reset-sim');
const btnSpeedCycle = document.getElementById('btn-speed-cycle');

// Elementos de Telemetria (.sim-readout & Rodapé)
const readoutVd = document.getElementById('readout-vd') || document.getElementById('hud-vd');
const readoutVth = document.getElementById('readout-vth') || document.getElementById('hud-vth');
const readoutEfield = document.getElementById('readout-efield') || document.getElementById('hud-efield');
const readoutColRate = document.getElementById('readout-col-rate') || document.getElementById('hud-col-rate');
const plotValorVd = document.getElementById('plot-valor-vd');
const footerSimInfo = document.getElementById('footer-sim-info');
const footerStatusText = document.getElementById('footer-status-text');
const footerStatusBadge = document.getElementById('footer-status-badge');
const headerStatusBadge = document.getElementById('header-status-badge');

// Variáveis de Estado Físico
let direcaoCampo = 0; // -1 = Esquerda, 0 = Desligado, 1 = Direita
let intensidadeCampo = 0.20;
let campoEletrico = 0.0;
let temperatura = 0.0;
let tipoRede = selectRede ? selectRede.value : 'quadrada';
let numEletrons = 200;

// Variáveis de Controle Temporal e Execução
let isRunning = false; // Simulação inicia pausada conforme padrão DS 2.0
let playControl = null;
let simSpeed = 1.0;
let simTime = 0.0;
let plotVd = null;
const speedCycleSteps = [0.5, 1.0, 2.0, 5.0];
let showTracer = false;
let tracerTrail = [];
const maxTracerPoints = 120;

// Contagem de Colisões
let colisoesContador = 0;
let colisoesPorSegundo = 0;
let ultimoTempoColisao = performance.now();

// Limites Geométricos do Fio Condutor
let wireTop = 150;
let wireBottom = 450;
let wireHeight = 300;

function updateWireGeometry() {
    if (!canvas) return;
    wireHeight = Math.max(200, Math.min(canvas.height * 0.65, 480));
    wireTop = Math.floor((canvas.height - wireHeight) / 2);
    wireBottom = wireTop + wireHeight;
}

function atualizarCampo() {
    campoEletrico = direcaoCampo * intensidadeCampo;
    if (readoutEfield) {
        if (direcaoCampo === 0) {
            readoutEfield.textContent = '0.00 (Off)';
            readoutEfield.style.color = '';
        } else {
            const arrow = direcaoCampo > 0 ? '→' : '←';
            readoutEfield.textContent = `${arrow} ${intensidadeCampo.toFixed(2)}`;
            readoutEfield.style.color = 'var(--accent-hud, var(--accent-color))';
        }
    }
}

// =============================================================================
// 2. CLASSES DA SIMULAÇÃO (NÚCLEO E ELÉTRON)
// =============================================================================
class Nucleo {
    constructor(x, y, radius = 8) {
        this.fixedX = x;
        this.fixedY = y;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.faseX = Math.random() * Math.PI * 2;
        this.faseY = Math.random() * Math.PI * 2;
    }

    update(dtFactor = 1.0) {
        // Agitação térmica (Fônons na rede cristalina)
        const amplitude = temperatura * 0.15;
        this.faseX += (0.08 + Math.random() * 0.04) * dtFactor;
        this.faseY += (0.08 + Math.random() * 0.04) * dtFactor;
        this.x = this.fixedX + amplitude * Math.cos(this.faseX);
        this.y = this.fixedY + amplitude * Math.sin(this.faseY);
    }

    draw(targetCtx) {
        targetCtx.beginPath();
        targetCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        targetCtx.fillStyle = 'rgba(148, 163, 184, 0.82)';
        targetCtx.fill();
        targetCtx.lineWidth = 1.5;
        targetCtx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
        targetCtx.stroke();
        targetCtx.closePath();
    }
}

class Eletron {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 3;
        // Velocidade térmica inicial estocástica
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + (temperatura * 0.05);
        this.vx = speed * Math.cos(angle);
        this.vy = speed * Math.sin(angle);
    }

    update(nucleosList, dtFactor = 1.0) {
        // Aceleração pelo Campo Elétrico (F = -eE; aqui positivo acelera para a direita)
        this.vx += campoEletrico * 0.05 * dtFactor;

        this.x += this.vx * dtFactor;
        this.y += this.vy * dtFactor;

        // Limites superiores e inferiores do fio metálico (reflexão perfeitamente elástica)
        if (this.y - this.radius < wireTop) {
            this.y = wireTop + this.radius;
            this.vy = Math.abs(this.vy);
        } else if (this.y + this.radius > wireBottom) {
            this.y = wireBottom - this.radius;
            this.vy = -Math.abs(this.vy);
        }

        // Condições de contorno periódicas em X (circuito contínuo)
        if (this.x > canvas.width) {
            this.x = 0;
            this.vx *= 0.8;
        } else if (this.x < 0) {
            this.x = canvas.width;
            this.vx *= 0.8;
        }

        // Colisões inelásticas com os núcleos da rede (relaxação estocástica)
        for (let n of nucleosList) {
            const dx = this.x - n.x;
            const dy = this.y - n.y;
            const dist = Math.hypot(dx, dy);

            if (dist < this.radius + n.radius) {
                colisoesContador++;

                // O elétron é re-termalizado em direção aleatória (perda de momento de deriva)
                const angle = Math.random() * Math.PI * 2;
                const vTermal = 0.5 + (temperatura * 0.05);
                this.vx = vTermal * Math.cos(angle);
                this.vy = vTermal * Math.sin(angle);

                // Evitar penetração física no núcleo
                const overlap = (this.radius + n.radius) - dist + 1;
                this.x += (dx / (dist || 1)) * overlap;
                this.y += (dy / (dist || 1)) * overlap;
                break;
            }
        }
    }

    draw(targetCtx, isTracer = false) {
        targetCtx.beginPath();
        targetCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

        if (isTracer) {
            targetCtx.fillStyle = '#facc15';
            targetCtx.shadowColor = '#facc15';
            targetCtx.shadowBlur = 10;
        } else {
            targetCtx.fillStyle = 'rgba(56, 189, 248, 0.95)';
            targetCtx.shadowBlur = 0;
        }

        targetCtx.fill();
        targetCtx.shadowBlur = 0;
        targetCtx.closePath();
    }
}

// =============================================================================
// 3. GERAÇÃO DE REDES CRISTALINAS
// =============================================================================
let nucleos = [];
let eletrons = [];

function gerarRede() {
    nucleos = [];
    if (!canvas) return;

    const rNucleo = 8;
    const paddingX = 40;
    const paddingY = 40;
    const offsetX = 20;
    const offsetY = 20;

    if (tipoRede === 'quadrada') {
        // Rede Quadrada (Cúbica Simples 2D)
        const cols = Math.floor(canvas.width / paddingX) + 1;
        const rows = Math.floor(wireHeight / paddingY) + 1;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const x = j * paddingX + offsetX;
                const y = wireTop + i * paddingY + offsetY;
                if (y > wireTop + rNucleo * 2 && y < wireBottom - rNucleo * 2 && x < canvas.width + paddingX) {
                    nucleos.push(new Nucleo(x, y, rNucleo));
                }
            }
        }
    } else if (tipoRede === 'triangular') {
        // Rede Triangular (Compacta)
        const cols = Math.floor(canvas.width / paddingX) + 1;
        const rows = Math.floor(wireHeight / paddingY) + 1;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                let x = j * paddingX + offsetX;
                let y = wireTop + i * paddingY + offsetY;
                if (i % 2 !== 0) {
                    x += paddingX / 2;
                }
                if (y > wireTop + rNucleo * 2 && y < wireBottom - rNucleo * 2 && x < canvas.width + paddingX) {
                    nucleos.push(new Nucleo(x, y, rNucleo));
                }
            }
        }
    } else if (tipoRede === 'hexagonal') {
        // Hexagonal (Grafeno / Honeycomb)
        const raioFavo = 25;
        const hFavo = Math.sqrt(3) * raioFavo;
        const cols = Math.floor(canvas.width / (1.5 * raioFavo)) + 2;
        const rows = Math.floor(wireHeight / hFavo) + 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let x = col * 1.5 * raioFavo;
                let y = wireTop + row * hFavo;
                if (col % 2 === 1) y += hFavo / 2;

                if (y > wireTop + rNucleo * 2 && y < wireBottom - rNucleo * 2) {
                    nucleos.push(new Nucleo(x, y, rNucleo));
                }
            }
        }
    } else if (tipoRede === 'armchair') {
        // Armchair (Rotação de 90° da Honeycomb)
        const raioFavo = 25;
        const hFavo = Math.sqrt(3) * raioFavo;
        const rows = Math.floor(wireHeight / (1.5 * raioFavo)) + 2;
        const cols = Math.floor(canvas.width / hFavo) + 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let y = wireTop + row * 1.5 * raioFavo;
                let x = col * hFavo;
                if (row % 2 === 1) x += hFavo / 2;

                if (y > wireTop + rNucleo * 2 && y < wireBottom - rNucleo * 2) {
                    nucleos.push(new Nucleo(x, y, rNucleo));
                }
            }
        }
    } else if (tipoRede === 'kagome') {
        // Rede de Kagome (Tri-hexagonal com vértices compartilhados)
        const a = 46;
        const h = a * Math.sqrt(3) / 2;
        const cols = Math.floor(canvas.width / a) + 2;
        const rows = Math.floor(wireHeight / h) + 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const bx = c * a + (r % 2 === 1 ? a / 2 : 0);
                const by = wireTop + r * h + 10;

                const sites = [
                    { x: bx, y: by },
                    { x: bx + a / 2, y: by },
                    { x: bx + a / 4, y: by + h / 2 }
                ];

                for (let s of sites) {
                    if (s.y > wireTop + rNucleo * 2 && s.y < wireBottom - rNucleo * 2 && s.x < canvas.width + a) {
                        nucleos.push(new Nucleo(s.x, s.y, rNucleo));
                    }
                }
            }
        }
    } else if (tipoRede === 'amorfa') {
        // Rede Amorfa (Sólido Desordenado / Defeitos e Impurezas)
        const targetAtoms = Math.floor((canvas.width * wireHeight) / (45 * 45));
        const minDistance = 28;

        for (let attempt = 0; attempt < targetAtoms * 4 && nucleos.length < targetAtoms; attempt++) {
            const rx = 15 + Math.random() * (canvas.width - 30);
            const ry = wireTop + rNucleo * 2 + Math.random() * (wireHeight - rNucleo * 4);

            let ok = true;
            for (let n of nucleos) {
                if (Math.hypot(rx - n.x, ry - n.y) < minDistance) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                nucleos.push(new Nucleo(rx, ry, rNucleo));
            }
        }
    }
}

function inicializarEletrons() {
    eletrons = [];
    tracerTrail = [];
    if (!canvas) return;

    for (let i = 0; i < numEletrons; i++) {
        const x = Math.random() * canvas.width;
        const y = wireTop + 10 + Math.random() * (wireHeight - 20);
        eletrons.push(new Eletron(x, y));
    }
}

function ajustarQuantidadeEletrons() {
    if (!canvas) return;
    while (eletrons.length < numEletrons) {
        const x = Math.random() * canvas.width;
        const y = wireTop + 10 + Math.random() * (wireHeight - 20);
        eletrons.push(new Eletron(x, y));
    }
    if (eletrons.length > numEletrons) {
        eletrons.length = numEletrons;
    }
}

function zerarVelocidades() {
    for (let e of eletrons) {
        e.vx = 0;
        e.vy = 0;
    }
    tracerTrail = [];
}

// =============================================================================
// 4. RENDERIZAÇÃO DO FUNDO E VETORES DO CAMPO ELÉTRICO
// =============================================================================
function desenharFundo() {
    if (!ctx || !canvas) return;

    // Fundo do Canvas
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Zona do Fio Metálico Condutor
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fillRect(0, wireTop, canvas.width, wireHeight);

    // Linhas de Contorno do Fio Metálico
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, wireTop);
    ctx.lineTo(canvas.width, wireTop);
    ctx.moveTo(0, wireBottom);
    ctx.lineTo(canvas.width, wireBottom);
    ctx.stroke();

    // Visualização do Campo Elétrico de Fundo (setas direcionais suaves)
    if (Math.abs(campoEletrico) > 0.001) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.12)';
        ctx.lineWidth = 1.5;

        const eAbs = Math.abs(campoEletrico);
        const dir = Math.sign(campoEletrico);
        const arrowLen = Math.max(8, eAbs * 60);
        const headSize = Math.max(3, arrowLen * 0.25);

        let startX = (Date.now() / 25 * campoEletrico) % 80;
        if (startX < 0) startX += 80;

        for (let y = wireTop + 30; y < wireBottom; y += 45) {
            for (let x = startX - 80; x < canvas.width + 80; x += 80) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + dir * arrowLen, y);
                ctx.lineTo(x + dir * (arrowLen - headSize), y - headSize);
                ctx.moveTo(x + dir * arrowLen, y);
                ctx.lineTo(x + dir * (arrowLen - headSize), y + headSize);
                ctx.stroke();
            }
        }
    }
}

// =============================================================================
// 5. ATUALIZAÇÃO DA FÍSICA E TELEMETRIA (.sim-readout)
// =============================================================================
function updateFisica(dtFactor = 1.0) {
    for (let n of nucleos) {
        n.update(dtFactor);
    }
    for (let e of eletrons) {
        e.update(nucleos, dtFactor);
    }

    // Gerenciamento da trajetória do Elétron Traçador
    if (showTracer && eletrons.length > 0) {
        const tracer = eletrons[0];
        tracerTrail.push({ x: tracer.x, y: tracer.y });
        if (tracerTrail.length > maxTracerPoints) {
            tracerTrail.shift();
        }
    }

    // Cálculo da taxa de colisões por segundo
    const now = performance.now();
    if (now - ultimoTempoColisao >= 500) {
        colisoesPorSegundo = Math.round(colisoesContador * 1000 / (now - ultimoTempoColisao));
        colisoesContador = 0;
        ultimoTempoColisao = now;

        if (readoutColRate) {
            readoutColRate.textContent = `${colisoesPorSegundo} col/s`;
        }
    }
}

function updateHUD() {
    if (eletrons.length === 0) return;

    let sumVx = 0;
    let sumV = 0;
    for (let e of eletrons) {
        sumVx += e.vx;
        sumV += Math.hypot(e.vx, e.vy);
    }

    const vd = sumVx / eletrons.length;
    const vth = sumV / eletrons.length;

    if (readoutVd) {
        const sign = vd >= 0 ? '+' : '';
        readoutVd.textContent = `v_d = ${sign}${vd.toFixed(2)}`;
    }
    if (plotValorVd) {
        const sign = vd >= 0 ? '+' : '';
        plotValorVd.textContent = `${sign}${vd.toFixed(2)} px/f`;
    }
    if (readoutVth) {
        readoutVth.textContent = `v_th = ${vth.toFixed(2)}`;
    }
    if (readoutColRate && !isRunning && colisoesPorSegundo === 0) {
        readoutColRate.textContent = '0 col/s';
    }
    if (footerSimInfo) {
        const sign = vd >= 0 ? '+' : '';
        footerSimInfo.textContent = `v_d = ${sign}${vd.toFixed(2)} px/s`;
    }
    return vd;
}

// =============================================================================
// 6. RENDERIZAÇÃO DA CENA (PRESENTATION PASS)
// =============================================================================
function draw() {
    desenharFundo();

    // 1. Desenha núcleos da rede cristalina
    for (let n of nucleos) {
        n.draw(ctx);
    }

    // 2. Desenha rastro contínuo do elétron traçador
    if (showTracer && tracerTrail.length > 1) {
        ctx.lineWidth = 2;
        for (let i = 1; i < tracerTrail.length; i++) {
            const p1 = tracerTrail[i - 1];
            const p2 = tracerTrail[i];
            // Se cruzou a borda periódica de X, não traça linha cruzando a tela inteira
            if (Math.abs(p2.x - p1.x) > canvas.width / 2) continue;

            const alpha = (i / tracerTrail.length) * 0.8;
            ctx.strokeStyle = `rgba(250, 204, 21, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }

    // 3. Desenha elétrons de condução
    for (let i = 0; i < eletrons.length; i++) {
        eletrons[i].draw(ctx, showTracer && i === 0);
    }
}

const desenharCena = draw;

// =============================================================================
// 7. LOOP PRINCIPAL DE ANIMAÇÃO COM DESACOPLAMENTO TEMPORAL
// =============================================================================
function loop() {
    requestAnimationFrame(loop);

    // Pausa a execução/renderização quando a aba estiver oculta para economia de recursos
    if (document.hidden) return;

    if (isRunning) {
        simTime += (1 / 60) * simSpeed;
        updateFisica(simSpeed);
    }
    const vd = updateHUD();
    if (plotVd && isRunning) {
        plotVd.push(vd, simTime);
    }
    draw();
}

// =============================================================================
// 8. REDIMENSIONAMENTO DO CANVAS FULL-SCREEN
// =============================================================================
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);

    updateWireGeometry();
    gerarRede();

    // Reposiciona elétrons que ficaram fora do novo limite do fio
    for (let e of eletrons) {
        if (e.y < wireTop + 10 || e.y > wireBottom - 10) {
            e.y = wireTop + 10 + Math.random() * (wireHeight - 20);
        }
        if (e.x > canvas.width) {
            e.x = Math.random() * canvas.width;
        }
    }
}

// =============================================================================
// 9. INICIALIZAÇÃO DE COMPONENTES E CONTROLADORES DO DESIGN SYSTEM
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Converte imagens de ícones SVG em tags SVG inline nativas
    inlineSVGImages();

    // 2. Renderização de fórmulas matemáticas KaTeX
    initKaTeXAutoRender();

    // 3. Inicializa o Modal de Instruções Iniciais (Guia Rápido)
    initOnboardingModal('#modal-onboarding', { triggerSelector: '#btn-open-onboarding' });

    // 4. Inicializa o Modo Foco Desktop (Recolhimento Lateral com atalho 'F')
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => {
            resizeCanvas();
            draw();
        }
    });

    // Barra flutuante de contexto para Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // 5. Inicializa o Bottom Sheet Responsivo para Mobile (<= 900px)
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // 6. Inicializa o Modal Teórico com KaTeX
    const theoryModal = initModal('#modal-teoria');
    document.getElementById('btn-open-theory-modal')?.addEventListener('click', () => {
        theoryModal?.open();
    });

    // 7. Navegação entre Abas via Design System
    initTabs();

    // 8. Controle de Play / Pause na Barra Flutuante de Transporte
    playControl = initToggleButton('#btn-play-sim', (active) => {
        isRunning = active;
        if (footerStatusText) {
            footerStatusText.textContent = active ? 'Simulação Ativa' : 'Simulação Pausada';
        }
        if (footerStatusBadge) {
            footerStatusBadge.classList.toggle('idle', !active);
        }
        if (headerStatusBadge) {
            headerStatusBadge.classList.toggle('idle', !active);
            headerStatusBadge.innerHTML = active
                ? '<span class="status-dot"></span><span>Ativo</span>'
                : '<span class="status-dot"></span><span>Pausado</span>';
        }
    });

    // 9. Botão de Avançar 1 Passo (Δt)
    if (btnStepSim) {
        btnStepSim.addEventListener('click', () => {
            if (isRunning && playControl) {
                playControl.setState(0);
            }
            simTime += (1 / 60) * simSpeed;
            updateFisica(1.0);
            const vd = updateHUD();
            if (plotVd) {
                plotVd.push(vd, simTime);
            }
            draw();
        });
    }

    // 10. Botão de Reset
    if (btnResetSim) {
        btnResetSim.addEventListener('click', () => {
            inicializarEletrons();
            colisoesContador = 0;
            colisoesPorSegundo = 0;
            simTime = 0.0;
            if (plotVd) {
                plotVd.clear();
            }
            updateHUD();
            draw();
        });
    }

    // 11. Botão Cíclico de Velocidade na Barra Flutuante de Transporte [0.5, 1.0, 2.0, 5.0]×
    if (btnSpeedCycle) {
        btnSpeedCycle.addEventListener('click', () => {
            const currentIdx = speedCycleSteps.indexOf(simSpeed);
            const nextSpeed = speedCycleSteps[(currentIdx + 1) % speedCycleSteps.length];
            simSpeed = nextSpeed;
            btnSpeedCycle.dataset.speed = nextSpeed.toFixed(1);
            btnSpeedCycle.textContent = `${nextSpeed.toFixed(1)}×`;
        });
    }

    // 12. Controle Segmentado de Sentido do Campo Elétrico
    dirCampoBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dirCampoBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            direcaoCampo = parseInt(btn.getAttribute('data-dir'), 10);
            atualizarCampo();
            draw();
        });
    });

    // 13. Dual Slider: Intensidade do Campo Elétrico
    syncDualSlider('#slider-intensidade', '#numIntensidade', (val) => {
        intensidadeCampo = val;
        atualizarCampo();
        draw();
    });

    // 14. Dual Slider: Temperatura (Agitação Térmica)
    syncDualSlider('#slider-temperatura', '#numTemperatura', (val) => {
        temperatura = val;
        draw();
    });

    // 15. Dual Slider: Quantidade de Elétrons
    syncDualSlider('#slider-eletrons', '#numEletronsInput', (val) => {
        numEletrons = Math.round(val);
        ajustarQuantidadeEletrons();
        updateHUD();
        draw();
    });

    // 16. Seletor de Tipo de Rede Cristalina
    if (selectRede) {
        selectRede.addEventListener('change', (e) => {
            tipoRede = e.target.value;
            gerarRede();
            draw();
        });
    }

    // 17. Botão Zerar Velocidades Térmicas
    if (btnZerar) {
        btnZerar.addEventListener('click', () => {
            zerarVelocidades();
            updateHUD();
            draw();
        });
    }

    // 18. Botão Alternar Elétron Traçador
    if (btnToggleTracer) {
        btnToggleTracer.addEventListener('click', () => {
            showTracer = !showTracer;
            btnToggleTracer.classList.toggle('active', showTracer);
            tracerTrail = [];
            draw();
        });
    }

    // 19. Redimensionamento Dinâmico Reativo
    window.addEventListener('resize', () => {
        resizeCanvas();
        draw();
    });
    if (window.ResizeObserver && canvas && canvas.parentElement) {
        new ResizeObserver(() => {
            resizeCanvas();
            draw();
        }).observe(canvas.parentElement);
    }

    // 20. Inicialização do Mini-Gráfico RealtimePlot para Velocidade de Deriva vd
    const canvasPlotVd = document.getElementById('canvas-plot-vd');
    if (canvasPlotVd) {
        plotVd = new RealtimePlot(canvasPlotVd, {
            maxPoints: 100,
            minVal: -1.0,
            maxVal: 1.0,
            autoScale: true,
            minSpan: 0.2,
            maxLabelSelector: '#plot-vd-max-label',
            minLabelSelector: '#plot-vd-min-label',
            color: '#38bdf8',
            title: 'Velocidade de Deriva $\\langle v_d(t) \\rangle$',
            unit: ' px/f'
        });
    }

    // 21. Inicialização e Início do Loop
    resizeCanvas();
    inicializarEletrons();
    atualizarCampo();
    updateHUD();
    draw();
    requestAnimationFrame(loop);
});
