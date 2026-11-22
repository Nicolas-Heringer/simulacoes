// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-modo-funcoes.js
// Modo 3: Entradas Funcionais M(x, y, t), Evolução Temporal e Superfícies de Prova
// =============================================================================

import { compileExpression } from './matrizes-expr.js';
import { setFieldState, initToggleButton, syncDualSlider, renderMath } from '../sim-ui.js';

export class ModoFuncoes {
    /**
     * @param {PlanoCartesiano} plano
     * @param {Object} domElements
     */
    constructor(plano, domElements) {
        this.plano = plano;
        this.dom = domElements;

        // Expressões das células
        this.exprStrings = {
            m11: '1',
            m12: '0.2*sin(y + t)',
            m21: '0.2*sin(x + t)',
            m22: '1'
        };

        // Funções compiladas
        this.compiledFns = {
            m11: () => 1,
            m12: (x, y, t) => 0.2 * Math.sin(y + t),
            m21: (x, y, t) => 0.2 * Math.sin(x + t),
            m22: () => 1
        };

        // Parâmetro temporal t
        this.t = 0;
        this.speed = 1.0;
        this.isPlaying = false;
        this.lastTime = 0;
        this.animRequestId = null;

        // Superfícies de prova (inicializa vazio para início limpo sob demanda)
        this.probeSurfaces = [];

        this.initDOM();
        this.recompileAll();
    }

    toggleSurface(type) {
        const existingIdx = this.probeSurfaces.findIndex(s => s.type === type);
        if (existingIdx !== -1) {
            this.probeSurfaces.splice(existingIdx, 1);
        } else {
            if (type === 'circle') {
                this.probeSurfaces.push({
                    id: 'fn-circle',
                    type: 'circle',
                    cx: 1.5,
                    cy: 1.5,
                    size: 1.0,
                    color: '#a855f7'
                });
            } else if (type === 'square') {
                this.probeSurfaces.push({
                    id: 'fn-square',
                    type: 'square',
                    cx: -1.8,
                    cy: 1.2,
                    size: 1.4,
                    color: '#22c55e'
                });
            }
        }
        this.updateSurfaceToggleButtons();
        this.syncSurfacesToPlano();
        this.updateSurfaceTelemetry();
        this.plano.draw();
    }

    updateSurfaceToggleButtons() {
        const { btnAddCircle, btnAddSquare } = this.dom;
        const hasCircle = this.probeSurfaces.some(s => s.type === 'circle');
        const hasSquare = this.probeSurfaces.some(s => s.type === 'square');
        if (btnAddCircle) {
            btnAddCircle.classList.toggle('active', hasCircle);
            btnAddCircle.classList.toggle('is-active', hasCircle);
        }
        if (btnAddSquare) {
            btnAddSquare.classList.toggle('active', hasSquare);
            btnAddSquare.classList.toggle('is-active', hasSquare);
        }
    }

