// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-modo-construir.js
// Modo 2: Construir a Matriz em 3 Etapas (Espaço Inicial -> Transformado -> Evolução)
// =============================================================================

import { setFieldState, eigen2x2, renderMath } from '../sim-ui.js';

export class ModoConstruir {
    /**
     * @param {PlanoCartesiano} plano - Canvas único em tela cheia
     * @param {Object} domElements
     */
    constructor(plano, domElements) {
        this.plano = plano;
        this.dom = domElements;

        // Etapa ativa: 1 (Espaço Inicial), 2 (Espaço Transformado), 3 (Evolução)
        this.currentStep = 1;

        // Base inicial (Etapa 1)
        this.iHatInit = { x: 1, y: 0 };
        this.jHatInit = { x: 0, y: 1 };

        // Base transformada (Etapa 2)
        this.iHatPrime = { x: 1.5, y: 0.5 };
        this.jHatPrime = { x: -0.5, y: 1.5 };

        // Vetor de prova v
        this.vVec = { x: 2, y: 1 };

        // Matriz M calculada
        this.M = { a: 1.5, b: -0.5, c: 0.5, d: 1.5 };

        this.isAnimating = false;
        this.animRequestId = null;

        this.initDOM();
    }

    initDOM() {
        const {
            chkShowDisplacement,
            chkShowEigenModo2,
            chkShowGhostModo2,
            btnAnimateModo2,
            btnResetModo2,
            stepperToolbar
        } = this.dom;

        // Botões das 3 Etapas no Topo do Canvas
        if (stepperToolbar) {
            stepperToolbar.querySelectorAll('.stepper-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const step = parseInt(btn.dataset.step, 10);
                    this.setStep(step, step === 3);
                });
            });
        }

        if (chkShowDisplacement) {
            chkShowDisplacement.addEventListener('change', (e) => {
                if (this.currentStep === 3) {
                    this.plano.showDisplacementVec = e.target.checked;
                    this.plano.draw();
                }
            });
        }

        if (chkShowEigenModo2) {
            chkShowEigenModo2.addEventListener('change', (e) => {
                if (this.currentStep >= 2) {
                    this.plano.showEigen = e.target.checked;
                    this.plano.draw();
                }
            });
        }

        if (chkShowGhostModo2) {
            chkShowGhostModo2.addEventListener('change', (e) => {
                const checked = e.target.checked;
                this.plano.showGhostGrid = checked;
                if (this.currentStep >= 2) {
                    this.plano.showGhostBasisVectors = checked;
                }
                this.plano.draw();
            });
        }

        // Botão Animar v -> v' na barra inferior
        if (btnAnimateModo2) {
            btnAnimateModo2.addEventListener('click', () => {
                if (this.currentStep !== 3) {
                    this.setStep(3, true);
                } else {
                    this.triggerAnimation();
                }
            });
        }

        // Botão Resetar na barra inferior
        if (btnResetModo2) {
            btnResetModo2.addEventListener('click', () => {
                if (this.currentStep === 3) {
                    // Na Etapa 3, retorna suavemente o espaço visual para o Espaço Inicial
                    // preservando o operador M configurado (igual à Aba 1)
                    this.animateBackToInitialSpace();
                } else {
                    this.resetDefaults();
                }
            });
        }

        // Callback de arraste no canvas único
        this.handleTargetChange = (target, pos) => {
            if (this.currentStep === 1) {
                if (target.type === 'i') {
                    this.iHatInit = { ...pos };
                } else if (target.type === 'j') {
                    this.jHatInit = { ...pos };
                } else if (target.type === 'v') {
                    this.vVec = { ...pos };
                }
                this.recalculateTransformation();
            } else {
                if (target.type === 'i') {
                    this.iHatPrime = { ...pos };
                    this.recalculateTransformation();
                } else if (target.type === 'j') {
                    this.jHatPrime = { ...pos };
                    this.recalculateTransformation();
                } else if (target.type === 'vPrime') {
                    const detM = this.M.a * this.M.d - this.M.b * this.M.c;
                    if (Math.abs(detM) > 1e-4) {
                        const invDet = 1 / detM;
                        const vx = invDet * (this.M.d * pos.x - this.M.b * pos.y);
                        const vy = invDet * (-this.M.c * pos.x + this.M.a * pos.y);
                        this.vVec = { x: Math.round(vx * 20) / 20, y: Math.round(vy * 20) / 20 };
                        this.recalculateTransformation();
                    }
                }
            }
        };
    }

    /**
     * Alterna entre as 3 etapas do Modo Construir
     * @param {number} step - 1, 2 ou 3
     * @param {boolean} [autoAnimate=false]
     */
    setStep(step, autoAnimate = false) {
        if (this.isAnimating) {
            cancelAnimationFrame(this.animRequestId);
            this.isAnimating = false;
        }

        this.currentStep = step;

        if (this.dom.stepperToolbar) {
            this.dom.stepperToolbar.querySelectorAll('.stepper-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.step, 10) === step);
            });
        }

        const showGhost = this.dom.chkShowGhostModo2 ? this.dom.chkShowGhostModo2.checked : true;
        const showEigen = this.dom.chkShowEigenModo2 ? this.dom.chkShowEigenModo2.checked : true;
        const showDisp = this.dom.chkShowDisplacement ? this.dom.chkShowDisplacement.checked : true;

        this.plano.showGhostGrid = showGhost;

        if (step === 1) {
            // Etapa 1: Espaço Inicial (ajusta î, ĵ e v)
            this.plano.basisLabels = { i: 'î', j: 'ĵ' };
            this.plano.iHatStart = { x: 1, y: 0 };
            this.plano.jHatStart = { x: 0, y: 1 };
            this.plano.showGhostBasisVectors = false;
            this.plano.showVVec = true;
            this.plano.showVPrime = false;
            this.plano.showDisplacementVec = false;
            this.plano.showEigen = false;
            this.plano.allowedDragTargets = ['i', 'j', 'v'];
        } else if (step === 2) {
            // Etapa 2: Espaço Transformado (ajusta î' e ĵ' com referência fantasma de î, ĵ)
            this.plano.basisLabels = { i: "î'", j: "ĵ'" };
            this.plano.iHatStart = { ...this.iHatInit };
            this.plano.jHatStart = { ...this.jHatInit };
            this.plano.showGhostBasisVectors = showGhost;
            this.plano.showVVec = false;
            this.plano.showVPrime = true;
            this.plano.showDisplacementVec = false;
            this.plano.showEigen = showEigen;
            this.plano.allowedDragTargets = ['i', 'j', 'vPrime'];
        } else {
            // Etapa 3: Evolução & Animação (v -> v' e deslocamento d = v' - v)
            this.plano.basisLabels = { i: "î'", j: "ĵ'" };
            this.plano.iHatStart = { ...this.iHatInit };
            this.plano.jHatStart = { ...this.jHatInit };
            this.plano.showGhostBasisVectors = showGhost;
            this.plano.showVVec = false;
            this.plano.showVPrime = true;
            this.plano.showDisplacementVec = showDisp;
            this.plano.showEigen = showEigen;
            this.plano.allowedDragTargets = ['i', 'j', 'vPrime'];
        }

        this.recalculateTransformation();

        if (autoAnimate && step === 3) {
            this.triggerAnimation();
        }
    }

    /**
     * Calcula M = [i' j'] * [i j]^(-1) e atualiza o plano de acordo com a etapa ativa
     */
    recalculateTransformation() {
        const B = {
            a: this.iHatInit.x,
            b: this.jHatInit.x,
            c: this.iHatInit.y,
            d: this.jHatInit.y
        };

        const detB = B.a * B.d - B.b * B.c;
        const baseBox = document.getElementById('construir-system-card');

        if (Math.abs(detB) < 1e-4) {
            setFieldState(baseBox, 'invalid', 'Base inicial degenerada: î e ĵ são colineares (det = 0).');
            this.plano.iHat = { ...this.iHatInit };
            this.plano.jHat = { ...this.jHatInit };
            this.plano.vVec = { ...this.vVec };
            this.plano.draw();
            return;
        }

        const invDetB = 1 / detB;
        const invB = {
            a: B.d * invDetB,
            b: -B.b * invDetB,
            c: -B.c * invDetB,
            d: B.a * invDetB
        };

        const P = {
            a: this.iHatPrime.x,
            b: this.jHatPrime.x,
            c: this.iHatPrime.y,
            d: this.jHatPrime.y
        };

        // M = P * invB
        const M = {
            a: P.a * invB.a + P.b * invB.c,
            b: P.a * invB.b + P.b * invB.d,
            c: P.c * invB.a + P.d * invB.c,
            d: P.c * invB.b + P.d * invB.d
        };
        this.M = M;

        // v' = M * v
        const vPrime = {
            x: M.a * this.vVec.x + M.b * this.vVec.y,
            y: M.c * this.vVec.x + M.d * this.vVec.y
        };

        // Deslocamento d = v' - v
        const dVec = {
            x: vPrime.x - this.vVec.x,
            y: vPrime.y - this.vVec.y
        };

        const analysis = eigen2x2(M);
        this.plano.currentAnalysis = analysis;
        this.plano.vVec = { ...this.vVec };
        this.plano.vPrime = { ...vPrime };

        if (this.currentStep === 1) {
            this.plano.iHat = { ...this.iHatInit };
            this.plano.jHat = { ...this.jHatInit };
        } else {
            this.plano.iHatStart = { ...this.iHatInit };
            this.plano.jHatStart = { ...this.jHatInit };
            this.plano.iHat = { ...this.iHatPrime };
            this.plano.jHat = { ...this.jHatPrime };
        }

        this.updateMathDisplays(M, vPrime, dVec);

        const detM = M.a * M.d - M.b * M.c;
        if (Math.abs(detM) < 1e-4) {
            setFieldState(baseBox, 'warning', 'Operador singular: colapsa o espaço (det = 0).');
        } else {
            setFieldState(baseBox, null, '');
        }

        this.plano.draw();
    }

    updateMathDisplays(M, vPrime, dVec) {
        const katexMatrix = document.getElementById('construir-katex-matrix');
        if (katexMatrix) {
            const mTex = `M = \\begin{bmatrix} ${M.a.toFixed(2)} & ${M.b.toFixed(2)} \\\\ ${M.c.toFixed(2)} & ${M.d.toFixed(2)} \\end{bmatrix}`;
            renderMath(katexMatrix, mTex, { displayMode: true });
        }

        const valVx = document.getElementById('construir-val-vx');
        const valVy = document.getElementById('construir-val-vy');
        const valVxP = document.getElementById('construir-val-vpx');
        const valVyP = document.getElementById('construir-val-vpy');
        const valDx = document.getElementById('construir-val-dx');
        const valDy = document.getElementById('construir-val-dy');
        const valDetM = document.getElementById('construir-val-detm');

        if (valVx) valVx.textContent = this.vVec.x.toFixed(2);
        if (valVy) valVy.textContent = this.vVec.y.toFixed(2);
        if (valVxP) valVxP.textContent = vPrime.x.toFixed(2);
        if (valVyP) valVyP.textContent = vPrime.y.toFixed(2);
        if (valDx) valDx.textContent = dVec.x.toFixed(2);
        if (valDy) valDy.textContent = dVec.y.toFixed(2);
        if (valDetM) {
            const det = M.a * M.d - M.b * M.c;
            valDetM.textContent = det.toFixed(2);
        }
    }

    /**
     * Anima suavemente do Espaço Inicial (iHatInit, jHatInit, v) até o Espaço Transformado (iHatPrime, jHatPrime, v')
     */
    triggerAnimation() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);

        const duration = 900;
        const startTime = performance.now();
        this.isAnimating = true;

        const startI = { ...this.iHatInit };
        const startJ = { ...this.jHatInit };
        const targetI = { ...this.iHatPrime };
        const targetJ = { ...this.jHatPrime };
        const vStart = { ...this.vVec };
        const vEnd = {
            x: this.M.a * this.vVec.x + this.M.b * this.vVec.y,
            y: this.M.c * this.vVec.x + this.M.d * this.vVec.y
        };

        const animateStep = (now) => {
            const elapsed = now - startTime;
            const p = Math.min(elapsed / duration, 1.0);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

            this.plano.iHat = {
                x: startI.x + (targetI.x - startI.x) * eased,
                y: startI.y + (targetI.y - startI.y) * eased
            };
            this.plano.jHat = {
                x: startJ.x + (targetJ.x - startJ.x) * eased,
                y: startJ.y + (targetJ.y - startJ.y) * eased
            };
            this.plano.vPrime = {
                x: vStart.x + (vEnd.x - vStart.x) * eased,
                y: vStart.y + (vEnd.y - vStart.y) * eased
            };

            this.plano.draw();

            if (p < 1.0) {
                this.animRequestId = requestAnimationFrame(animateStep);
            } else {
                this.isAnimating = false;
                this.recalculateTransformation();
            }
        };

        this.animRequestId = requestAnimationFrame(animateStep);
    }

    /**
     * Na Etapa 3, retorna suavemente a visualização para o Espaço Inicial sem apagar M
     */
    animateBackToInitialSpace() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);

        const duration = 700;
        const startTime = performance.now();
        this.isAnimating = true;

        const startI = { ...this.plano.iHat };
        const startJ = { ...this.plano.jHat };
        const startVp = this.plano.vPrime ? { ...this.plano.vPrime } : { ...this.vVec };

        const destI = { ...this.iHatInit };
        const destJ = { ...this.jHatInit };
        const destVp = { ...this.vVec };

        const step = (now) => {
            const p = Math.min((now - startTime) / duration, 1.0);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

            this.plano.iHat = {
                x: startI.x + (destI.x - startI.x) * eased,
                y: startI.y + (destI.y - startI.y) * eased
            };
            this.plano.jHat = {
                x: startJ.x + (destJ.x - startJ.x) * eased,
                y: startJ.y + (destJ.y - startJ.y) * eased
            };
            this.plano.vPrime = {
                x: startVp.x + (destVp.x - startVp.x) * eased,
                y: startVp.y + (destVp.y - startVp.y) * eased
            };

            this.plano.draw();

            if (p < 1.0) {
                this.animRequestId = requestAnimationFrame(step);
            } else {
                this.isAnimating = false;
            }
        };

        this.animRequestId = requestAnimationFrame(step);
    }

    /**
     * Restaura suavemente os vetores para as posições padrão
     */
    resetDefaults() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);

        const start = {
            ix: this.iHatInit.x, iy: this.iHatInit.y,
            jx: this.jHatInit.x, jy: this.jHatInit.y,
            ipx: this.iHatPrime.x, ipy: this.iHatPrime.y,
            jpx: this.jHatPrime.x, jpy: this.jHatPrime.y,
            vx: this.vVec.x, vy: this.vVec.y
        };
        const dest = {
            ix: 1, iy: 0,
            jx: 0, jy: 1,
            ipx: 1.5, ipy: 0.5,
            jpx: -0.5, jpy: 1.5,
            vx: 2, vy: 1
        };

        const duration = 650;
        const startTime = performance.now();
        this.isAnimating = true;

        const step = (now) => {
            const p = Math.min((now - startTime) / duration, 1.0);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

            this.iHatInit = {
                x: start.ix + (dest.ix - start.ix) * eased,
                y: start.iy + (dest.iy - start.iy) * eased
            };
            this.jHatInit = {
                x: start.jx + (dest.jx - start.jx) * eased,
                y: start.jy + (dest.jy - start.jy) * eased
            };
            this.iHatPrime = {
                x: start.ipx + (dest.ipx - start.ipx) * eased,
                y: start.ipy + (dest.ipy - start.ipy) * eased
            };
            this.jHatPrime = {
                x: start.jpx + (dest.jpx - start.jpx) * eased,
                y: start.jpy + (dest.jpy - start.jpy) * eased
            };
            this.vVec = {
                x: start.vx + (dest.vx - start.vx) * eased,
                y: start.vy + (dest.vy - start.vy) * eased
            };

            this.recalculateTransformation();

            if (p < 1.0) {
                this.animRequestId = requestAnimationFrame(step);
            } else {
                this.isAnimating = false;
            }
        };

        this.animRequestId = requestAnimationFrame(step);
    }

    mount() {
        this.plano.showGrid = false;
        this.plano.showTransformedGrid = true;
        this.plano.showDetArea = false;
        this.plano.showUnitCircle = false;
        this.plano.showBasisVectors = true;
        this.plano.customTransformFn = null;
        this.plano.probeSurfaces = [];
        this.plano.onTargetChange = this.handleTargetChange;

        this.setStep(this.currentStep, false);
    }

    unmount() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);
        this.plano.showGhostBasisVectors = false;
        this.plano.basisLabels = { i: "î'", j: "ĵ'" };
        this.plano.onTargetChange = null;
    }
}
