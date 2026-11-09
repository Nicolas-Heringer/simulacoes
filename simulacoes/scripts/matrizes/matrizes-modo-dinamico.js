// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-modo-dinamico.js
// Modo 4: Sistemas Dinâmicos Contínuos dx/dt = M x, Campo Vetorial e Órbitas
// =============================================================================

import { initToggleButton, eigen2x2 } from '../sim-ui.js';

export class ModoDinamico {
    /**
     * @param {PlanoCartesiano} plano
     * @param {Object} domElements
     */
    constructor(plano, domElements) {
        this.plano = plano;
        this.dom = domElements;

        // Matriz M do sistema dinâmico dx/dt = M x
        this.M = { a: 0, b: -2, c: 2, d: 0 }; // Inicialmente centro oscilador harmônico

        // Estado da simulação temporal
        this.isPlaying = false;
        this.speed = 1.0;
        this.dt = 0.02;
        this.simTime = 0.0;
        this.lastTime = 0;
        this.animRequestId = null;

        // Partículas / Sementes de trajetória
        this.seeds = [];
        this.maxTrailLength = 180;

        // Configurações visuais
        this.showVectorField = true;
        this.showTrajectories = true;
        this.showEigenAxes = true;

        this.initDOM();
    }

    initDOM() {
        const {
            dynM11, dynM12, dynM21, dynM22,
            presetDynSelect,
            btnPlayDyn, btnStepDyn, btnResetDyn, btnClearDyn,
            btnSeedCircle, btnSeedGrid,
            chkVectorField, chkShowEigenDyn,
            btnSpeedCycleDyn
        } = this.dom;

        const onInputChange = () => {
            this.M = {
                a: parseFloat(dynM11.value) || 0,
                b: parseFloat(dynM12.value) || 0,
                c: parseFloat(dynM21.value) || 0,
                d: parseFloat(dynM22.value) || 0
            };
            this.syncPresetSelectWithMatrix(this.M);
            this.updateClassification();
            this.drawDynamicScene();
        };

        [dynM11, dynM12, dynM21, dynM22].forEach(inp => {
            if (inp) inp.addEventListener('input', onInputChange);
        });

        if (presetDynSelect) {
            presetDynSelect.addEventListener('change', (e) => {
                this.applyPreset(e.target.value);
            });
        }

        // Transporte
        if (btnPlayDyn) {
            this.playToggleControl = initToggleButton(btnPlayDyn, (isActive) => {
                this.isPlaying = isActive;
                if (this.isPlaying) {
                    this.lastTime = performance.now();
                    this.loop();
                } else {
                    cancelAnimationFrame(this.animRequestId);
                }
            });
        }

        if (btnStepDyn) {
            btnStepDyn.addEventListener('click', () => {
                const wasPlaying = this.isPlaying;
                this.isPlaying = true;
                this.stepPhysics(0.05);
                this.isPlaying = wasPlaying;
                this.drawDynamicScene();
            });
        }

        if (btnResetDyn) {
            btnResetDyn.addEventListener('click', () => {
                this.resetSeeds();
                this.drawDynamicScene();
            });
        }

        if (btnClearDyn) {
            btnClearDyn.addEventListener('click', () => {
                this.seeds = [];
                this.simTime = 0.0;
                this.drawDynamicScene();
            });
        }

        if (btnSeedCircle) {
            btnSeedCircle.addEventListener('click', () => {
                this.generateCircleSeeds(16, 2.0);
                this.drawDynamicScene();
            });
        }

        if (btnSeedGrid) {
            btnSeedGrid.addEventListener('click', () => {
                this.generateGridSeeds();
                this.drawDynamicScene();
            });
        }

        if (chkVectorField) {
            chkVectorField.addEventListener('change', (e) => {
                this.showVectorField = e.target.checked;
                this.drawDynamicScene();
            });
        }

        if (chkShowEigenDyn) {
            chkShowEigenDyn.addEventListener('change', (e) => {
                this.showEigenAxes = e.target.checked;
                this.drawDynamicScene();
            });
        }

        if (btnSpeedCycleDyn) {
            const speeds = [0.5, 1.0, 2.0, 4.0];
            btnSpeedCycleDyn.addEventListener('click', () => {
                const curIdx = speeds.indexOf(this.speed);
                this.speed = speeds[(curIdx + 1) % speeds.length];
                btnSpeedCycleDyn.dataset.speed = this.speed.toFixed(1);
                btnSpeedCycleDyn.textContent = `${this.speed.toFixed(1)}×`;
            });
        }

        // Clique no canvas adiciona uma semente interativa
        this.canvasClickListener = (e) => {
            if (!this.isActive) return;
            const rect = this.plano.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const math = this.plano.toMath(mouseX, mouseY);
            this.addSeed(math.x, math.y);
            this.drawDynamicScene();
        };

        this.plano.canvas.addEventListener('click', this.canvasClickListener);
    }

