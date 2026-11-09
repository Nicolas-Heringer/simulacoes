// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-modo-base.js
// Modo 1: Interpretação Geométrica e Imagens da Base Canônica
// =============================================================================

import { setFieldState, syncDualSlider } from '../sim-ui.js';

export class ModoBase {
    /**
     * @param {PlanoCartesiano} plano
     * @param {Object} domElements
     */
    constructor(plano, domElements) {
        this.plano = plano;
        this.dom = domElements;

        // Estado atual do espaço (canvas) vs Operador configurado (targetMatrix)
        this.matrix = { a: 1, b: 0, c: 0, d: 1 };
        this.startMatrix = { a: 1, b: 0, c: 0, d: 1 };
        this.targetMatrix = { a: 1, b: 0, c: 0, d: 1 };

        this.probeSurfaces = [];

        this.isAnimating = false;
        this.animRequestId = null;

        this.initDOM();
    }

    syncInputSymbolState(input) {
        if (!input) return;
        const wrap = input.closest('.matrix-input-wrap');
        if (wrap) {
            wrap.classList.toggle('has-value', input.value.trim() !== '');
        }
    }

    syncAllInputSymbolStates() {
        const { m11, m12, m21, m22 } = this.dom;
        [m11, m12, m21, m22].forEach(inp => this.syncInputSymbolState(inp));
    }

    initDOM() {
        const { m11, m12, m21, m22, btnApply, btnReset, presetSelect, rotSlider, chkGhostGrid, chkDetArea, chkUnitCircle } = this.dom;

        const onInputChange = (e) => {
            this.syncInputSymbolState(e.target);
            this.targetMatrix = this.getInputsMatrix();
            this.syncPresetSelectWithMatrix(this.targetMatrix);
            this.updateReadouts(this.targetMatrix);
            this.validateMatrix();
        };

        [m11, m12, m21, m22].forEach(input => {
            if (!input) return;
            input.addEventListener('input', onInputChange);
            input.addEventListener('blur', () => this.syncInputSymbolState(input));
        });

        // Hover nas células destaca a coluna correspondente no canvas
        const cellI = document.querySelectorAll('#base-matrix-box .cell-i');
        const cellJ = document.querySelectorAll('#base-matrix-box .cell-j');

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

        // Botão Aplicar na Barra Inferior: aplica o operador targetMatrix ao espaço
        if (btnApply) {
            btnApply.addEventListener('click', () => {
                this.targetMatrix = this.getInputsMatrix();
                this.updateReadouts(this.targetMatrix);

                // Se o espaço no canvas já estiver exatamente em targetMatrix (ex: logo após arrastar os vetores
                // ou após já ter aplicado), inicia da base canônica (1,0),(0,1) para exibir a animação da transformação
                const isAlreadyAtTarget =
                    Math.abs(this.plano.iHat.x - this.targetMatrix.a) < 1e-3 &&
                    Math.abs(this.plano.jHat.x - this.targetMatrix.b) < 1e-3 &&
                    Math.abs(this.plano.iHat.y - this.targetMatrix.c) < 1e-3 &&
                    Math.abs(this.plano.jHat.y - this.targetMatrix.d) < 1e-3;

                if (isAlreadyAtTarget) {
                    this.plano.iHat = { x: 1, y: 0 };
                    this.plano.jHat = { x: 0, y: 1 };
                }

                this.animateMatrixTransition(this.targetMatrix);
            });
        }

        // Botão Resetar na Barra Inferior: restaura suavemente apenas o espaço para a base canônica,
        // mantendo intactos o preset selecionado e os parâmetros do operador M
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.animateMatrixTransition({ a: 1, b: 0, c: 0, d: 1 });
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

        // Superfícies de prova (botões toggle ativáveis/desativáveis)
        const btnAddCircle = document.getElementById('base-btnAddCircle');
        const btnAddSquare = document.getElementById('base-btnAddSquare');

        if (btnAddCircle) {
            btnAddCircle.addEventListener('click', () => {
                const active = this.toggleSurface('circle');
                btnAddCircle.classList.toggle('active', active);
            });
        }
        if (btnAddSquare) {
            btnAddSquare.addEventListener('click', () => {
                const active = this.toggleSurface('square');
                btnAddSquare.classList.toggle('active', active);
            });
        }

        // Callback do plano interativo (arraste direto dos vetores i e j no canvas)
        this.handleTargetChange = (target, pos) => {
            if (target.type === 'i' || target.type === 'j') {
                if (target.type === 'i') {
                    this.plano.iHat = { x: pos.x, y: pos.y };
                } else {
                    this.plano.jHat = { x: pos.x, y: pos.y };
                }

                this.matrix = {
                    a: this.plano.iHat.x,
                    b: this.plano.jHat.x,
                    c: this.plano.iHat.y,
                    d: this.plano.jHat.y
                };
                this.targetMatrix = { ...this.matrix };
                this.startMatrix = { ...this.matrix };

                this.setInputsMatrix(this.matrix, false);
                this.syncPresetSelectWithMatrix(this.matrix);
            }
        };
    }

