// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-modo-base.js
// Modo 1: Interpretação Geométrica e Imagens da Base Canônica
// =============================================================================

import { setFieldState, det2x2, syncDualSlider } from '../sim-ui.js';

export class ModoBase {
    /**
     * @param {PlanoCartesiano} plano
     * @param {Object} domElements
     */
    constructor(plano, domElements) {
        this.plano = plano;
        this.dom = domElements;

        this.matrix = { a: 1, b: 0, c: 0, d: 1 };
        this.startMatrix = { a: 1, b: 0, c: 0, d: 1 };
        this.targetMatrix = { a: 1, b: 0, c: 0, d: 1 };

        this.probeSurfaces = []; // Inicia limpo sem poluição visual

        this.isAnimating = false;
        this.animRequestId = null;

        this.initDOM();
    }

    initDOM() {
        // Conexão dos inputs
        const { m11, m12, m21, m22, btnApply, btnReset, presetSelect, rotSlider, chkGhostGrid, chkDetArea, chkUnitCircle } = this.dom;

        const onInputChange = () => {
            this.targetMatrix = this.getInputsMatrix();
            this.validateMatrix();
            if (btnApply) {
                setFieldState(btnApply, 'ready', 'Alterações pendentes');
            }
        };

        [m11, m12, m21, m22].forEach(input => {
            if (input) input.addEventListener('input', onInputChange);
        });

        // Hover nas células destaca a coluna correspondente no canvas
        const cellI = document.querySelectorAll('#tab-pane-base .cell-i');
        const cellJ = document.querySelectorAll('#tab-pane-base .cell-j');

        cellI.forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.plano.hoverTarget = { type: 'i' };
                this.plano.draw();
            });
            el.addEventListener('mouseleave', () => {
                if (this.plano.hoverTarget?.type === 'i') {
                    this.plano.hoverTarget = null;
                    this.plano.draw();
                }
            });
        });

        cellJ.forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.plano.hoverTarget = { type: 'j' };
                this.plano.draw();
            });
            el.addEventListener('mouseleave', () => {
                if (this.plano.hoverTarget?.type === 'j') {
                    this.plano.hoverTarget = null;
                    this.plano.draw();
                }
            });
        });

        if (btnApply) {
            btnApply.addEventListener('click', () => {
                setFieldState(btnApply, null);
                this.triggerAnimation();
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (presetSelect) presetSelect.value = 'identity';
                const rotGroup = document.getElementById('base-rotationGroup');
                if (rotGroup) rotGroup.style.display = 'none';

                this.targetMatrix = { a: 1, b: 0, c: 0, d: 1 };
                this.setInputsMatrix(this.targetMatrix);
                setFieldState(btnApply, null);
                this.triggerAnimation();
            });
        }

        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                this.applyPreset(e.target.value);
            });
        }

        if (rotSlider) {
            syncDualSlider('#base-rotSlider', '#base-rotNum', () => {
                this.updateRotationPreset();
            });
        }

        if (chkGhostGrid) {
            chkGhostGrid.addEventListener('change', (e) => {
                this.plano.showGhostGrid = e.target.checked;
                this.plano.draw();
            });
        }

        if (chkDetArea) {
            chkDetArea.addEventListener('change', (e) => {
                this.plano.showDetArea = e.target.checked;
                this.plano.draw();
            });
        }

        if (chkUnitCircle) {
            chkUnitCircle.addEventListener('change', (e) => {
                this.plano.showUnitCircle = e.target.checked;
                this.plano.draw();
            });
        }

        // Superfícies de prova opcionais (inserção sob demanda)
        const btnAddCircle = document.getElementById('base-btnAddCircle');
        const btnAddSquare = document.getElementById('base-btnAddSquare');
        const btnClearSurfaces = document.getElementById('base-btnClearSurfaces');

        if (btnAddCircle) btnAddCircle.addEventListener('click', () => this.addCircle());
        if (btnAddSquare) btnAddSquare.addEventListener('click', () => this.addSquare());
        if (btnClearSurfaces) btnClearSurfaces.addEventListener('click', () => this.clearSurfaces());

        // Conectar callbacks do plano interativo
        this.plano.onTargetChange = (target, pos) => {
            if (target.type === 'i') {
                m11.value = pos.x.toFixed(1);
                m21.value = pos.y.toFixed(1);
            } else if (target.type === 'j') {
                m12.value = pos.x.toFixed(1);
                m22.value = pos.y.toFixed(1);
            }
            this.matrix = this.getInputsMatrix();
            this.targetMatrix = { ...this.matrix };
            this.startMatrix = { ...this.matrix };
            this.updateReadouts(this.matrix);
            this.validateMatrix();
        };
    }

    getInputsMatrix() {
        const { m11, m12, m21, m22 } = this.dom;
        return {
            a: parseFloat(m11.value) || 0,
            b: parseFloat(m12.value) || 0,
            c: parseFloat(m21.value) || 0,
            d: parseFloat(m22.value) || 0
        };
    }

    setInputsMatrix(m) {
        const { m11, m12, m21, m22 } = this.dom;
        m11.value = m.a.toFixed(2);
        m12.value = m.b.toFixed(2);
        m21.value = m.c.toFixed(2);
        m22.value = m.d.toFixed(2);
        this.validateMatrix();
    }

    validateMatrix() {
        const m = this.getInputsMatrix();
        const det = m.a * m.d - m.b * m.c;
        const matrixBox = document.getElementById('base-matrix-box');

        if (Math.abs(det) < 1e-4) {
            setFieldState(matrixBox, 'warning', 'Determinante nulo: a transformação colapsa a área para 0 (não-inversível)');
        } else {
            setFieldState(matrixBox, 'valid', 'Transformação linear regular (área preservada ou deformada)');
        }
    }

    addCircle() {
        this.probeSurfaces.push({
            id: Date.now(),
            type: 'circle',
            cx: 1.5,
            cy: 1.5,
            size: 1.0,
            color: '#a855f7'
        });
        this.plano.probeSurfaces = this.probeSurfaces;
        this.plano.draw();
    }

    addSquare() {
        this.probeSurfaces.push({
            id: Date.now(),
            type: 'square',
            cx: -1.5,
            cy: 1.5,
            size: 1.4,
            color: '#22c55e'
        });
        this.plano.probeSurfaces = this.probeSurfaces;
        this.plano.draw();
    }

    clearSurfaces() {
        this.probeSurfaces = [];
        this.plano.probeSurfaces = this.probeSurfaces;
        this.plano.draw();
    }

    applyPreset(name) {
        const rotGroup = document.getElementById('base-rotationGroup');
        if (rotGroup) rotGroup.style.display = (name === 'rotation') ? 'block' : 'none';

        switch (name) {
            case 'identity':
                this.targetMatrix = { a: 1, b: 0, c: 0, d: 1 };
                break;
            case 'shearX':
                this.targetMatrix = { a: 1, b: 1, c: 0, d: 1 };
                break;
            case 'shearY':
                this.targetMatrix = { a: 1, b: 0, c: 1, d: 1 };
                break;
            case 'shearInv':
                this.targetMatrix = { a: 1, b: -1, c: 0, d: 1 };
                break;
            case 'scale':
                this.targetMatrix = { a: 2, b: 0, c: 0, d: 1.5 };
                break;
            case 'rotation':
                this.updateRotationPreset();
                return;
            case 'reflectX':
                this.targetMatrix = { a: 1, b: 0, c: 0, d: -1 };
                break;
            case 'reflectY':
                this.targetMatrix = { a: -1, b: 0, c: 0, d: 1 };
                break;
            case 'reflectDiag':
                this.targetMatrix = { a: 0, b: 1, c: 1, d: 0 };
                break;
            case 'projection':
                this.targetMatrix = { a: 1, b: 0, c: 0, d: 0 };
                break;
            case 'inversion':
                this.targetMatrix = { a: -1, b: 0, c: 0, d: -1 };
                break;
        }

        this.setInputsMatrix(this.targetMatrix);
        if (this.dom.btnApply) setFieldState(this.dom.btnApply, 'ready', 'Pronto para animar');
    }

    updateRotationPreset() {
        const { rotSlider } = this.dom;
        const rotVal = document.getElementById('base-rotVal');
        const deg = parseFloat(rotSlider?.value || 45);
        if (rotVal) rotVal.textContent = `${deg}°`;

        const rad = deg * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        this.targetMatrix = {
            a: cos,
            b: -sin,
            c: sin,
            d: cos
        };

        this.setInputsMatrix(this.targetMatrix);
        if (this.dom.btnApply) setFieldState(this.dom.btnApply, 'ready');
    }

    triggerAnimation() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);

        this.startMatrix = {
            a: this.plano.iHat.x,
            b: this.plano.jHat.x,
            c: this.plano.iHat.y,
            d: this.plano.jHat.y
        };
        this.targetMatrix = this.getInputsMatrix();

        const duration = 900;
        const startTime = performance.now();
        this.isAnimating = true;

        const animateStep = (now) => {
            const elapsed = now - startTime;
            const p = Math.min(elapsed / duration, 1.0);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

            const a = this.startMatrix.a + (this.targetMatrix.a - this.startMatrix.a) * eased;
            const b = this.startMatrix.b + (this.targetMatrix.b - this.startMatrix.b) * eased;
            const c = this.startMatrix.c + (this.targetMatrix.c - this.startMatrix.c) * eased;
            const d = this.startMatrix.d + (this.targetMatrix.d - this.startMatrix.d) * eased;

            this.matrix = { a, b, c, d };
            this.plano.iHat = { x: a, y: c };
            this.plano.jHat = { x: b, y: d };

            this.updateReadouts(this.matrix);
            this.plano.draw();

            if (p < 1.0) {
                this.animRequestId = requestAnimationFrame(animateStep);
            } else {
                this.isAnimating = false;
                this.startMatrix = { ...this.targetMatrix };
                this.validateMatrix();
            }
        };

        this.animRequestId = requestAnimationFrame(animateStep);
    }

    updateReadouts(m) {
        const { valIx, valIy, valJx, valJy, detVal, detAreaText, detOrientText } = this.dom;
        const badgeDet = document.getElementById('badgeDetValue');
        const focusBadgeDet = document.getElementById('focus-badge-det');

        if (valIx) valIx.textContent = m.a.toFixed(2);
        if (valIy) valIy.textContent = m.c.toFixed(2);
        if (valJx) valJx.textContent = m.b.toFixed(2);
        if (valJy) valJy.textContent = m.d.toFixed(2);

        const det = m.a * m.d - m.b * m.c;
        const absDet = Math.abs(det);

        if (detVal) detVal.textContent = det.toFixed(2);
        if (badgeDet) badgeDet.textContent = `det(M) = ${det.toFixed(2)}`;
        if (focusBadgeDet) focusBadgeDet.textContent = `det(M) = ${det.toFixed(2)}`;

        if (detAreaText) {
            detAreaText.textContent = `${absDet.toFixed(2)}x (${absDet === 1 ? 'Preservada' : absDet > 1 ? 'Expandida' : absDet === 0 ? 'Colapsada' : 'Reduzida'})`;
        }

        if (detOrientText) {
            if (absDet < 0.001) {
                detOrientText.textContent = 'Colapsada (0D/1D)';
                detOrientText.className = 'sim-readout-value tone-purple';
            } else if (det < 0) {
                detOrientText.textContent = 'Invertida (Reflexão)';
                detOrientText.className = 'sim-readout-value tone-rose';
            } else {
                detOrientText.textContent = 'Preservada (+)';
                detOrientText.className = 'sim-readout-value tone-emerald';
            }
        }
    }

    mount() {
        this.plano.showVVec = false;
        this.plano.showVPrime = false;
        this.plano.showDisplacementVec = false;
        this.plano.showEigen = false;
        this.plano.showGhostGrid = this.dom.chkGhostGrid ? this.dom.chkGhostGrid.checked : true;
        this.plano.showDetArea = this.dom.chkDetArea ? this.dom.chkDetArea.checked : true;
        this.plano.showUnitCircle = this.dom.chkUnitCircle ? this.dom.chkUnitCircle.checked : true;
        this.plano.showBasisVectors = true;
        this.plano.allowedDragTargets = ['i', 'j', 'surface-center', 'surface-resize'];
        this.plano.customTransformFn = null;
        this.plano.probeSurfaces = this.probeSurfaces;

        this.matrix = this.getInputsMatrix();
        this.plano.iHat = { x: this.matrix.a, y: this.matrix.c };
        this.plano.jHat = { x: this.matrix.b, y: this.matrix.d };

        this.updateReadouts(this.matrix);
        this.validateMatrix();
        this.plano.draw();
    }

    unmount() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);
        this.plano.probeSurfaces = [];
    }
}