    /**
     * Verifica se a matriz m coincide com algum preset de ponto fixo; caso contrário, seleciona 'custom' (Personalizado / Manual)
     */
    syncPresetSelectWithMatrix(m) {
        const { presetDynSelect } = this.dom;
        if (!presetDynSelect) return;

        const eq = (x, y) => Math.abs(x - y) < 1e-3;
        const match = (a, b, c, d) => eq(m.a, a) && eq(m.b, b) && eq(m.c, c) && eq(m.d, d);

        let detected = 'custom';
        if (match(0, -2, 2, 0)) detected = 'center';
        else if (match(1.5, 0, 0, -1.5)) detected = 'saddle';
        else if (match(-0.4, -2.5, 2.5, -0.4)) detected = 'stable-focus';
        else if (match(0.4, -2.5, 2.5, 0.4)) detected = 'unstable-focus';
        else if (match(-2.0, 0, 0, -1.0)) detected = 'stable-node';
        else if (match(1.5, 0, 0, 2.5)) detected = 'unstable-node';
        else if (match(0, 1.5, 0, 0)) detected = 'shear-flow';

        if (presetDynSelect.value !== detected) {
            presetDynSelect.value = detected;
        }
    }

    applyPreset(name) {
        const { dynM11, dynM12, dynM21, dynM22 } = this.dom;

        switch (name) {
            case 'center': // Centro (Oscilador Harmônico Conservativo)
                this.M = { a: 0, b: -2, c: 2, d: 0 };
                break;
            case 'saddle': // Sela (Hiperbólico)
                this.M = { a: 1.5, b: 0, c: 0, d: -1.5 };
                break;
            case 'stable-focus': // Espiral Atratora (Foco Estável / Amortecido)
                this.M = { a: -0.4, b: -2.5, c: 2.5, d: -0.4 };
                break;
            case 'unstable-focus': // Espiral Repulsora (Foco Instável)
                this.M = { a: 0.4, b: -2.5, c: 2.5, d: 0.4 };
                break;
            case 'stable-node': // Nó Estável (Poço Atrator)
                this.M = { a: -2.0, b: 0, c: 0, d: -1.0 };
                break;
            case 'unstable-node': // Nó Instável (Fonte Repulsora)
                this.M = { a: 1.5, b: 0, c: 0, d: 2.5 };
                break;
            case 'shear-flow': // Cisalhamento / Fluxo de Couette
                this.M = { a: 0, b: 1.5, c: 0, d: 0 };
                break;
        }

        if (dynM11) dynM11.value = this.M.a.toFixed(1);
        if (dynM12) dynM12.value = this.M.b.toFixed(1);
        if (dynM21) dynM21.value = this.M.c.toFixed(1);
        if (dynM22) dynM22.value = this.M.d.toFixed(1);

        this.updateClassification();
        this.resetSeeds();
        this.drawDynamicScene();
    }

    addSeed(x, y) {
        this.seeds.push({
            x: x,
            y: y,
            initX: x,
            initY: y,
            trail: [{ x, y }]
        });
    }