    initDOM() {
        const {
            fnM11, fnM12, fnM21, fnM22,
            presetFnSelect,
            btnAddCircle, btnAddSquare,
            btnPlayFn, btnStepFn, btnResetFn,
            sliderT, numT,
            btnSpeedCycle,
            chkGhostGrid
        } = this.dom;

        // Entradas funcionais com validação enxuta (apenas em caso de erro)
        const inputs = [
            { key: 'm11', el: fnM11 },
            { key: 'm12', el: fnM12 },
            { key: 'm21', el: fnM21 },
            { key: 'm22', el: fnM22 }
        ];

        inputs.forEach(({ key, el }) => {
            if (!el) return;
            el.addEventListener('input', () => {
                this.exprStrings[key] = el.value.trim();
                this.syncPresetSelectWithExprs();
                this.validateAndCompileInputs();
                this.updatePlanoTransform();
            });
        });

        // Presets funcionais
        if (presetFnSelect) {
            presetFnSelect.addEventListener('change', (e) => {
                this.applyPreset(e.target.value);
            });
        }

        // Toggle de superfícies de prova (Círculo e Quadrado)
        if (btnAddCircle) {
            btnAddCircle.addEventListener('click', () => this.toggleSurface('circle'));
        }

        if (btnAddSquare) {
            btnAddSquare.addEventListener('click', () => this.toggleSurface('square'));
        }

        // Switch da grade de referência (fantasma)
        if (chkGhostGrid) {
            chkGhostGrid.addEventListener('change', (e) => {
                this.plano.showGhostGrid = e.target.checked;
                this.plano.draw();
            });
        }

        // Transporte temporal (Play / Pause / Step / Reset)
        if (btnPlayFn) {
            this.playToggleControl = initToggleButton(btnPlayFn, (isActive) => {
                this.isPlaying = isActive;
                if (this.isPlaying) {
                    this.lastTime = performance.now();
                    this.loop();
                } else {
                    cancelAnimationFrame(this.animRequestId);
                }
            });
        }

        if (btnStepFn) {
            btnStepFn.addEventListener('click', () => {
                if (this.isPlaying && this.playToggleControl) {
                    this.playToggleControl.setState(0, true);
                }
                this.t += 0.1;
                this.updateTControls();
                this.updatePlanoTransform();
            });
        }

        if (btnResetFn) {
            btnResetFn.addEventListener('click', () => {
                if (this.isPlaying && this.playToggleControl) {
                    this.playToggleControl.setState(0, true);
                }
                this.t = 0;
                this.updateTControls();
                this.updatePlanoTransform();
            });
        }

        // Sincronização do Slider de Tempo
        if (sliderT && numT) {
            this.sliderController = syncDualSlider(sliderT, numT, (val) => {
                this.t = val;
                this.updatePlanoTransform();
            });
        }

        // Botão cíclico de velocidade na barra flutuante
        if (btnSpeedCycle) {
            const speeds = [0.5, 1.0, 2.0];
            btnSpeedCycle.addEventListener('click', () => {
                const curIdx = speeds.indexOf(this.speed);
                this.speed = speeds[(curIdx + 1) % speeds.length];
                btnSpeedCycle.dataset.speed = this.speed.toFixed(1);
                btnSpeedCycle.textContent = `${this.speed.toFixed(1)}×`;
            });
        }

        // Callback de interação do plano para quando arrastar uma superfície
        this.handleTargetChange = () => {
            this.updateSurfaceTelemetry();
        };
    }

    updateTControls() {
        if (this.sliderController) {
            this.sliderController.setValue(parseFloat(this.t.toFixed(2)));
        }
    }

    loop() {
        if (!this.isPlaying) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.t += dt * this.speed;
        if (this.t > 10) {
            this.t = 0; // Loop contínuo de 0 a 10
        }

        this.updateTControls();
        this.updatePlanoTransform();

        this.animRequestId = requestAnimationFrame(() => this.loop());
    }

    validateAndCompileInputs() {
        const { fnM11, fnM12, fnM21, fnM22 } = this.dom;
        const matrixBox = document.getElementById('funcoes-matrix-box');
        const list = [
            { key: 'm11', el: fnM11, label: 'M₁₁' },
            { key: 'm12', el: fnM12, label: 'M₁₂' },
            { key: 'm21', el: fnM21, label: 'M₂₁' },
            { key: 'm22', el: fnM22, label: 'M₂₂' }
        ];

        let firstError = null;

        list.forEach(({ key, el, label }) => {
            const res = compileExpression(this.exprStrings[key]);
            if (res.valid) {
                this.compiledFns[key] = res.fn;
                if (el) setFieldState(el, null);
            } else {
                if (el) setFieldState(el, 'invalid');
                if (!firstError) {
                    firstError = `${label}: ${res.error || 'Expressão inválida'}`;
                }
            }
        });

        if (matrixBox) {
            if (firstError) {
                setFieldState(matrixBox, 'invalid', firstError);
            } else {
                setFieldState(matrixBox, null);
            }
        }
    }

    recompileAll() {
        const { fnM11, fnM12, fnM21, fnM22 } = this.dom;
        const list = [
            { key: 'm11', el: fnM11 },
            { key: 'm12', el: fnM12 },
            { key: 'm21', el: fnM21 },
            { key: 'm22', el: fnM22 }
        ];

        list.forEach(({ key, el }) => {
            if (el) el.value = this.exprStrings[key];
        });

        this.validateAndCompileInputs();
        this.updatePlanoTransform();
    }

