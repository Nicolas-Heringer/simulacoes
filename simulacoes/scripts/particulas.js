// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Interação de Partículas por Ondas Retardadas (Funções de Green & Dinâmica Molecular)
// Descrição: Simulação de física molecular com interações mediadas por frentes de onda,
//            potenciais de Lennard-Jones/Coulomb, termostato e telemetria gráfica.
// Arquivo: scripts/particulas.js (ES Module com suporte ao Design System 2.0)
// =============================================================================

import {
    initToggleButton,
    syncDualSlider,
    RealtimePlot,
    initSidebarCollapse,
    initBottomSheet,
    initModal,
    inlineSVGImages,
    initTabs,
    initFocusMirrorToolbar,
    initKaTeXAutoRender
} from './sim-ui.js';

// =============================================================================
// 1. ESTADO GLOBAL E CONFIGURAÇÕES
// =============================================================================
const canvas = document.getElementById('myCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let isRunning = false;     // Inicia pausada por padrão
let simSpeed = 1.0;
let simTime = 0.0;
let tipoDeInteracao = 'coulomb';
let interactionEnabled = true;
let TEMP_LIMIT = 0.10;
let c = 2.0;               // Velocidade de propagação da onda
let attenuation = 0.09;    // Taxa de acoplamento do termostato
let template = 'none';     // Inicia vazia (sem partículas)
let epsilonCoulomb = 0.10; // Constante de acoplamento da interação coulombiana retardada

let particles = [];
let circulos = [];
const waveCache = new Map();

let playControl = null;
let plotEnergia = null;
let plotTemp = null;


// =============================================================================
// 2. ESTRATÉGIAS DE CÁLCULO DE INTERAÇÃO & FORÇAS
// =============================================================================
const calculadoresDeInteracao = {
    lennardJones(particle, wave, dx, dy, distance, distSq, force) {
        const dist6 = distSq * distSq * distSq;
        const fx = (0.1 * (dx / distance) - 0.1 * (dx / dist6)) * force;
        const fy = (0.1 * (dy / distance) - 0.1 * (dy / dist6)) * force;
        return { fx, fy };
    },
    ambos(particle, wave, dx, dy, distance, distSq, force) {
        return calculadoresDeInteracao.lennardJones(particle, wave, dx, dy, distance, distSq, force);
    },
    atracao(particle, wave, dx, dy, distance, distSq, force) {
        const fx = 0.1 * (dx / distance) * force;
        const fy = 0.1 * (dy / distance) * force;
        return { fx, fy };
    },
    repulsao(particle, wave, dx, dy, distance, distSq, force) {
        const fx = 0.1 * (dx / distance) * (-force);
        const fy = 0.1 * (dy / distance) * (-force);
        return { fx, fy };
    },
    coulomb(particle, wave, dx, dy, distance, distSq, force) {
        const qProduct = particle.charge * wave.charge;
        const dist6 = distSq * distSq * distSq;
        const factorCoulomb = -qProduct * epsilonCoulomb;
        const fx = (factorCoulomb * (dx / distance) - 0.01 * (dx / dist6)) * force;
        const fy = (factorCoulomb * (dy / distance) - 0.01 * (dy / dist6)) * force;
        return { fx, fy };
    }
};

// =============================================================================
// 3. CLASSE PARTICLE & GERADORES DE TEMPLATE
// =============================================================================
class Particle {
    static nextId = 0;

    constructor(x, y, radius, color, velocityX, velocityY, charge = 0, mass = 1) {
        this.id = Particle.nextId++;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.mass = mass;
        this.charge = charge;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.waveTimer = 0;
        this.baseWaveInterval = 1;
        this.waveInterval = 1;
        this.gamma = null;
    }

    update(canvasEl, waves, interaction) {
        if (interaction === true) {
            // A força causal só atua no instante exato em que a crista da onda retardada atinge a partícula
            const shellThickness = Math.max(c * simSpeed * 0.9, 3.5);

            waves.forEach(wave => {
                if (wave.emissorId !== this.id) {
                    const dxPx = wave.x - this.x;
                    const dyPx = wave.y - this.y;
                    const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

                    // Gatilho Causal: Ocorre somente quando o raio da onda se iguala à distância espacial
                    if (Math.abs(distPx - wave.raio) <= shellThickness) {
                        const distance = distPx / 100;
                        const dx = dxPx / 100;
                        const dy = dyPx / 100;
                        const distSq = distance * distance;
                        const force = 0.05;
                        const calcular = calculadoresDeInteracao[tipoDeInteracao];
                        if (calcular) {
                            const { fx, fy } = calcular(this, wave, dx, dy, distance, distSq, force);
                            this.velocityX += (fx / this.mass) * simSpeed;
                            this.velocityY += (fy / this.mass) * simSpeed;
                        }
                    }
                }
            });
        }

        // Atualiza posição
        this.x += this.velocityX * simSpeed;
        this.y += this.velocityY * simSpeed;

        // Colisão elástica com as bordas
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.velocityX *= -1;
        } else if (this.x + this.radius > canvasEl.width) {
            this.x = canvasEl.width - this.radius;
            this.velocityX *= -1;
        }

        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.velocityY *= -1;
        } else if (this.y + this.radius > canvasEl.height) {
            this.y = canvasEl.height - this.radius;
            this.velocityY *= -1;
        }

        // Temporizador de emissão de ondas esféricas
        this.waveTimer += simSpeed;
        if (this.waveTimer >= this.waveInterval) {
            this.waveTimer = 0;
            const novaOnda = new Circulo(this.x, this.y, this.charge, this.id);
            waves.push(novaOnda);
        }
    }

    draw(ctx2d) {
        ctx2d.beginPath();
        ctx2d.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx2d.fillStyle = this.color;
        ctx2d.shadowColor = this.color;
        ctx2d.shadowBlur = 6;
        ctx2d.fill();
        ctx2d.shadowBlur = 0;
        ctx2d.closePath();
    }

    reduceSpeed(factor) {
        this.velocityX *= (1 - factor);
        this.velocityY *= (1 - factor);
    }

    increaseSpeed(factor) {
        this.velocityX *= (1 + factor);
        this.velocityY *= (1 + factor);
    }
}