    parseCellInput(input, fallback) {
        if (!input || input.value.trim() === '') return fallback;
        const val = parseFloat(input.value);
        return Number.isNaN(val) ? fallback : val;
    }

    getInputsMatrix() {
        const { m11, m12, m21, m22 } = this.dom;
        return {
            a: this.parseCellInput(m11, 1),
            b: this.parseCellInput(m12, 0),
            c: this.parseCellInput(m21, 0),
            d: this.parseCellInput(m22, 1)
        };
    }

    setInputsMatrix(m, symbolic = false) {
        const { m11, m12, m21, m22 } = this.dom;
        if (symbolic) {
            [m11, m12, m21, m22].forEach(inp => {
                if (inp) inp.value = '';
            });
        } else {
            const fmt = (v) => Number(v.toFixed(2)).toString();
            if (m11) m11.value = fmt(m.a);
            if (m12) m12.value = fmt(m.b);
            if (m21) m21.value = fmt(m.c);
            if (m22) m22.value = fmt(m.d);
        }
        this.syncAllInputSymbolStates();
        this.updateReadouts(m);
        this.validateMatrix();
    }

    validateMatrix() {
        const m = this.getInputsMatrix();
        const det = m.a * m.d - m.b * m.c;
        const matrixBox = document.getElementById('base-matrix-box');

        if (Math.abs(det) < 1e-4) {
            setFieldState(matrixBox, 'warning', 'Determinante nulo: a transformação colapsa a área para 0 (não-inversível)');
        } else {
            setFieldState(matrixBox, null, '');
        }
    }

    toggleSurface(type) {
        const idx = this.probeSurfaces.findIndex(s => s.type === type);
        if (idx >= 0) {
            this.probeSurfaces.splice(idx, 1);
            this.plano.probeSurfaces = this.probeSurfaces;
            this.plano.draw();
            return false;
        }

        if (type === 'circle') {
            this.probeSurfaces.push({
                id: Date.now(),
                type: 'circle',
                cx: 1.5,
                cy: 1.5,
                size: 1.0,
                color: '#a855f7'
            });
        } else if (type === 'square') {
            this.probeSurfaces.push({
                id: Date.now(),
                type: 'square',
                cx: -1.5,
                cy: 1.5,
                size: 1.4,
                color: '#22c55e'
            });
        }

        this.plano.probeSurfaces = this.probeSurfaces;
        this.plano.draw();
        return true;
    }

    /**
     * Verifica se a matriz m coincide com algum preset conhecido; caso contrário, seleciona 'custom' (Personalizado / Manual)
     */
    syncPresetSelectWithMatrix(m) {
        const { presetSelect } = this.dom;
        if (!presetSelect) return;

        const eq = (x, y) => Math.abs(x - y) < 1e-3;
        const match = (a, b, c, d) => eq(m.a, a) && eq(m.b, b) && eq(m.c, c) && eq(m.d, d);

        let detected = 'custom';
        if (match(1, 0, 0, 1)) detected = 'identity';
        else if (match(1, 1, 0, 1)) detected = 'shearX';
        else if (match(1, 0, 1, 1)) detected = 'shearY';
        else if (match(1, -1, 0, 1)) detected = 'shearInv';
        else if (match(2, 0, 0, 1.5)) detected = 'scale';
        else if (match(1, 0, 0, -1)) detected = 'reflectX';
        else if (match(-1, 0, 0, 1)) detected = 'reflectY';
        else if (match(0, 1, 1, 0)) detected = 'reflectDiag';
        else if (match(1, 0, 0, 0)) detected = 'projection';
        else if (match(-1, 0, 0, -1)) detected = 'inversion';

        if (presetSelect.value !== detected) {
            presetSelect.value = detected;
            const rotGroup = document.getElementById('base-rotationGroup');
            if (rotGroup) rotGroup.style.display = (detected === 'rotation') ? 'block' : 'none';
        }
    }