    /**
     * Verifica se as expressões atuais correspondem a algum preset; caso contrário, seleciona 'custom' (Personalizado / Manual)
     */
    syncPresetSelectWithExprs() {
        const { presetFnSelect } = this.dom;
        if (!presetFnSelect) return;

        const norm = (s) => (s || '').replace(/\s+/g, '');
        const match = (a, b, c, d) =>
            norm(this.exprStrings.m11) === norm(a) &&
            norm(this.exprStrings.m12) === norm(b) &&
            norm(this.exprStrings.m21) === norm(c) &&
            norm(this.exprStrings.m22) === norm(d);

        let detected = 'custom';
        if (match('1', '0.3*sin(1.5*y + t)', '0.3*sin(1.5*x + t)', '1') || match('1', '0.2*sin(y + t)', '0.2*sin(x + t)', '1')) {
            detected = 'wave';
        } else if (match('cos(0.5*sqrt(x^2 + y^2) - t)', '-sin(0.5*sqrt(x^2 + y^2) - t)', 'sin(0.5*sqrt(x^2 + y^2) - t)', 'cos(0.5*sqrt(x^2 + y^2) - t)')) {
            detected = 'vortex';
        } else if (match('1 + 0.3*cos(t)/(1 + 0.1*(x^2 + y^2))', '0', '0', '1 + 0.3*cos(t)/(1 + 0.1*(x^2 + y^2))')) {
            detected = 'lens';
        } else if (match('1', '0.15*y*sin(t)', '0', '1')) {
            detected = 'nonlinear-shear';
        } else if (match('1 + 0.35*sin(t)', '0', '0', '1 + 0.35*sin(t)')) {
            detected = 'breathing';
        }

        if (presetFnSelect.value !== detected) {
            presetFnSelect.value = detected;
        }
    }

    applyPreset(presetName) {
        switch (presetName) {
            case 'vortex':
                // Redemoinho / Vortex: rotação angular decaindo com raio r e girando com t
                this.exprStrings = {
                    m11: 'cos(0.5*sqrt(x^2 + y^2) - t)',
                    m12: '-sin(0.5*sqrt(x^2 + y^2) - t)',
                    m21: 'sin(0.5*sqrt(x^2 + y^2) - t)',
                    m22: 'cos(0.5*sqrt(x^2 + y^2) - t)'
                };
                break;
            case 'wave':
                // Onda senoidal plana
                this.exprStrings = {
                    m11: '1',
                    m12: '0.3*sin(1.5*y + t)',
                    m21: '0.3*sin(1.5*x + t)',
                    m22: '1'
                };
                break;
            case 'lens':
                // Lente Gravitacional / Deformação de densidade
                this.exprStrings = {
                    m11: '1 + 0.3*cos(t)/(1 + 0.1*(x^2 + y^2))',
                    m12: '0',
                    m21: '0',
                    m22: '1 + 0.3*cos(t)/(1 + 0.1*(x^2 + y^2))'
                };
                break;
            case 'nonlinear-shear':
                // Cisalhamento Não-Linear dependente de y^2
                this.exprStrings = {
                    m11: '1',
                    m12: '0.15*y*sin(t)',
                    m21: '0',
                    m22: '1'
                };
                break;
            case 'breathing':
                // Respiração / Pulsação isotrópica
                this.exprStrings = {
                    m11: '1 + 0.35*sin(t)',
                    m12: '0',
                    m21: '0',
                    m22: '1 + 0.35*sin(t)'
                };
                break;
        }

        this.recompileAll();
    }

    updatePlanoTransform() {
        const { m11, m12, m21, m22 } = this.compiledFns;
        const curT = this.t;

        // Define a transformação não-linear no Plano Cartesiano:
        // [x', y'] = M(x, y, t) * [x, y]^T
        this.plano.customTransformFn = (x, y) => {
            const a = m11(x, y, curT);
            const b = m12(x, y, curT);
            const c = m21(x, y, curT);
            const d = m22(x, y, curT);
            return {
                x: a * x + b * y,
                y: c * x + d * y
            };
        };

        this.syncSurfacesToPlano();
        this.updateSurfaceTelemetry();
        this.plano.draw();
    }

    syncSurfacesToPlano() {
        this.plano.probeSurfaces = this.probeSurfaces;
    }