const positionGenerators = {
    singleStatic: {
        num: () => 1,
        generate(cEl) {
            return { x: cEl.width / 2, y: cEl.height / 2 };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 6,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    singleMoving: {
        num: () => 1,
        generate(cEl) {
            return { x: cEl.width / 2, y: cEl.height / 2 };
        },
        velocity: () => {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 1.3;
            return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        },
        radius: () => 6,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    livre: {
        num: () => 1,
        generate(cEl) {
            return { x: cEl.width / 2, y: cEl.height / 2 };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 6,
        color: () => '#facc15',
        mass: () => 1,
        charge: () => 0,
    },
    double: {
        num: () => 2,
        generate(cEl, index) {
            const dist = cEl.width / 4;
            const x = cEl.width / 2 + (index === 0 ? -dist : dist);
            const y = cEl.height / 2;
            return { x, y };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 6,
        color: (type, index) => index === 0 ? '#fb923c' : '#38bdf8',
        mass: () => 1,
        charge: (type, index) => index === 0 ? 1 : -1,
    },
    doubleMoving: {
        num: () => 2,
        generate(cEl, index) {
            const dist = cEl.width / 12; // Posicionamento mais próximo para rápida interação e dinâmica orbital
            const x = cEl.width / 2 + (index === 0 ? -dist : dist);
            const y = cEl.height / 2;
            return { x, y };
        },
        // Esquerda (index 0) move para baixo (+y), Direita (index 1) move para cima (-y)
        velocity: (index) => ({ x: 0, y: index === 0 ? 1.0 : -1.0 }),
        radius: () => 6,
        color: (type, index) => index === 0 ? '#fb923c' : '#38bdf8',
        mass: () => 1,
        charge: (type, index) => index === 0 ? 1 : -1,
    },
    many: {
        num: () => 3,
        generate(cEl, index) {
            const dist = cEl.width / 3;
            const x = cEl.width / 2 - dist + dist * index;
            const y = cEl.height / 2;
            return { x, y };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 5,
        color: (type, index) => ['#facc15', '#38bdf8', '#22c55e'][index % 3],
        mass: () => 1,
        charge: (type, index) => index === 1 ? -1 : 1,
    },
    circular: {
        num: () => 12,
        generate(cEl, index, total) {
            const centerX = cEl.width / 2;
            const centerY = cEl.height / 2;
            const radius = Math.min(cEl.width, cEl.height) / 3.2;
            const angle = (index / total) * 2 * Math.PI;
            return {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
            };
        },
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 4,
        color: () => '#38bdf8',
        mass: () => 1,
        charge: () => 0,
    },
    grid: {
        num: () => 36,
        generate(cEl, index, total) {
            const cols = Math.ceil(Math.sqrt(total));
            const rows = Math.ceil(total / cols);
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);
            const spacingX = cEl.width / (cols + 1);
            const spacingY = cEl.height / (rows + 1);
            return {
                x: (gridX + 1) * spacingX,
                y: (gridY + 1) * spacingY,
            };
        },
        velocity: () => ({ x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4 }),
        radius: () => 4,
        color: () => '#22c55e',
        mass: () => 2,
        charge: () => 0,
    },
    NaCl: {
        num: () => 64,
        generate(cEl, index, total) {
            const cols = 8;
            const rows = 8;
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);
            const spacingX = cEl.width / (cols + 1);
            const spacingY = cEl.height / (rows + 1);
            return {
                x: (gridX + 1) * spacingX,
                y: (gridY + 1) * spacingY,
                type: (gridX + gridY) % 2 === 0 ? 'Na' : 'Cl',
            };
        },
        velocity: () => ({ x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.2 }),
        radius: (type) => (type === 'Na' ? 3.5 : 6),
        color: (type) => (type === 'Na' ? '#fb923c' : '#38bdf8'), // Laranja Na+, Ciano Cl-
        mass: (type) => (type === 'Na' ? 2 : 4),
        charge: (type) => (type === 'Na' ? 1 : -1),
    },
    none: {
        num: () => 0,
        generate: () => ({ x: 0, y: 0 }),
        velocity: () => ({ x: 0, y: 0 }),
        radius: () => 0,
        color: () => '',
        mass: () => 1,
        charge: () => 0
    }
};

function createParticles(canvasEl, templateName = 'NaCl') {
    const generator = positionGenerators[templateName] || positionGenerators.NaCl;
    const particleCount = generator.num();
    Particle.nextId = 0;

    return Array.from({ length: particleCount }, (_, i) => {
        const { x, y, type } = generator.generate(canvasEl, i, particleCount);
        const { x: vx, y: vy } = generator.velocity(i);
        const mass = generator.mass ? generator.mass(type, i) : 1;
        const charge = generator.charge ? generator.charge(type, i) : 0;
        const radius = generator.radius ? generator.radius(type, i) : 4;
        const color = generator.color ? generator.color(type, i) : '#facc15';
        return new Particle(x, y, radius, color, vx, vy, charge, mass);
    });
}

// =============================================================================
// 4. CACHE DE SPRITES E CLASSE CIRCULO (PROPAGAÇÃO DE ONDAS)
// =============================================================================
function criarWaveSpritePorRaio(charge, raio) {
    const r = Math.max(1, Math.round(raio));
    const padding = 2;
    const size = (r + padding) * 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    const offCtx = offCanvas.getContext('2d');

    const center = size / 2;
    const innerRadius = Math.max(0, r - r * 0.25);
    const outerRadius = r + r * 0.25;

    const grad = offCtx.createRadialGradient(
        center, center, innerRadius,
        center, center, outerRadius
    );

    let rgb;
    if (charge > 0) {
        rgb = '251, 146, 60';   // Laranja (Na+)
    } else if (charge < 0) {
        rgb = '56, 189, 248';   // Ciano (Cl-)
    } else {
        rgb = '250, 204, 21';   // Amarelo solar
    }

    grad.addColorStop(0, `rgba(${rgb}, 0.8)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);

    offCtx.beginPath();
    offCtx.arc(center, center, r, 0, Math.PI * 2);
    offCtx.lineWidth = 1;
    offCtx.strokeStyle = grad;
    offCtx.stroke();
    offCtx.closePath();

    return offCanvas;
}

function getWaveSprite(charge, raio) {
    const rKey = Math.round(raio);
    const key = `${charge}_${rKey}`;
    let sprite = waveCache.get(key);
    if (!sprite) {
        sprite = criarWaveSpritePorRaio(charge, rKey);
        waveCache.set(key, sprite);
    }
    return sprite;
}

class Circulo {
    constructor(x, y, charge = 0, emissorId = null) {
        this.x = x;
        this.y = y;
        this.charge = charge;
        this.emissorId = emissorId;
        this.raio = 0;
        this.aSerRemovido = false;
    }

    propagaCampo(speedC) {
        this.raio += speedC * simSpeed;
        if (canvas && this.raio > Math.hypot(canvas.width, canvas.height)) {
            this.aSerRemovido = true;
        }
    }

    static intensidade(r) {
        // Lei do inverso do quadrado para a intensidade da frente de onda: I(r) = 1 / (1 + (r / r0)^2)
        const r0 = 85; // Escala característica de decaimento em pixels
        return 1.0 / (1.0 + (r / r0) ** 2);
    }

    mostra(ctx2d) {
        if (this.raio <= 0) return;
        const intens = Circulo.intensidade(this.raio);
        if (intens <= 0.005) return;

        let rgb;
        if (this.charge > 0) {
            rgb = '251, 146, 60';   // Laranja (Na+)
        } else if (this.charge < 0) {
            rgb = '56, 189, 248';   // Ciano (Cl-)
        } else {
            rgb = '250, 204, 21';   // Amarelo solar
        }

        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(this.x, this.y, this.raio, 0, Math.PI * 2);
        ctx2d.lineWidth = 1.3;
        ctx2d.strokeStyle = `rgba(${rgb}, ${intens})`;
        ctx2d.stroke();
        ctx2d.closePath();
        ctx2d.restore();
    }
}

// =============================================================================
// 5. CÁLCULOS TERMODINÂMICOS & CONTROLES DE TELA
// =============================================================================
function calcularEnergiaCinetica(particulasList) {
    let energiaTotal = 0;
    particulasList.forEach(p => {
        const vSq = p.velocityX * p.velocityX + p.velocityY * p.velocityY;
        energiaTotal += 0.5 * p.mass * vSq;
    });
    return energiaTotal;
}

function calcularTemperatura(particulasList) {
    if (particulasList.length === 0) return 0;
    const energiaCineticaTotal = calcularEnergiaCinetica(particulasList);
    return (2 * energiaCineticaTotal) / (3 * particulasList.length);
}

function calcularVrms(particulasList) {
    if (particulasList.length === 0) return 0;
    let sumVSq = 0;
    particulasList.forEach(p => {
        sumVSq += p.velocityX * p.velocityX + p.velocityY * p.velocityY;
    });
    return Math.sqrt(sumVSq / particulasList.length);
}

function resizeCanvas() {
    if (!canvas) return;
    const area = canvas.parentElement;
    if (!area) return;
    const w = area.clientWidth;
    const h = area.clientHeight;
    if (w === 0 || h === 0) return;

    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

function updateStatusBadges() {
    const headerBadge = document.getElementById('header-status-badge');
    const footerBadge = document.getElementById('footer-status-badge');
    const footerText = document.getElementById('footer-status-text');

    if (particles.length === 0) {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Aguardando Preset</span>';
        if (footerText) footerText.textContent = 'Aguardando Preset';
        if (footerBadge) footerBadge.classList.remove('badge-accent');
    } else if (isRunning) {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Executando</span>';
        if (footerText) footerText.textContent = 'Simulação Ativa';
        if (footerBadge) footerBadge.classList.add('badge-accent');
    } else {
        if (headerBadge) headerBadge.innerHTML = '<span class="status-dot"></span><span>Pausado (Pronto)</span>';
        if (footerText) footerText.textContent = 'Pronto para Executar';
        if (footerBadge) footerBadge.classList.add('badge-accent');
    }
}

function reiniciarSistema(novoTemplate = 'none') {
    circulos = [];
    particles = [];
    Particle.nextId = 0;
    waveCache.clear();
    template = novoTemplate;
    simTime = 0.0;

    if (canvas && template !== 'none') {
        particles = createParticles(canvas, template);
    }

    const footerTimer = document.getElementById('footer-sim-timer');
    if (footerTimer) footerTimer.textContent = 't = 0.00s';

    updateStatusBadges();
}

// =============================================================================
// 6. SETUP DE CONTROLADORES & EVENTOS (DESIGN SYSTEM 2.0)
// =============================================================================
function setupEventListeners() {
    // --- MODO FOCO (DESKTOP) ---
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => {
            resizeCanvas();
            if (plotEnergia) plotEnergia.resize();
            if (plotTemp) plotTemp.resize();
        }
    });

    // --- BOTTOM SHEET MOBILE (<= 900PX) ---
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // --- NAVEGAÇÃO ENTRE ABAS ---
    initTabs('.controls-panel', (tabId) => {
        if (tabId === 'panel-tab-telemetry') {
            setTimeout(() => {
                if (plotEnergia) plotEnergia.resize();
                if (plotTemp) plotTemp.resize();
            }, 50);
        }
    });

    // --- BARRA DE CONTEXTO EM MODO FOCO ---
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // --- BARRA DE TRANSPORTE ---
    playControl = initToggleButton('#btn-play-sim', (active) => {
        if (particles.length === 0 && active) {
            const defaultBtn = document.getElementById('preset-single-static');
            if (defaultBtn) {
                document.querySelectorAll('.control-grid-2x2 .btn-preset').forEach(b => b.classList.remove('active'));
                defaultBtn.classList.add('active');
            }
            reiniciarSistema('singleStatic');
        }

        isRunning = active;
        updateStatusBadges();
    });

    // Botão Passo Temporal (Δt)
    const btnStep = document.getElementById('btn-step-sim');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            if (particles.length === 0) {
                reiniciarSistema('singleStatic');
                const defaultBtn = document.getElementById('preset-single-static');
                if (defaultBtn) defaultBtn.classList.add('active');
            }
            if (isRunning && playControl) playControl.setState(0);
            isRunning = false;
            simTime += 0.05 * simSpeed;
            passoSimulacao();
            updateStatusBadges();
        });
    }

    // Botões de Reset: Reiniciam o preset ativo para o estado inicial sem perder a seleção
    const resetAction = () => {
        if (isRunning && playControl) playControl.setState(0);
        isRunning = false;
        if (template && template !== 'none') {
            reiniciarSistema(template);
        } else {
            reiniciarSistema('none');
        }
    };

    const btnReset = document.getElementById('btn-reset-sim');
    const btnQuickReset = document.getElementById('btn-quick-reset');
    if (btnReset) btnReset.addEventListener('click', resetAction);
    if (btnQuickReset) btnQuickReset.addEventListener('click', resetAction);

    // Seletor de Velocidade Temporal
    document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sim-speed-pills .speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            simSpeed = parseFloat(btn.dataset.speed || '1.0');
        });
    });

    // --- PRESETS DE CONFIGURAÇÃO DE PARTÍCULAS ---
    const presetBtns = document.querySelectorAll('.control-grid-2x2 .btn-preset');

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tmpl = btn.dataset.template;
            if (tmpl) {
                reiniciarSistema(tmpl);
            }
        });
    });


    // --- SWITCH DE INTERAÇÃO & TIPO DE POTENCIAL ---
    const switchInteracao = document.getElementById('switch-interacao');
    if (switchInteracao) {
        switchInteracao.addEventListener('change', (e) => {
            interactionEnabled = e.target.checked;
        });
    }

    const selectPotencial = document.getElementById('selector-de-tipo-de-interacao');
    if (selectPotencial) {
        selectPotencial.addEventListener('change', (e) => {
            tipoDeInteracao = e.target.value;
        });
    }

    // --- SLIDERS SINCRONIZADOS (DUAL-INPUT) ---
    syncDualSlider('#slider-temp', '#num-temp', (val) => {
        TEMP_LIMIT = val;
    });

    syncDualSlider('#slider-wave-speed', '#num-wave-speed', (val) => {
        c = val;
        waveCache.clear();
    });

    syncDualSlider('#slider-attenuation', '#num-attenuation', (val) => {
        attenuation = val;
    });

    syncDualSlider('#slider-epsilon', '#num-epsilon', (val) => {
        epsilonCoulomb = val;
    });

    // --- MODAL DE TEORIA ---
    const theoryModal = initModal('#modal-theory-particulas');
    const btnOpenTheory = document.getElementById('btn-abrir-modal-teoria');
    if (btnOpenTheory && theoryModal) {
        btnOpenTheory.addEventListener('click', () => {
            theoryModal.open();
        });
    }

    // --- INTERAÇÃO COM O CANVAS (IMPULSO VIA CLIQUE / ARRASTE / TOQUE) ---
    if (canvas) {
        let isPointerDown = false;
        canvas.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            aplicarImpulsoCursor(e);
        });

        window.addEventListener('pointerup', () => {
            isPointerDown = false;
        });

        canvas.addEventListener('pointermove', (e) => {
            if (isPointerDown) aplicarImpulsoCursor(e);
        });
    }
}

function aplicarImpulsoCursor(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    particles.forEach(p => {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 1) {
            const force = (120 - dist) / 120 * 0.8;
            p.velocityX += (dx / dist) * force;
            p.velocityY += (dy / dist) * force;
        }
    });
}

function passoSimulacao() {
    if (!canvas) return;

    for (let i = circulos.length - 1; i >= 0; i--) {
        const circulo = circulos[i];
        circulo.propagaCampo(c);
        if (circulo.aSerRemovido) {
            circulos[i] = circulos[circulos.length - 1];
            circulos.pop();
        }
    }

    particles.forEach(particle => {
        particle.update(canvas, circulos, interactionEnabled);
    });

    const temperatura = calcularTemperatura(particles);
    if (temperatura > TEMP_LIMIT) {
        particles.forEach(p => p.reduceSpeed(attenuation));
    } else if (temperatura < TEMP_LIMIT && temperatura > 0) {
        particles.forEach(p => p.increaseSpeed(attenuation));
    }
}

// =============================================================================
// 7. LOOP DE ANIMAÇÃO PRINCIPAL
// =============================================================================
function anima() {
    requestAnimationFrame(anima);
    if (!ctx || !canvas) return;

    if (isRunning) {
        simTime += 0.016 * simSpeed;
        passoSimulacao();
    }

    // Fundo Dark Theme de Alto Contraste
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Renderiza frentes de onda esféricas
    circulos.forEach(circulo => circulo.mostra(ctx));

    // Renderiza partículas
    particles.forEach(particle => particle.draw(ctx));

    // Telemetria e Grandezas Físicas
    const energiaTotal = calcularEnergiaCinetica(particles);
    const temperatura = calcularTemperatura(particles);
    const vrms = calcularVrms(particles);

    // 1. Atualiza HUD no Canvas
    const hudPart = document.getElementById('hud-particles-count');
    const hudWaves = document.getElementById('hud-waves-count');
    const hudK = document.getElementById('hud-kinetic-energy');
    const hudT = document.getElementById('hud-temperature');

    if (hudPart) hudPart.textContent = `${particles.length}`;
    if (hudWaves) hudWaves.textContent = `${circulos.length}`;
    if (hudK) hudK.textContent = `${energiaTotal.toFixed(2)} J`;
    if (hudT) hudT.textContent = temperatura.toFixed(3);

    // 2. Atualiza Rodapé
    const footerTimer = document.getElementById('footer-sim-timer');
    if (footerTimer) footerTimer.textContent = `t = ${simTime.toFixed(2)}s`;

    // 3. Alimenta Mini-Gráficos de Telemetria
    if (plotEnergia) {
        plotEnergia.push(energiaTotal);
        const valK = document.getElementById('plot-val-k');
        if (valK) valK.textContent = `${energiaTotal.toFixed(2)} J`;
    }

    if (plotTemp) {
        plotTemp.push(temperatura);
        const valT = document.getElementById('plot-val-t');
        if (valT) valT.textContent = temperatura.toFixed(3);
    }

    // 4. Painel de Balanço Termodinâmico
    const telVrms = document.getElementById('telemetry-vrms');
    const telStatus = document.getElementById('telemetry-thermostat-status');
    const telWaves = document.getElementById('telemetry-waves-alive');

    if (telVrms) telVrms.textContent = `${vrms.toFixed(2)} px/f`;
    if (telWaves) telWaves.textContent = `${circulos.length}`;
    if (telStatus) {
        const diff = temperatura - TEMP_LIMIT;
        if (Math.abs(diff) < 0.02) {
            telStatus.textContent = 'Equilíbrio';
            telStatus.style.color = 'var(--color-emerald, #22c55e)';
        } else if (diff > 0) {
            telStatus.textContent = 'Resfriando';
            telStatus.style.color = 'var(--color-cyan, #38bdf8)';
        } else {
            telStatus.textContent = 'Aquecendo';
            telStatus.style.color = 'var(--color-yellow, #facc15)';
        }
    }
}

// =============================================================================
// 8. INICIALIZAÇÃO
// =============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    resizeCanvas();
    setupEventListeners();
    reiniciarSistema('none');

    // Inicializa os Mini-Gráficos de Telemetria
    const canvasPlotK = document.getElementById('canvas-plot-k');
    if (canvasPlotK) {
        plotEnergia = new RealtimePlot(canvasPlotK, {
            maxPoints: 80,
            minVal: 0.0,
            maxVal: 20.0
        });
    }

    const canvasPlotT = document.getElementById('canvas-plot-t');
    if (canvasPlotT) {
        plotTemp = new RealtimePlot(canvasPlotT, {
            maxPoints: 80,
            minVal: 0.0,
            maxVal: 2.0
        });
    }

    anima();
    await inlineSVGImages();
    initKaTeXAutoRender(document.body);
});