    applyPreset(name) {
        const rotGroup = document.getElementById('base-rotationGroup');
        if (rotGroup) rotGroup.style.display = (name === 'rotation') ? 'block' : 'none';

        if (name === 'identity') {
            this.targetMatrix = { a: 1, b: 0, c: 0, d: 1 };
            this.setInputsMatrix(this.targetMatrix, true);
            return;
        }

        switch (name) {
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

        this.setInputsMatrix(this.targetMatrix, false);
    }

    updateRotationPreset() {
        const { rotSlider } = this.dom;
        const deg = parseFloat(rotSlider?.value || 45);
        const rad = deg * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        this.targetMatrix = {
            a: cos,
            b: -sin,
            c: sin,
            d: cos
        };

        this.setInputsMatrix(this.targetMatrix, false);
    }

    /**
     * Anima suavemente o espaço cartesiano do estado atual até destMatrix
     */
    animateMatrixTransition(destMatrix) {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);

        this.startMatrix = {
            a: this.plano.iHat.x,
            b: this.plano.jHat.x,
            c: this.plano.iHat.y,
            d: this.plano.jHat.y
        };

        const duration = 750;
        const startTime = performance.now();
        this.isAnimating = true;

        const animateStep = (now) => {
            const elapsed = now - startTime;
            const p = Math.min(elapsed / duration, 1.0);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

            const a = this.startMatrix.a + (destMatrix.a - this.startMatrix.a) * eased;
            const b = this.startMatrix.b + (destMatrix.b - this.startMatrix.b) * eased;
            const c = this.startMatrix.c + (destMatrix.c - this.startMatrix.c) * eased;
            const d = this.startMatrix.d + (destMatrix.d - this.startMatrix.d) * eased;

            this.matrix = { a, b, c, d };
            this.plano.iHat = { x: a, y: c };
            this.plano.jHat = { x: b, y: d };

            this.plano.draw();

            if (p < 1.0) {
                this.animRequestId = requestAnimationFrame(animateStep);
            } else {
                this.isAnimating = false;
                this.startMatrix = { ...destMatrix };
            }
        };

        this.animRequestId = requestAnimationFrame(animateStep);
    }

    updateReadouts(m) {
        const { detVal, detAreaText, detOrientText } = this.dom;
        const badgeDet = document.getElementById('badgeDetValue');
        const focusBadgeDet = document.getElementById('focus-badge-det');

        const det = m.a * m.d - m.b * m.c;
        const absDet = Math.abs(det);

        if (detVal) detVal.textContent = det.toFixed(2);
        if (badgeDet) badgeDet.textContent = `det(M) = ${det.toFixed(2)}`;
        if (focusBadgeDet) focusBadgeDet.textContent = `det(M) = ${det.toFixed(2)}`;

        if (detAreaText) {
            detAreaText.textContent = `${absDet.toFixed(2)}x (${Math.abs(absDet - 1) < 1e-3 ? 'Preservada' : absDet > 1 ? 'Expandida' : absDet < 1e-4 ? 'Colapsada' : 'Reduzida'})`;
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
        this.plano.showGrid = false;
        this.plano.showVVec = false;
        this.plano.showVPrime = false;
        this.plano.showDisplacementVec = false;
        this.plano.showEigen = false;
        this.plano.showGhostBasisVectors = false;
        this.plano.iHatStart = { x: 1, y: 0 };
        this.plano.jHatStart = { x: 0, y: 1 };
        this.plano.basisLabels = { i: "î'", j: "ĵ'" };
        this.plano.showGhostGrid = this.dom.chkGhostGrid ? this.dom.chkGhostGrid.checked : true;
        this.plano.showDetArea = this.dom.chkDetArea ? this.dom.chkDetArea.checked : true;
        this.plano.showUnitCircle = this.dom.chkUnitCircle ? this.dom.chkUnitCircle.checked : true;
        this.plano.showTransformedGrid = true;
        this.plano.showBasisVectors = true;
        this.plano.allowedDragTargets = ['i', 'j', 'surface-center', 'surface-resize'];
        this.plano.customTransformFn = null;
        this.plano.probeSurfaces = this.probeSurfaces;
        this.plano.onTargetChange = this.handleTargetChange;

        this.plano.iHat = { x: this.matrix.a, y: this.matrix.c };
        this.plano.jHat = { x: this.matrix.b, y: this.matrix.d };

        this.targetMatrix = this.getInputsMatrix();
        this.syncAllInputSymbolStates();
        this.updateReadouts(this.targetMatrix);
        this.validateMatrix();
        this.plano.draw();
    }

    unmount() {
        if (this.isAnimating) cancelAnimationFrame(this.animRequestId);
        this.plano.probeSurfaces = [];
        this.plano.onTargetChange = null;
    }
}