    /**
     * Calcula a telemetria local e aproximação linear (Jacobiana) para cada superfície de prova ativa
     */
    updateSurfaceTelemetry() {
        const container = document.getElementById('funcoes-surfaces-telemetry');
        if (!container) return;

        if (this.probeSurfaces.length === 0) {
            container.innerHTML = '';
            return;
        }

        const eps = 0.001;
        const map = this.plano.customTransformFn || ((x, y) => ({ x, y }));

        let html = '';
        this.probeSurfaces.forEach((surf) => {
            const cx = surf.cx;
            const cy = surf.cy;

            // Jacobiana numérica J = [dx'/dx  dx'/dy; dy'/dx dy'/dy] em (cx, cy)
            const p0 = map(cx, cy);
            const px = map(cx + eps, cy);
            const py = map(cx, cy + eps);

            const j11 = (px.x - p0.x) / eps;
            const j21 = (px.y - p0.y) / eps;
            const j12 = (py.x - p0.x) / eps;
            const j22 = (py.y - p0.y) / eps;

            const detJ = j11 * j22 - j12 * j21;
            const absDetJ = Math.abs(detJ);

            // Área original
            const origArea = surf.type === 'circle'
                ? Math.PI * surf.size * surf.size
                : surf.size * surf.size;

            // Estimativa de área deformada via Green/Shoelace sobre a fronteira amostrada
            const steps = 36;
            const pts = [];
            for (let k = 0; k < steps; k++) {
                const th = (k / steps) * Math.PI * 2;
                let mx, my;
                if (surf.type === 'circle') {
                    mx = cx + surf.size * Math.cos(th);
                    my = cy + surf.size * Math.sin(th);
                } else {
                    const s = surf.size / 2;
                    const u = Math.cos(th);
                    const v = Math.sin(th);
                    const scale = 1 / Math.max(Math.abs(u), Math.abs(v));
                    mx = cx + s * u * scale;
                    my = cy + s * v * scale;
                }
                pts.push(map(mx, my));
            }

            let shoelace = 0;
            for (let k = 0; k < steps; k++) {
                const pCurr = pts[k];
                const pNext = pts[(k + 1) % steps];
                shoelace += (pCurr.x * pNext.y - pNext.x * pCurr.y);
            }
            const transArea = Math.abs(shoelace) / 2;
            const areaRatio = origArea > 0 ? transArea / origArea : 1;

            const surfClass = surf.type === 'circle' ? 'surface-circle' : 'surface-square';
            const surfName = surf.type === 'circle' ? 'Círculo' : 'Quadrado';

            html += `
                <div class="sim-readout surface-telemetry-card ${surfClass}">
                    <div class="sim-readout-title">
                        <span class="surface-dot" aria-hidden="true"></span>
                        <span>${surfName} em (${cx.toFixed(1)}, ${cy.toFixed(1)})</span>
                    </div>
                    <div class="sim-readout-row">
                        <span class="sim-readout-label">Razão de Área ($A'/A_0$)</span>
                        <span class="sim-readout-value tone-cyan">${areaRatio.toFixed(2)}x (${transArea.toFixed(2)} / ${origArea.toFixed(2)})</span>
                    </div>
                    <div class="sim-readout-row">
                        <span class="sim-readout-label">Jacobiana Local $|\\det(J)|$</span>
                        <span class="sim-readout-value tone-accent">${absDetJ.toFixed(2)}x</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (window.renderMathInElement) {
            window.renderMathInElement(container, {
                delimiters: [{ left: '$', right: '$', display: false }],
                throwOnError: false
            });
        }
    }

    mount() {
        this.plano.showGrid = false;
        this.plano.showTransformedGrid = true;
        this.plano.showVVec = false;
        this.plano.showVPrime = false;
        this.plano.showDisplacementVec = false;
        this.plano.showEigen = false;
        this.plano.showGhostBasisVectors = false;
        this.plano.iHatStart = { x: 1, y: 0 };
        this.plano.jHatStart = { x: 0, y: 1 };
        this.plano.showGhostGrid = this.dom.chkGhostGrid ? this.dom.chkGhostGrid.checked : true;
        this.plano.showDetArea = false;
        this.plano.showUnitCircle = false;
        this.plano.showBasisVectors = false;
        this.plano.allowedDragTargets = ['surface-center', 'surface-resize'];
        this.plano.onTargetChange = this.handleTargetChange;

        this.updateSurfaceToggleButtons();
        this.updatePlanoTransform();
    }

    unmount() {
        if (this.playToggleControl && this.playToggleControl.isActive()) {
            this.playToggleControl.setState(0, true);
        } else {
            this.isPlaying = false;
            cancelAnimationFrame(this.animRequestId);
        }
        this.plano.probeSurfaces = [];
        this.plano.customTransformFn = null;
        this.plano.onTargetChange = null;
    }
}