    generateCircleSeeds(count = 16, radius = 2.0) {
        this.seeds = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            this.addSeed(x, y);
        }
    }

    generateGridSeeds() {
        this.seeds = [];
        for (let x = -3; x <= 3; x += 1.5) {
            for (let y = -3; y <= 3; y += 1.5) {
                if (x === 0 && y === 0) continue;
                this.addSeed(x, y);
            }
        }
    }

    resetSeeds() {
        this.seeds.forEach(s => {
            s.x = s.initX;
            s.y = s.initY;
            s.trail = [{ x: s.initX, y: s.initY }];
        });
        this.simTime = 0.0;
    }

    /**
     * Integração contínua RK4: dx/dt = M * x
     */
    stepPhysics(dtReal) {
        const { a, b, c, d } = this.M;

        // Derivada f(x, y) = [a*x + b*y, c*x + d*y]
        const f = (x, y) => ({
            vx: a * x + b * y,
            vy: c * x + d * y
        });

        const dt = dtReal * this.speed;
        this.simTime += dt;

        this.seeds.forEach(seed => {
            const x0 = seed.x;
            const y0 = seed.y;

            // RK4
            const k1 = f(x0, y0);
            const k2 = f(x0 + 0.5 * dt * k1.vx, y0 + 0.5 * dt * k1.vy);
            const k3 = f(x0 + 0.5 * dt * k2.vx, y0 + 0.5 * dt * k2.vy);
            const k4 = f(x0 + dt * k3.vx, y0 + dt * k3.vy);

            seed.x += (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
            seed.y += (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);

            if (this.isPlaying) {
                seed.trail.push({ x: seed.x, y: seed.y });
                if (seed.trail.length > this.maxTrailLength) {
                    seed.trail.shift();
                }
            }
        });
    }

    loop() {
        if (!this.isPlaying) return;
        this.animRequestId = requestAnimationFrame(() => this.loop());
        if (document.hidden) return;

        const now = performance.now();
        const delta = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        this.stepPhysics(delta);
        this.drawDynamicScene();
    }

    drawDynamicScene() {
        const plano = this.plano;
        const ctx = plano.ctx;

        ctx.clearRect(0, 0, plano.width, plano.height);

        // Grade de referência
        plano.drawBackgroundGrid();

        // Campo vetorial de velocidades
        if (this.showVectorField) {
            this.drawVectorField();
        }

        // Eixos de autovetores invariantes reais
        if (this.showEigenAxes && plano.currentAnalysis?.isReal) {
            plano.drawEigenAxes();
        }

        // Trajetórias e partículas
        if (this.showTrajectories) {
            this.drawTrajectories();
        }

        // Ponto fixo de origem (0, 0)
        plano.drawOriginMarker();
    }

    /**
     * Renderiza a malha do campo vetorial de velocidades v(x) = M*x
     */
    drawVectorField() {
        const plano = this.plano;
        const ctx = plano.ctx;
        const { a, b, c, d } = this.M;

        const step = 1.2;
        const { maxViewRadius } = plano.getDynamicGridBounds({ x: 1, y: 0 }, { x: 0, y: 1 });
        const R = Math.floor(maxViewRadius / step) * step;

        ctx.save();
        for (let x = -R; x <= R; x += step) {
            for (let y = -R; y <= R; y += step) {
                if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) continue;

                const vx = a * x + b * y;
                const vy = c * x + d * y;
                const mag = Math.hypot(vx, vy);
                if (mag < 1e-4) continue;

                // Normaliza e escala a seta
                const arrowLen = Math.min(plano.scale * 0.45, 18);
                const dirX = vx / mag;
                const dirY = vy / mag;

                const pStart = plano.toScreen(x, y);
                const pEnd = {
                    x: pStart.x + dirX * arrowLen,
                    y: pStart.y - dirY * arrowLen
                };

                // Opacidade baseada na magnitude relativa
                const alpha = Math.min(0.65, Math.max(0.15, mag * 0.15));
                const color = `rgba(56, 189, 248, ${alpha})`;

                plano.drawArrow(pStart, pEnd, color, 1.2);
            }
        }
        ctx.restore();
    }

    /**
     * Renderiza as órbitas e o rastro contínuo das sementes
     */
    drawTrajectories() {
        const plano = this.plano;
        const ctx = plano.ctx;

        this.seeds.forEach((seed, idx) => {
            const trail = seed.trail;
            if (trail.length < 2) return;

            // Rastro esmaecido
            ctx.save();
            ctx.beginPath();
            trail.forEach((pt, k) => {
                const scr = plano.toScreen(pt.x, pt.y);
                if (k === 0) ctx.moveTo(scr.x, scr.y);
                else ctx.lineTo(scr.x, scr.y);
            });

            // Cor da primeira semente (destaque amarelo) vs demais (ciano/roxo)
            const strokeColor = idx === 0 ? 'rgba(250, 204, 21, 0.75)' : 'rgba(168, 85, 247, 0.55)';
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = idx === 0 ? 2.2 : 1.5;
            ctx.stroke();

            // Ponto atual da semente (cabeça da trajetória)
            const head = plano.toScreen(seed.x, seed.y);
            ctx.beginPath();
            ctx.arc(head.x, head.y, idx === 0 ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle = idx === 0 ? '#facc15' : '#a855f7';
            ctx.fill();
            ctx.restore();
        });
    }

    /**
     * Classifica o ponto de equilíbrio linear na origem (traço, determinante, discriminante)
     */
    updateClassification() {
        const { a, b, c, d } = this.M;
        const tr = a + d;
        const det = a * d - b * c;
        const disc = tr * tr - 4 * det;

        const analysis = eigen2x2(this.M);
        this.plano.currentAnalysis = analysis;

        let classification = '';
        let toneClass = 'tone-accent';
        let stability = '';

        if (det < -1e-4) {
            classification = 'Ponto de Sela (Instável)';
            toneClass = 'highlight-rose';
        } else if (Math.abs(det) < 1e-4) {
            classification = 'Degenerado (Neutro)';
            toneClass = 'highlight-purple';
        } else {
            // det > 0
            if (disc < -1e-4) {
                if (Math.abs(tr) < 1e-4) {
                    classification = 'Centro (Estável)';
                    toneClass = 'highlight-cyan';
                } else if (tr < 0) {
                    classification = 'Foco Atrator (Estável)';
                    toneClass = 'highlight-green';
                } else {
                    classification = 'Foco Repulsor (Instável)';
                    toneClass = 'highlight-rose';
                }
            } else {
                if (tr < 0) {
                    classification = 'Nó Atrator (Estável)';
                    toneClass = 'highlight-green';
                } else if (tr > 0) {
                    classification = 'Nó Repulsor (Instável)';
                    toneClass = 'highlight-rose';
                } else {
                    classification = 'Ponto Fixo Neutro';
                    toneClass = 'highlight-cyan';
                }
            }
        }

        const elClassif = document.getElementById('dyn-readout-type');
        const elEigen = document.getElementById('dyn-readout-eigen');
        const elInvariants = document.getElementById('dyn-readout-invariants');

        if (elClassif) {
            elClassif.textContent = classification;
            elClassif.className = `sim-readout-value readout-value ${toneClass}`;
        }

        if (elEigen) {
            if (analysis.isReal) {
                const [l1, l2] = analysis.eigenvalues;
                elEigen.textContent = `${l1.toFixed(2)}, ${l2.toFixed(2)}`;
            } else {
                const ev = analysis.eigenvalues[0];
                elEigen.textContent = `${ev.re.toFixed(2)} ± ${ev.im.toFixed(2)}i`;
            }
        }

        if (elInvariants) {
            elInvariants.textContent = `tr = ${tr.toFixed(2)} | det = ${det.toFixed(2)}`;
        }
    }

    mount() {
        this.isActive = true;
        this.isPlaying = false;
        this.plano.showGrid = true;
        this.plano.showVVec = false;
        this.plano.showVPrime = false;
        this.plano.showDisplacementVec = false;
        this.plano.showGhostBasisVectors = false;
        this.plano.showGhostGrid = false;
        this.plano.showDetArea = false;
        this.plano.showUnitCircle = false;
        this.plano.showBasisVectors = false;
        this.plano.showTransformedGrid = false;
        this.plano.allowedDragTargets = [];
        this.plano.customTransformFn = null;

        if (this.seeds.length === 0) {
            this.generateCircleSeeds(14, 2.2);
        }

        this.updateClassification();
        this.drawDynamicScene();
    }

    unmount() {
        this.isActive = false;
        this.isPlaying = false;
        cancelAnimationFrame(this.animRequestId);
        if (this.playToggleControl && this.playToggleControl.isActive()) {
            this.playToggleControl.setState(0);
        }
    }
}
