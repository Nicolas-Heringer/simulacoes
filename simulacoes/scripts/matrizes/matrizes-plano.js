// =============================================================================
// Autor: Nicolas Heringer
// Projeto: Simulações Matemáticas & Científicas (Design System 2.0)
// Arquivo: matrizes-plano.js
// Classe compartilhada de Plano Cartesiano 2D, renderização e geometria
// =============================================================================

export class PlanoCartesiano {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} [options]
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.id = options.id || 'plano';

        // Vetores da base no estado atual (em unidades matemáticas)
        this.iHat = { x: 1, y: 0 };
        this.jHat = { x: 0, y: 1 };

        // Vetores de prova opcionais
        this.vVec = { x: 2, y: 1 };
        this.vPrime = null; // Se definido externamente ou calculado
        this.showVVec = false;
        this.showVPrime = false;
        this.showDisplacementVec = false; // Vetor d = v' - v

        // Base inicial de referência (usada para ghost grid e referência no Modo 2)
        this.iHatStart = { x: 1, y: 0 };
        this.jHatStart = { x: 0, y: 1 };
        this.showGhostBasisVectors = false;
        this.basisLabels = { i: "î'", j: "ĵ'" };

        // Autovetores e análise espectral
        this.showEigen = false;
        this.currentAnalysis = null;

        // Configurações de exibição de grade
        this.showGrid = false;
        this.showGhostGrid = true; // Grade fantasma de referência (inicial/canônica)
        this.showDetArea = false;
        this.showUnitCircle = false;
        this.showTransformedGrid = true;
        this.showBasisVectors = true;

        // Função de mapeamento personalizada para deformações não-lineares: (x, y) => {x, y}
        this.customTransformFn = null;

        // Superfícies de prova (Modo 3 e Modo 1)
        this.probeSurfaces = []; // Array de { id, type: 'circle'|'square', cx, cy, size, color }

        // Escala e limites
        this.scale = 50; // pixels por unidade matemática
        this.gridRange = 14;
        this.origin = { x: canvas.width / 2, y: canvas.height / 2 };

        // Interatividade
        this.isInteractive = options.interactive !== false;
        this.draggingTarget = null;
        this.hoverTarget = null;
        this.dragRadius = 18;
        this.allowedDragTargets = options.allowedDragTargets || ['i', 'j', 'v'];

        // Callbacks de interação
        this.onTargetChange = null; // (targetName, mathPos) => void
        this.onDragEnd = null; // () => void

        this.initPointerEvents();
    }

    /**
     * Redimensiona o canvas com suporte a Retina / High-DPI
     */
    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
        this.origin = { x: rect.width / 2, y: rect.height / 2 };

        if (rect.width < 500) {
            this.scale = 36;
            this.gridRange = 10;
        } else if (rect.width < 800) {
            this.scale = 44;
            this.gridRange = 12;
        } else {
            this.scale = 52;
            this.gridRange = 14;
        }
    }

    /**
     * Converte coordenadas matemáticas (x, y) para coordenadas de tela (pixel)
     */
    toScreen(mathX, mathY) {
        return {
            x: this.origin.x + mathX * this.scale,
            y: this.origin.y - mathY * this.scale
        };
    }

    /**
     * Converte coordenadas de tela (pixel) para coordenadas matemáticas (x, y)
     */
    toMath(screenX, screenY) {
        return {
            x: (screenX - this.origin.x) / this.scale,
            y: (this.origin.y - screenY) / this.scale
        };
    }

    /**
     * Aplica o mapeamento a um ponto (x, y) matemático
     */
    transformPoint(x, y) {
        if (this.customTransformFn) {
            return this.customTransformFn(x, y);
        }
        return {
            x: x * this.iHat.x + y * this.jHat.x,
            y: x * this.iHat.y + y * this.jHat.y
        };
    }

    /**
     * Desenha a cena completa
     */
    draw() {
        if (!this.ctx || !this.width) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Grade de fundo neutra
        if (this.showGrid) {
            this.drawBackgroundGrid();
        }

        // 2. Grade Fantasma da base inicial/canônica
        if (this.showGhostGrid) {
            this.drawGhostGrid();
        }

        // 3. Área do determinante (paralelogramo de i e j)
        if (this.showDetArea) {
            this.drawDeterminantArea();
        }

        // 4. Círculo unitário transformado
        if (this.showUnitCircle) {
            this.drawTransformedUnitCircle();
        }

        // 5. Superfícies de prova (originais e deformadas)
        if (this.probeSurfaces.length > 0) {
            this.drawProbeSurfaces();
        }

        // 6. Grade transformada
        if (this.showTransformedGrid) {
            this.drawTransformedGrid();
        }

        // 7. Eixos transformados
        this.drawTransformedAxes();

        // 8. Eixos invariantes de autovetores
        if (this.showEigen && this.currentAnalysis && this.currentAnalysis.isReal) {
            this.drawEigenAxes();
        }

        // 9. Vetor de prova original e transformado + vetor deslocamento
        this.drawVectors();

        // 10. Vetores da base i e j
        if (this.showBasisVectors) {
            this.drawBasisVectors();
        }

        // 11. Ponto de origem (0, 0)
        this.drawOriginMarker();

        // 12. Tooltip de coordenadas ao arrastar (feedback de alta precisão)
        if (this.draggingTarget) {
            this.drawDragTooltip();
        }
    }

    /**
     * Tooltip flutuante de coordenadas em tempo real durante arrasto
     */
    drawDragTooltip() {
        const ctx = this.ctx;
        const target = this.draggingTarget;
        if (!target) return;

        let screenPt = null;
        let text = '';
        let badgeColor = '#38bdf8';

        if (target.type === 'i') {
            screenPt = this.toScreen(this.iHat.x, this.iHat.y);
            text = `î: (${this.iHat.x.toFixed(1)}, ${this.iHat.y.toFixed(1)})`;
            badgeColor = '#38bdf8';
        } else if (target.type === 'j') {
            screenPt = this.toScreen(this.jHat.x, this.jHat.y);
            text = `ĵ: (${this.jHat.x.toFixed(1)}, ${this.jHat.y.toFixed(1)})`;
            badgeColor = '#facc15';
        } else if (target.type === 'v') {
            screenPt = this.toScreen(this.vVec.x, this.vVec.y);
            text = `v: (${this.vVec.x.toFixed(1)}, ${this.vVec.y.toFixed(1)})`;
            badgeColor = '#38bdf8';
        } else if (target.type === 'vPrime' && this.vPrime) {
            screenPt = this.toScreen(this.vPrime.x, this.vPrime.y);
            text = `v': (${this.vPrime.x.toFixed(1)}, ${this.vPrime.y.toFixed(1)})`;
            badgeColor = '#facc15';
        } else if (target.type === 'surface-center') {
            const surf = this.probeSurfaces[target.index];
            if (!surf) return;
            screenPt = this.toScreen(surf.cx, surf.cy);
            text = `centro: (${surf.cx.toFixed(1)}, ${surf.cy.toFixed(1)})`;
            badgeColor = surf.type === 'circle' ? '#a855f7' : '#22c55e';
        } else if (target.type === 'surface-resize') {
            const surf = this.probeSurfaces[target.index];
            if (!surf) return;
            screenPt = surf.type === 'circle'
                ? this.toScreen(surf.cx + surf.size, surf.cy)
                : this.toScreen(surf.cx + surf.size / 2, surf.cy + surf.size / 2);
            text = surf.type === 'circle' ? `r = ${surf.size.toFixed(1)}` : `lado = ${surf.size.toFixed(1)}`;
            badgeColor = surf.type === 'circle' ? '#a855f7' : '#22c55e';
        }

        if (!screenPt || !text) return;

        ctx.save();
        ctx.font = '600 11px Inter, sans-serif';
        const paddingX = 8;
        const textMetrics = ctx.measureText(text);
        const boxW = textMetrics.width + paddingX * 2;
        const boxH = 22;

        let boxX = screenPt.x + 12;
        let boxY = screenPt.y - 30;

        if (boxX + boxW > this.width - 8) boxX = screenPt.x - boxW - 12;
        if (boxY < 8) boxY = screenPt.y + 16;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(boxX, boxY, boxW, boxH, 4);
        } else {
            ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxX + paddingX, boxY + boxH / 2);
        ctx.restore();
    }

    /**
     * Retorna o raio máximo visível da tela a partir da origem em unidades matemáticas,
     * além dos limites dinâmicos para que retas e grades sempre preencham a tela inteira.
     */
    getDynamicGridBounds(uVec, vVec) {
        const w = this.width || 800;
        const h = this.height || 600;
        const maxDistPx = Math.hypot(
            Math.max(this.origin.x, w - this.origin.x),
            Math.max(this.origin.y, h - this.origin.y)
        );
        const maxViewRadius = (maxDistPx / (this.scale || 50)) + 2;

        const normU = Math.hypot(uVec.x, uVec.y);
        const normV = Math.hypot(vVec.x, vVec.y);
        const det = Math.abs(uVec.x * vVec.y - uVec.y * vVec.x);

        // Perp spacing: distância entre linhas paralelas a V é det / ||V||
        // distância entre linhas paralelas a U é det / ||U||
        const spacingAlongU = det > 1e-3 && normV > 1e-4 ? (det / normV) : Math.max(normU, 0.25);
        const spacingAlongV = det > 1e-3 && normU > 1e-4 ? (det / normU) : Math.max(normV, 0.25);

        // Quantidade de linhas paralelas necessárias para cobrir o viewport (teto de 65 para evitar saturação visual)
        const countU = Math.min(65, Math.max(this.gridRange, Math.ceil(maxViewRadius / Math.max(spacingAlongU, 0.12)) + 2));
        const countV = Math.min(65, Math.max(this.gridRange, Math.ceil(maxViewRadius / Math.max(spacingAlongV, 0.12)) + 2));

        // Alcance de extensão de cada reta (garante que cada reta atravesse toda a tela como reta infinita)
        const reachU = normU > 1e-4 ? Math.max(countU, Math.ceil((maxViewRadius * 2.5) / normU) + countV) : this.gridRange;
        const reachV = normV > 1e-4 ? Math.max(countV, Math.ceil((maxViewRadius * 2.5) / normV) + countU) : this.gridRange;

        return { maxViewRadius, countU, countV, reachU, reachV };
    }

    /**
     * Grade neutra do plano cartesiano
     */
    drawBackgroundGrid() {
        const ctx = this.ctx;
        const { maxViewRadius } = this.getDynamicGridBounds({ x: 1, y: 0 }, { x: 0, y: 1 });
        const R = Math.ceil(maxViewRadius);

        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';

        for (let i = -R; i <= R; i++) {
            const p1 = this.toScreen(i, -R);
            const p2 = this.toScreen(i, R);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            const p3 = this.toScreen(-R, i);
            const p4 = this.toScreen(R, i);
            ctx.beginPath();
            ctx.moveTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Grade fantasma original (tracejada suave)
     */
    drawGhostGrid() {
        const ctx = this.ctx;
        const { countU, countV, reachU, reachV } = this.getDynamicGridBounds(this.iHatStart, this.jHatStart);

        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';

        // Retas paralelas a jHatStart (variando ao longo de iHatStart)
        for (let i = -countU; i <= countU; i++) {
            const p1 = this.toScreen(i * this.iHatStart.x - reachV * this.jHatStart.x, i * this.iHatStart.y - reachV * this.jHatStart.y);
            const p2 = this.toScreen(i * this.iHatStart.x + reachV * this.jHatStart.x, i * this.iHatStart.y + reachV * this.jHatStart.y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Retas paralelas a iHatStart (variando ao longo de jHatStart)
        for (let j = -countV; j <= countV; j++) {
            const p3 = this.toScreen(-reachU * this.iHatStart.x + j * this.jHatStart.x, -reachU * this.iHatStart.y + j * this.jHatStart.y);
            const p4 = this.toScreen(reachU * this.iHatStart.x + j * this.jHatStart.x, reachU * this.iHatStart.y + j * this.jHatStart.y);
            ctx.beginPath();
            ctx.moveTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Área do paralelogramo unitário (determinante)
     */
    drawDeterminantArea() {
        const ctx = this.ctx;
        const o = this.toScreen(0, 0);
        const i = this.toScreen(this.iHat.x, this.iHat.y);
        const j = this.toScreen(this.jHat.x, this.jHat.y);
        const ij = this.toScreen(this.iHat.x + this.jHat.x, this.iHat.y + this.jHat.y);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(i.x, i.y);
        ctx.lineTo(ij.x, ij.y);
        ctx.lineTo(j.x, j.y);
        ctx.closePath();

        ctx.fillStyle = 'rgba(250, 204, 21, 0.16)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Círculo unitário transformado (elipse de deformação)
     */
    drawTransformedUnitCircle() {
        const ctx = this.ctx;
        const steps = 72;
        ctx.save();
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
            const angle = (s / steps) * Math.PI * 2;
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const trans = this.transformPoint(ux, uy);
            const pt = this.toScreen(trans.x, trans.y);
            if (s === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Grade transformada (linear ou não-linear via polilinhas densas)
     */
    drawTransformedGrid() {
        const ctx = this.ctx;
        const range = this.gridRange;
        const isNonLinear = !!this.customTransformFn;

        ctx.save();
        ctx.lineWidth = 1;

        if (!isNonLinear) {
            const { countU, countV, reachU, reachV } = this.getDynamicGridBounds(this.iHat, this.jHat);

            // Retas paralelas a iHat (variando y ao longo de jHat)
            for (let y = -countV; y <= countV; y++) {
                if (y === 0) continue;
                const p1 = this.toScreen(-reachU * this.iHat.x + y * this.jHat.x, -reachU * this.iHat.y + y * this.jHat.y);
                const p2 = this.toScreen(reachU * this.iHat.x + y * this.jHat.x, reachU * this.iHat.y + y * this.jHat.y);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.12)';
                ctx.stroke();
            }

            // Retas paralelas a jHat (variando x ao longo de iHat)
            for (let x = -countU; x <= countU; x++) {
                if (x === 0) continue;
                const p1 = this.toScreen(x * this.iHat.x - reachV * this.jHat.x, x * this.iHat.y - reachV * this.jHat.y);
                const p2 = this.toScreen(x * this.iHat.x + reachV * this.jHat.x, x * this.iHat.y + reachV * this.jHat.y);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
                ctx.stroke();
            }
        } else {
            // Amostragem densa para transformações que curvam o espaço
            const { maxViewRadius } = this.getDynamicGridBounds({ x: 1, y: 0 }, { x: 0, y: 1 });
            const R = Math.max(range, Math.ceil(maxViewRadius));
            const samples = 44;
            for (let y = -R; y <= R; y += 1) {
                if (y === 0) continue;
                ctx.beginPath();
                for (let k = 0; k <= samples; k++) {
                    const mathX = -R + (k / samples) * (2 * R);
                    const pt = this.transformPoint(mathX, y);
                    const scr = this.toScreen(pt.x, pt.y);
                    if (k === 0) ctx.moveTo(scr.x, scr.y);
                    else ctx.lineTo(scr.x, scr.y);
                }
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.15)';
                ctx.stroke();
            }

            for (let x = -R; x <= R; x += 1) {
                if (x === 0) continue;
                ctx.beginPath();
                for (let k = 0; k <= samples; k++) {
                    const mathY = -R + (k / samples) * (2 * R);
                    const pt = this.transformPoint(x, mathY);
                    const scr = this.toScreen(pt.x, pt.y);
                    if (k === 0) ctx.moveTo(scr.x, scr.y);
                    else ctx.lineTo(scr.x, scr.y);
                }
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    /**
     * Eixos coordenados transformados
     */
    drawTransformedAxes() {
        const ctx = this.ctx;
        const range = this.gridRange;
        const isNonLinear = !!this.customTransformFn;

        ctx.save();
        ctx.lineWidth = 2;

        if (!isNonLinear) {
            const { reachU, reachV } = this.getDynamicGridBounds(this.iHat, this.jHat);

            // Eixo X (i)
            let p1 = this.toScreen(-reachU * this.iHat.x, -reachU * this.iHat.y);
            let p2 = this.toScreen(reachU * this.iHat.x, reachU * this.iHat.y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
            ctx.stroke();

            // Eixo Y (j)
            p1 = this.toScreen(-reachV * this.jHat.x, -reachV * this.jHat.y);
            p2 = this.toScreen(reachV * this.jHat.x, reachV * this.jHat.y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.stroke();
        } else {
            // Eixos curvos amostrados
            const { maxViewRadius } = this.getDynamicGridBounds({ x: 1, y: 0 }, { x: 0, y: 1 });
            const R = Math.max(range, Math.ceil(maxViewRadius));
            const samples = 56;
            ctx.beginPath();
            for (let k = 0; k <= samples; k++) {
                const mathX = -R + (k / samples) * (2 * R);
                const pt = this.transformPoint(mathX, 0);
                const scr = this.toScreen(pt.x, pt.y);
                if (k === 0) ctx.moveTo(scr.x, scr.y);
                else ctx.lineTo(scr.x, scr.y);
            }
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
            ctx.stroke();

            ctx.beginPath();
            for (let k = 0; k <= samples; k++) {
                const mathY = -R + (k / samples) * (2 * R);
                const pt = this.transformPoint(0, mathY);
                const scr = this.toScreen(pt.x, pt.y);
                if (k === 0) ctx.moveTo(scr.x, scr.y);
                else ctx.lineTo(scr.x, scr.y);
            }
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Eixos de autovetores invariantes reais
     */
    drawEigenAxes() {
        if (!this.currentAnalysis?.eigenvectors) return;
        const ctx = this.ctx;
        const { maxViewRadius } = this.getDynamicGridBounds({ x: 1, y: 0 }, { x: 0, y: 1 });

        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';

        this.currentAnalysis.eigenvectors.forEach(v => {
            if (!v || (v[0] === 0 && v[1] === 0)) return;
            const norm = Math.hypot(v[0], v[1]) || 1;
            const R = (maxViewRadius * 1.5) / norm;
            const p1 = this.toScreen(-R * v[0], -R * v[1]);
            const p2 = this.toScreen(R * v[0], R * v[1]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    /**
     * Vetores de prova (v, v') e o vetor deslocamento d = v' - v
     */
    drawVectors() {
        const originPx = this.toScreen(0, 0);

        if (this.showVVec && this.vVec) {
            const vPx = this.toScreen(this.vVec.x, this.vVec.y);

            // Vetor v inicial
            this.drawArrow(originPx, vPx, '#f472b6', 2.5);
            this.ctx.font = 'bold 13px Inter, sans-serif';
            this.ctx.fillStyle = '#f472b6';
            this.ctx.fillText('v⃗', vPx.x + 8, vPx.y - 8);

            if (this.hoverTarget?.type === 'v' || this.draggingTarget?.type === 'v') {
                this.drawHandle(vPx, '#f472b6');
            }
        }

        if (this.showVPrime && this.vPrime) {
            const vpPx = this.toScreen(this.vPrime.x, this.vPrime.y);

            // Se não estiver mostrando v sólido (ex: Etapa 2 e 3), desenha fantasma pontilhado de v quando referência fantasma está ativa
            if (!this.showVVec && this.vVec && (this.showGhostGrid || this.showDisplacementVec)) {
                const vOrigPx = this.toScreen(this.vVec.x, this.vVec.y);
                this.ctx.save();
                this.ctx.setLineDash([4, 4]);
                this.ctx.strokeStyle = 'rgba(244, 114, 182, 0.42)';
                this.ctx.lineWidth = 1.8;
                this.ctx.beginPath();
                this.ctx.moveTo(originPx.x, originPx.y);
                this.ctx.lineTo(vOrigPx.x, vOrigPx.y);
                this.ctx.stroke();
                this.ctx.fillStyle = 'rgba(244, 114, 182, 0.6)';
                this.ctx.font = '600 12px Inter, sans-serif';
                this.ctx.fillText('v⃗', vOrigPx.x + 6, vOrigPx.y - 6);
                this.ctx.restore();
            }

            // Vetor v' transformado
            this.drawArrow(originPx, vpPx, '#f472b6', 3.5);
            this.ctx.font = 'bold 13px Inter, sans-serif';
            this.ctx.fillStyle = '#f472b6';
            this.ctx.fillText("v⃗'", vpPx.x + 8, vpPx.y - 8);

            if (this.hoverTarget?.type === 'vPrime' || this.draggingTarget?.type === 'vPrime') {
                this.drawHandle(vpPx, '#f472b6');
            }

            // Vetor deslocamento d = v' - v (da ponta de v até a ponta de v')
            if (this.showDisplacementVec && this.vVec) {
                const vOrigPx = this.toScreen(this.vVec.x, this.vVec.y);

                // Seta de deslocamento d (Rose #f43f5e)
                this.drawArrow(vOrigPx, vpPx, '#f43f5e', 3);
                const midX = (vOrigPx.x + vpPx.x) / 2;
                const midY = (vOrigPx.y + vpPx.y) / 2;
                this.ctx.font = 'bold 12px Inter, sans-serif';
                this.ctx.fillStyle = '#f43f5e';
                this.ctx.fillText("d⃗ = v⃗' - v⃗", midX + 10, midY - 6);
            }
        }
    }

    /**
     * Vetores da base î e ĵ (e fantasmas da base inicial quando showGhostBasisVectors = true)
     */
    drawBasisVectors() {
        const originPx = this.toScreen(0, 0);

        // Fantasmas tracejados da base inicial (iHatStart, jHatStart) para referência espacial
        if (this.showGhostBasisVectors && this.iHatStart && this.jHatStart) {
            const iStartPx = this.toScreen(this.iHatStart.x, this.iHatStart.y);
            const jStartPx = this.toScreen(this.jHatStart.x, this.jHatStart.y);

            this.ctx.save();
            this.ctx.setLineDash([4, 4]);
            this.ctx.lineWidth = 2;

            // î inicial fantasma
            this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.38)';
            this.ctx.beginPath();
            this.ctx.moveTo(originPx.x, originPx.y);
            this.ctx.lineTo(iStartPx.x, iStartPx.y);
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
            this.ctx.font = '600 12px Inter, sans-serif';
            this.ctx.fillText('î', iStartPx.x + 6, iStartPx.y - 6);

            // ĵ inicial fantasma
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
            this.ctx.beginPath();
            this.ctx.moveTo(originPx.x, originPx.y);
            this.ctx.lineTo(jStartPx.x, jStartPx.y);
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
            this.ctx.fillText('ĵ', jStartPx.x + 6, jStartPx.y - 6);

            this.ctx.restore();
        }

        const iPx = this.toScreen(this.iHat.x, this.iHat.y);
        const jPx = this.toScreen(this.jHat.x, this.jHat.y);
        const labelI = this.basisLabels?.i || "î'";
        const labelJ = this.basisLabels?.j || "ĵ'";

        // î (Amarelo)
        this.drawArrow(originPx, iPx, '#facc15', 3.5);
        this.ctx.font = 'bold 14px Inter, sans-serif';
        this.ctx.fillStyle = '#facc15';
        this.ctx.fillText(labelI, iPx.x + 10, iPx.y - 8);

        if (this.hoverTarget?.type === 'i' || this.draggingTarget?.type === 'i') {
            this.drawHandle(iPx, '#facc15');
        }

        // ĵ (Ciano)
        this.drawArrow(originPx, jPx, '#38bdf8', 3.5);
        this.ctx.font = 'bold 14px Inter, sans-serif';
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText(labelJ, jPx.x + 10, jPx.y - 8);

        if (this.hoverTarget?.type === 'j' || this.draggingTarget?.type === 'j') {
            this.drawHandle(jPx, '#38bdf8');
        }
    }

    /**
     * Superfícies de prova (Círculo e Quadrado) originais e transformadas
     */
    drawProbeSurfaces() {
        const ctx = this.ctx;

        this.probeSurfaces.forEach((surf, index) => {
            const color = surf.color || '#a855f7';

            if (surf.type === 'circle') {
                const steps = 48;
                const origPoints = [];
                const transPoints = [];

                for (let k = 0; k <= steps; k++) {
                    const th = (k / steps) * Math.PI * 2;
                    const mx = surf.cx + surf.size * Math.cos(th);
                    const my = surf.cy + surf.size * Math.sin(th);
                    origPoints.push(this.toScreen(mx, my));
                    const tr = this.transformPoint(mx, my);
                    transPoints.push(this.toScreen(tr.x, tr.y));
                }

                // Forma original fantasma tracejada
                ctx.save();
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                origPoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.stroke();

                // Forma transformada preenchida
                ctx.setLineDash([]);
                ctx.beginPath();
                transPoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Centro e handle de redimensionamento
                const centerScr = this.toScreen(surf.cx, surf.cy);
                const handleScr = this.toScreen(surf.cx + surf.size, surf.cy);

                this.drawHandle(centerScr, color);
                this.drawHandle(handleScr, '#ffffff');

                ctx.font = '11px Inter, sans-serif';
                ctx.fillStyle = color;
                ctx.fillText(`Círculo ${index + 1}`, centerScr.x + 10, centerScr.y - 10);
                ctx.restore();
            } else if (surf.type === 'square') {
                const s = surf.size / 2;
                const corners = [
                    { x: surf.cx - s, y: surf.cy - s },
                    { x: surf.cx + s, y: surf.cy - s },
                    { x: surf.cx + s, y: surf.cy + s },
                    { x: surf.cx - s, y: surf.cy + s }
                ];

                const origPoints = corners.map(c => this.toScreen(c.x, c.y));
                const transPoints = corners.map(c => {
                    const tr = this.transformPoint(c.x, c.y);
                    return this.toScreen(tr.x, tr.y);
                });

                // Fantasma original
                ctx.save();
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                origPoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
                ctx.stroke();

                // Transformado
                ctx.setLineDash([]);
                ctx.beginPath();
                transPoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
                ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
                ctx.fill();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.stroke();

                const centerScr = this.toScreen(surf.cx, surf.cy);
                const handleScr = this.toScreen(surf.cx + s, surf.cy + s);

                this.drawHandle(centerScr, '#22c55e');
                this.drawHandle(handleScr, '#ffffff');

                ctx.font = '11px Inter, sans-serif';
                ctx.fillStyle = '#22c55e';
                ctx.fillText(`Quadrado ${index + 1}`, centerScr.x + 10, centerScr.y - 10);
                ctx.restore();
            }
        });
    }

    /**
     * Marcador da origem
     */
    drawOriginMarker() {
        const o = this.toScreen(0, 0);
        this.ctx.beginPath();
        this.ctx.arc(o.x, o.y, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();
    }

    /**
     * Seta estilizada com ponta de flecha
     */
    drawArrow(from, to, color, width) {
        const headLength = 12;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);
        const dist = Math.hypot(dx, dy);

        if (dist < 2) return;

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = width;

        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(to.x, to.y);
        this.ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    /**
     * Anel de captura interativa
     */
    drawHandle(point, color) {
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fill();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    /**
     * Identifica qual elemento interativo o ponteiro está sobrepondo
     */
    getHitTarget(screenX, screenY) {
        if (!this.isInteractive) return null;

        if (this.allowedDragTargets.includes('i')) {
            const iPx = this.toScreen(this.iHat.x, this.iHat.y);
            if (Math.hypot(screenX - iPx.x, screenY - iPx.y) <= this.dragRadius) {
                return { type: 'i' };
            }
        }

        if (this.allowedDragTargets.includes('j')) {
            const jPx = this.toScreen(this.jHat.x, this.jHat.y);
            if (Math.hypot(screenX - jPx.x, screenY - jPx.y) <= this.dragRadius) {
                return { type: 'j' };
            }
        }

        if (this.allowedDragTargets.includes('v') && this.showVVec && this.vVec) {
            const vPx = this.toScreen(this.vVec.x, this.vVec.y);
            if (Math.hypot(screenX - vPx.x, screenY - vPx.y) <= this.dragRadius) {
                return { type: 'v' };
            }
        }

        if (this.allowedDragTargets.includes('vPrime') && this.showVPrime && this.vPrime) {
            const vpPx = this.toScreen(this.vPrime.x, this.vPrime.y);
            if (Math.hypot(screenX - vpPx.x, screenY - vpPx.y) <= this.dragRadius) {
                return { type: 'vPrime' };
            }
        }

        // Superfícies de prova
        for (let i = 0; i < this.probeSurfaces.length; i++) {
            const surf = this.probeSurfaces[i];
            const cPx = this.toScreen(surf.cx, surf.cy);
            if (Math.hypot(screenX - cPx.x, screenY - cPx.y) <= this.dragRadius) {
                return { type: 'surface-center', index: i };
            }

            const hPx = surf.type === 'circle'
                ? this.toScreen(surf.cx + surf.size, surf.cy)
                : this.toScreen(surf.cx + surf.size / 2, surf.cy + surf.size / 2);
            if (Math.hypot(screenX - hPx.x, screenY - hPx.y) <= this.dragRadius) {
                return { type: 'surface-resize', index: i };
            }
        }

        return null;
    }

    /**
     * Inicializa eventos de toque e mouse unificados via PointerEvents
     */
    initPointerEvents() {
        const canvas = this.canvas;

        canvas.addEventListener('pointerdown', (e) => {
            if (!this.isInteractive) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const hit = this.getHitTarget(mouseX, mouseY);
            if (hit) {
                this.draggingTarget = hit;
                canvas.style.cursor = 'grabbing';
                try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!this.isInteractive) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (this.draggingTarget) {
                const mathPos = this.toMath(mouseX, mouseY);
                const roundedX = Math.round(mathPos.x * 20) / 20;
                const roundedY = Math.round(mathPos.y * 20) / 20;

                const target = this.draggingTarget;
                if (target.type === 'i') {
                    this.iHat = { x: roundedX, y: roundedY };
                } else if (target.type === 'j') {
                    this.jHat = { x: roundedX, y: roundedY };
                } else if (target.type === 'v') {
                    this.vVec = { x: roundedX, y: roundedY };
                } else if (target.type === 'vPrime') {
                    this.vPrime = { x: roundedX, y: roundedY };
                } else if (target.type === 'surface-center') {
                    const surf = this.probeSurfaces[target.index];
                    if (surf) {
                        surf.cx = roundedX;
                        surf.cy = roundedY;
                    }
                } else if (target.type === 'surface-resize') {
                    const surf = this.probeSurfaces[target.index];
                    if (surf) {
                        const dist = Math.hypot(mathPos.x - surf.cx, mathPos.y - surf.cy);
                        surf.size = Math.max(0.3, Math.min(6, Math.round(dist * 10) / 10));
                    }
                }

                if (typeof this.onTargetChange === 'function') {
                    this.onTargetChange(target, { x: roundedX, y: roundedY });
                }

                this.draw();
            } else {
                const hit = this.getHitTarget(mouseX, mouseY);
                const hitKey = hit ? `${hit.type}-${hit.index ?? ''}` : null;
                const currentHoverKey = this.hoverTarget ? `${this.hoverTarget.type}-${this.hoverTarget.index ?? ''}` : null;

                if (hitKey !== currentHoverKey) {
                    this.hoverTarget = hit;
                    canvas.style.cursor = hit ? 'grab' : 'default';
                    this.draw();
                }
            }
        });

        const endPointer = (e) => {
            if (this.draggingTarget) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                this.draggingTarget = null;
                canvas.style.cursor = this.hoverTarget ? 'grab' : 'default';
                if (typeof this.onDragEnd === 'function') {
                    this.onDragEnd();
                }
                this.draw();
            }
        };

        canvas.addEventListener('pointerup', endPointer);
        canvas.addEventListener('pointercancel', endPointer);
    }
}
