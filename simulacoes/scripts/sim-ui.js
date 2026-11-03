/**
 * =============================================================================
 * SIM-UI: Biblioteca de Componentes e Controladores do Design System
 * Autor: Nicolas Heringer
 * Projeto: Plataforma de Simulações Científicas e Matemáticas
 * Arquivo: sim-ui.js (100% Modular, Reutilizável e Desacoplado)
 * =============================================================================
 */

// --- CACHE GLOBAL DE ÍCONES SVG ---
const svgCache = new Map();

/**
 * Busca o conteúdo de um arquivo SVG e armazena em cache
 * @param {string} iconName - Nome do ícone em assets/icons/ (sem extensão)
 * @returns {Promise<string|null>}
 */
export async function getSVGContent(iconName) {
    const src = `../assets/icons/${iconName}.svg`;
    if (svgCache.has(src)) return svgCache.get(src);
    try {
        const res = await fetch(src);
        const text = await res.text();
        svgCache.set(src, text);
        return text;
    } catch (e) {
        return null;
    }
}

/**
 * Substitui ou insere um ícone SVG nativo dinamicamente mantendo currentColor
 * @param {HTMLElement} containerEl - Elemento container (ex: botão)
 * @param {string} iconName - Nome do ícone (sem .svg)
 */
export async function setElementIcon(containerEl, iconName) {
    const svgText = await getSVGContent(iconName);
    if (!svgText) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const newSvg = doc.querySelector('svg');
    if (!newSvg) return;
    newSvg.setAttribute('class', 'icon-svg');

    const existingIcon = containerEl.querySelector('.icon-svg');
    if (existingIcon) {
        existingIcon.replaceWith(newSvg);
    } else {
        containerEl.prepend(newSvg);
    }
}

/**
 * Transforma todas as tags <img> com class="icon-svg" em código SVG inline
 * permitindo que currentColor e variáveis CSS funcionem perfeitamente.
 */
export async function inlineSVGImages() {
    const images = document.querySelectorAll('img.icon-svg');
    for (const img of images) {
        const src = img.getAttribute('src');
        if (!src || !src.endsWith('.svg')) continue;

        let svgText;
        if (svgCache.has(src)) {
            svgText = svgCache.get(src);
        } else {
            try {
                const res = await fetch(src);
                svgText = await res.text();
                svgCache.set(src, svgText);
            } catch (e) {
                continue;
            }
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (svg) {
            svg.setAttribute('class', img.getAttribute('class') || 'icon-svg');
            if (img.id) svg.setAttribute('id', img.id);
            if (img.getAttribute('style')) svg.setAttribute('style', img.getAttribute('style'));
            img.replaceWith(svg);
        }
    }
}

/**
 * Altera a cor de acento global e sincroniza seletores visuais
 * @param {string} color - Cor hexadecimal ou CSS (ex: '#facc15')
 */
export function setGlobalAccent(color) {
    document.documentElement.style.setProperty('--accent-color', color);
    document.querySelectorAll('.theme-dot-btn, .toolbar-dot').forEach(d => {
        d.classList.toggle('active', d.getAttribute('data-color') === color);
    });
}

/**
 * Inicializa um botão de alternância binária (Toggle 0/1)
 * Gerencia classes .is-active, troca automática de rótulo e ícone, e dispara evento 'toggle'.
 * @param {HTMLElement|string} target - Seletor ou elemento do botão
 * @param {Function} [onToggleCallback] - Callback: (isActive, state, btnEl) => void
 * @returns {Object} Controlador com .toggle(), .setState(val), .getState(), .isActive()
 */
export function initToggleButton(target, onToggleCallback) {
    const btn = typeof target === 'string' ? document.querySelector(target) : target;
    if (!btn) return null;

    const textIdle = btn.getAttribute('data-text-idle') || 'Executar';
    const textActive = btn.getAttribute('data-text-active') || 'Pausar';
    const iconIdle = btn.getAttribute('data-icon-idle') || 'play';
    const iconActive = btn.getAttribute('data-icon-active') || 'pause';

    let state = parseInt(btn.getAttribute('data-state') || '0', 10);

    const renderState = async () => {
        const isActive = state === 1;
        btn.classList.toggle('is-active', isActive);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('data-state', `${state}`);
        btn.setAttribute('aria-pressed', `${isActive}`);

        const textSpan = btn.querySelector('.btn-text');
        if (textSpan) {
            textSpan.textContent = isActive ? textActive : textIdle;
        }

        await setElementIcon(btn, isActive ? iconActive : iconIdle);
    };

    btn.addEventListener('click', async (e) => {
        if (e.isTrigger) return;
        state = state === 0 ? 1 : 0;
        await renderState();

        btn.dispatchEvent(new CustomEvent('toggle', {
            detail: { active: state === 1, state: state },
            bubbles: true
        }));

        if (typeof onToggleCallback === 'function') {
            onToggleCallback(state === 1, state, btn);
        }
    });

    renderState();

    return {
        toggle: () => btn.click(),
        setState: async (newState) => {
            state = newState ? 1 : 0;
            await renderState();
        },
        getState: () => state,
        isActive: () => state === 1
    };
}

/**
 * Sincroniza bidirecionalmente um Slider (range) com um Input Numérico (Dual-Input)
 * Valida limites min/max no blur e atualiza fluidamente em tempo real.
 * @param {HTMLInputElement|string} sliderTarget - Seletor ou elemento do slider (range)
 * @param {HTMLInputElement|string} numTarget - Seletor ou elemento do input numérico
 * @param {Function} [onChangeCallback] - Callback: (value, sliderEl, numEl) => void
 * @returns {Object} Controlador com .getValue(), .setValue(val)
 */
export function syncDualSlider(sliderTarget, numTarget, onChangeCallback) {
    const slider = typeof sliderTarget === 'string' ? document.querySelector(sliderTarget) : sliderTarget;
    const numInput = typeof numTarget === 'string' ? document.querySelector(numTarget) : numTarget;
    if (!slider || !numInput) return null;

    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;

    const handleSliderInput = () => {
        const val = parseFloat(slider.value);
        numInput.value = Number.isInteger(val) ? val : parseFloat(val.toFixed(3));
        if (typeof onChangeCallback === 'function') {
            onChangeCallback(val, slider, numInput);
        }
    };

    const handleNumberInput = (e) => {
        let val = parseFloat(numInput.value);
        if (isNaN(val)) return;

        if (e.type === 'change' || e.type === 'blur') {
            if (val < min) val = min;
            if (val > max) val = max;
            numInput.value = Number.isInteger(val) ? val : parseFloat(val.toFixed(3));
        }

        slider.value = val;
        if (typeof onChangeCallback === 'function') {
            onChangeCallback(val, slider, numInput);
        }
    };

    slider.addEventListener('input', handleSliderInput);
    numInput.addEventListener('input', handleNumberInput);
    numInput.addEventListener('change', handleNumberInput);
    numInput.addEventListener('blur', handleNumberInput);

    return {
        getValue: () => parseFloat(slider.value),
        setValue: (val) => {
            slider.value = val;
            numInput.value = val;
            if (typeof onChangeCallback === 'function') {
                onChangeCallback(val, slider, numInput);
            }
        }
    };
}

/**
 * Classe controladora de Mini-Gráficos de Telemetria 2D em tempo real via HTML5 Canvas
 */
export class RealtimePlot {
    /**
     * @param {HTMLCanvasElement|string} canvasTarget - Elemento canvas ou seletor CSS
     * @param {Object} [options]
     * @param {number} [options.maxPoints=80] - Quantidade máxima de pontos no buffer
     * @param {number} [options.minVal=-1.0] - Limite inferior da escala
     * @param {number} [options.maxVal=1.0] - Limite superior da escala
     * @param {string} [options.color='#38bdf8'] - Cor de fallback
     */
    constructor(canvasTarget, options = {}) {
        this.canvas = typeof canvasTarget === 'string' ? document.querySelector(canvasTarget) : canvasTarget;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.maxPoints = options.maxPoints || 80;
        this.data = new Array(this.maxPoints).fill(0);
        this.color = options.color || '#38bdf8';
        this.minVal = options.minVal !== undefined ? options.minVal : -1.2;
        this.maxVal = options.maxVal !== undefined ? options.maxVal : 1.2;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        if (window.ResizeObserver && this.canvas.parentElement) {
            new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
        }
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    }

    push(val) {
        this.data.push(val);
        if (this.data.length > this.maxPoints) {
            this.data.shift();
        }
        this.render();
    }

    render() {
        if (!this.ctx || !this.width || !this.height) return;
        const { ctx, width, height, data } = this;

        ctx.clearRect(0, 0, width, height);

        // Grade Central Sutil
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        const currentMin = this.minVal;
        const currentMax = this.maxVal;
        const range = (currentMax - currentMin) || 1;
        const getY = (v) => height - ((v - currentMin) / range) * height;
        const stepX = width / (data.length - 1);

        // Curva
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = Math.max(2, Math.min(height - 2, getY(val)));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        // 1. Preenchimento de Área com Gradiente
        ctx.save();
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const strokeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-hud').trim() ||
                            getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() ||
                            this.color;

        const areaGrad = ctx.createLinearGradient(0, 0, 0, height);
        areaGrad.addColorStop(0, strokeColor.startsWith('#') ? `${strokeColor}44` : 'rgba(56, 189, 248, 0.25)');
        areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = areaGrad;
        ctx.fill();
        ctx.restore();

        // 2. Traço da Linha com Efeito Glow
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Classe controladora de Telemetria Multicanal e Espaço de Fase via HTML5 Canvas
 * Suporta múltiplas curvas simultâneas (ex: Cinética, Potencial, Total), auto-scaling,
 * eixos positivos/negativos (linha zero) e legendas dinâmicas.
 */
export class MultiSeriesPlot {
    /**
     * @param {HTMLCanvasElement|string} canvasTarget - Elemento canvas ou seletor CSS
     * @param {Object} [options]
     * @param {number} [options.maxPoints=100] - Pontos máximos no buffer
     * @param {string} [options.mode='time-series'] - 'time-series' ou 'phase-space'
     * @param {Array<Object>} [options.series] - Configuração das séries [{ id, label, color, unit }]
     * @param {number} [options.minVal] - Limite inferior manual (opcional)
     * @param {number} [options.maxVal] - Limite superior manual (opcional)
     * @param {boolean} [options.showLegend=true] - Exibir legenda dinâmica no topo
     * @param {boolean} [options.showGrid=true] - Exibir grade de referência
     */
    constructor(canvasTarget, options = {}) {
        this.canvas = typeof canvasTarget === 'string' ? document.querySelector(canvasTarget) : canvasTarget;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.maxPoints = options.maxPoints || 100;
        this.mode = options.mode || 'time-series';
        this.series = options.series || [
            { id: 'default', label: 'Série 1', color: '#38bdf8' }
        ];
        this.showLegend = options.showLegend !== false;
        this.showGrid = options.showGrid !== false;
        this.fixedMin = options.minVal !== undefined ? options.minVal : null;
        this.fixedMax = options.maxVal !== undefined ? options.maxVal : null;

        this.buffers = {};
        this.latestValues = {};
        this.series.forEach(s => {
            this.buffers[s.id] = [];
            this.latestValues[s.id] = 0;
        });
        this.phaseBuffer = [];

        this.width = 0;
        this.height = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        if (window.ResizeObserver && this.canvas.parentElement) {
            new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
        }
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    }

    push(dataRecord) {
        if (!dataRecord) return;
        this.series.forEach(s => {
            if (dataRecord[s.id] !== undefined) {
                const val = Number(dataRecord[s.id]);
                this.latestValues[s.id] = val;
                this.buffers[s.id].push(val);
                if (this.buffers[s.id].length > this.maxPoints) {
                    this.buffers[s.id].shift();
                }
            }
        });
        this.render();
    }

    pushPhasePoint(x, p) {
        this.phaseBuffer.push({ x: Number(x), p: Number(p) });
        if (this.phaseBuffer.length > this.maxPoints * 2) {
            this.phaseBuffer.shift();
        }
        this.render();
    }

    clear() {
        this.series.forEach(s => {
            this.buffers[s.id] = [];
            this.latestValues[s.id] = 0;
        });
        this.phaseBuffer = [];
        this.render();
    }

    render() {
        if (!this.ctx || !this.width || !this.height) return;
        const { ctx, width, height } = this;

        ctx.clearRect(0, 0, width, height);

        if (this.mode === 'phase-space') {
            this.renderPhaseSpace();
            return;
        }

        // --- Renderização Time-Series Multicanal ---
        let min = this.fixedMin !== null ? this.fixedMin : Infinity;
        let max = this.fixedMax !== null ? this.fixedMax : -Infinity;
        let hasData = false;

        this.series.forEach(s => {
            const buf = this.buffers[s.id];
            if (buf && buf.length > 0) {
                hasData = true;
                if (this.fixedMin === null || this.fixedMax === null) {
                    for (let i = 0; i < buf.length; i++) {
                        const v = buf[i];
                        if (this.fixedMin === null && v < min) min = v;
                        if (this.fixedMax === null && v > max) max = v;
                    }
                }
            }
        });

        if (!hasData || min === Infinity) {
            min = this.fixedMin !== null ? this.fixedMin : -1;
            max = this.fixedMax !== null ? this.fixedMax : 1;
        }

        if (min === max) {
            min -= 1;
            max += 1;
        }

        // Margem de respiro de 12%
        const span = max - min;
        const plotMin = min - span * 0.12;
        const plotMax = max + span * 0.12;
        const plotSpan = plotMax - plotMin;

        const getY = (v) => height - ((v - plotMin) / plotSpan) * height;

        // 1. Grade e Linha Zero
        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            const gridLines = 4;
            for (let i = 1; i < gridLines; i++) {
                const y = (height / gridLines) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Eixo zero destacado se estiver na faixa
            if (plotMin < 0 && plotMax > 0) {
                const zeroY = getY(0);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(0, zeroY);
                ctx.lineTo(width, zeroY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 2. Traçado das Séries
        this.series.forEach(s => {
            const buf = this.buffers[s.id];
            if (!buf || buf.length < 2) return;

            const stepX = width / (this.maxPoints - 1);
            const offsetIdx = this.maxPoints - buf.length;

            ctx.save();
            ctx.strokeStyle = s.color || '#38bdf8';
            ctx.lineWidth = 2;
            ctx.shadowColor = s.color || '#38bdf8';
            ctx.shadowBlur = 6;
            ctx.beginPath();

            for (let i = 0; i < buf.length; i++) {
                const x = (offsetIdx + i) * stepX;
                const y = Math.max(2, Math.min(height - 2, getY(buf[i])));
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        });

        // 3. Legenda Dinâmica no Topo
        if (this.showLegend) {
            ctx.save();
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            let legendX = 8;
            const legendY = 14;

            this.series.forEach(s => {
                const val = this.latestValues[s.id] !== undefined ? this.latestValues[s.id].toFixed(1) : '--';
                const text = `${s.label}: ${val}${s.unit || ''}`;

                // Marcador circular
                ctx.fillStyle = s.color || '#38bdf8';
                ctx.beginPath();
                ctx.arc(legendX + 4, legendY - 3, 3.5, 0, Math.PI * 2);
                ctx.fill();

                // Texto do rótulo
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fillText(text, legendX + 11, legendY);

                legendX += ctx.measureText(text).width + 16;
            });
            ctx.restore();
        }
    }

    renderPhaseSpace() {
        const { ctx, width, height, phaseBuffer } = this;
        if (!phaseBuffer || phaseBuffer.length < 2) return;

        let minX = Infinity, maxX = -Infinity;
        let minP = Infinity, maxP = -Infinity;
        for (let i = 0; i < phaseBuffer.length; i++) {
            const pt = phaseBuffer[i];
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.p < minP) minP = pt.p;
            if (pt.p > maxP) maxP = pt.p;
        }
        if (minX === maxX) { minX -= 1; maxX += 1; }
        if (minP === maxP) { minP -= 1; maxP += 1; }

        const spanX = (maxX - minX) * 1.15;
        const spanP = (maxP - minP) * 1.15;
        const midX = (minX + maxX) / 2;
        const midP = (minP + maxP) / 2;

        const getScreenX = (x) => width / 2 + ((x - midX) / spanX) * width;
        const getScreenY = (p) => height / 2 - ((p - midP) / spanP) * height;

        // Eixos de referência cruzados
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.stroke();

        // Trajetória no espaço de fase com fade temporal
        const total = phaseBuffer.length;
        for (let i = 1; i < total; i++) {
            const p0 = phaseBuffer[i - 1];
            const p1 = phaseBuffer[i];
            const alpha = 0.15 + 0.85 * (i / total);

            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(getScreenX(p0.x), getScreenY(p0.p));
            ctx.lineTo(getScreenX(p1.x), getScreenY(p1.p));
            ctx.stroke();
        }

        // Ponto atual
        const last = phaseBuffer[total - 1];
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(getScreenX(last.x), getScreenY(last.p), 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Inicializa um modal didático de diálogo ou teoria (.sim-modal-overlay)
 * Suporta fechamento por botão [data-modal-close], clique fora e tecla Esc.
 * @param {HTMLElement|string} modalTarget - Seletor ou elemento do modal
 * @returns {Object} Controlador com .open(), .close(), .toggle()
 */
export function initModal(modalTarget) {
    const modal = typeof modalTarget === 'string' ? document.querySelector(modalTarget) : modalTarget;
    if (!modal) return null;

    const open = () => {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (typeof initKaTeXAutoRender === 'function') {
            initKaTeXAutoRender(modal);
        } else if (window.renderMathInElement) {
            window.renderMathInElement(modal, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    };

    const close = () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    modal.querySelectorAll('[data-modal-close], .sim-modal-close').forEach(btn => {
        btn.addEventListener('click', close);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            close();
        }
    });

    return {
        open,
        close,
        toggle: () => modal.classList.contains('hidden') ? open() : close()
    };
}

/**
 * Inicializa o controle de recolhimento lateral da barra de controles (Modo Foco)
 * Executa transição suave com redimensionamento contínuo da cena WebGL/Three.js.
 * @param {Object} [options]
 * @param {string} [options.layoutSelector='.sim-layout']
 * @param {string} [options.collapseBtnSelector='#btn-collapse-sidebar']
 * @param {string} [options.expandBtnSelector='#btn-expand-sidebar']
 * @param {Function} [options.onResize] - Callback chamado durante o resize (ex: onWindowResize)
 * @returns {Object} Controlador com .collapse(), .expand(), .toggle(), .isCollapsed()
 */
export function initSidebarCollapse({
    layoutSelector = '.sim-layout',
    collapseBtnSelector = '#btn-collapse-sidebar',
    expandBtnSelector = '#btn-expand-sidebar',
    onResize
} = {}) {
    const layout = document.querySelector(layoutSelector);
    const btnCollapse = document.querySelector(collapseBtnSelector);
    const btnExpand = document.querySelector(expandBtnSelector);
    if (!layout) return null;

    const smoothResize = () => {
        const start = performance.now();
        const duration = 350;
        const tick = (now) => {
            if (typeof onResize === 'function') onResize();
            if (now - start < duration) {
                requestAnimationFrame(tick);
            } else {
                if (typeof onResize === 'function') onResize();
            }
        };
        requestAnimationFrame(tick);
    };

    const collapse = () => {
        if (window.innerWidth <= 900) return;
        layout.classList.add('sidebar-collapsed');
        smoothResize();
    };

    const expand = () => {
        if (window.innerWidth <= 900) return;
        layout.classList.remove('sidebar-collapsed');
        smoothResize();
    };

    const toggle = () => {
        if (window.innerWidth <= 900) return;
        layout.classList.toggle('sidebar-collapsed');
        smoothResize();
    };

    if (btnCollapse) {
        btnCollapse.addEventListener('click', () => {
            if (window.innerWidth > 900) collapse();
        });
    }
    if (btnExpand) {
        btnExpand.addEventListener('click', () => {
            if (window.innerWidth > 900) expand();
        });
    }

    // Atalho de Teclado: Tecla 'F' ou '[' para alternar o painel lateral no desktop
    document.addEventListener('keydown', (e) => {
        if (window.innerWidth <= 900) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'f' || e.key === 'F' || e.key === '[') {
            toggle();
        }
    });

    return {
        collapse,
        expand,
        toggle,
        isCollapsed: () => layout.classList.contains('sidebar-collapsed')
    };
}

/**
 * Inicializa a navegação de abas no Design System 2.0.
 * Sincroniza botões .tab-btn com os painéis .tab-pane ou .tab-content correspondentes
 * e executa auto-render do KaTeX na aba selecionada.
 * @param {HTMLElement|string} [root=document]
 * @param {Function} [onTabChange] - Callback opcional: (tabId) => void
 */
export function initTabs(root = document, onTabChange = null) {
    const el = typeof root === 'string' ? document.querySelector(root) : root;
    if (!el) return;

    const tabNavs = el.querySelectorAll('.tab-nav');
    tabNavs.forEach(nav => {
        const buttons = nav.querySelectorAll('.tab-btn');
        const panelContainer = nav.closest('.controls-panel')?.querySelector('.panel-body') || el;
        const panes = panelContainer.querySelectorAll('.tab-pane, .tab-content');

        const switchTab = (targetId) => {
            if (!targetId) return;

            buttons.forEach(b => {
                b.classList.toggle('active', b.dataset.tab === targetId);
            });

            panes.forEach(pane => {
                const matches = pane.id === targetId || pane.dataset.tab === targetId;
                if (matches) {
                    pane.classList.add('active');
                    pane.style.display = 'block';
                    if (typeof initKaTeXAutoRender === 'function') {
                        initKaTeXAutoRender(pane);
                    }
                } else {
                    pane.classList.remove('active');
                    pane.style.display = 'none';
                }
            });

            if (typeof onTabChange === 'function') {
                onTabChange(targetId);
            }

            el.dispatchEvent(new CustomEvent('tabchange', {
                detail: { tabId: targetId },
                bubbles: true
            }));
            document.dispatchEvent(new CustomEvent('tabchange', {
                detail: { tabId: targetId },
                bubbles: true
            }));
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });

        // Sincronização inicial da aba ativa no DOM
        const activeBtn = nav.querySelector('.tab-btn.active') || buttons[0];
        if (activeBtn && activeBtn.dataset.tab) {
            switchTab(activeBtn.dataset.tab);
        }
    });
}

/**
 * Inicializa o componente Bottom Sheet para telas móveis e tablets (<= 900px)
 * Gerencia snap points ('peek', 'half', 'expanded'), gestos touch e cliques nas abas.
 * @param {Object|string} [opts] - Opções ou seletor CSS do painel
 * @param {string} [opts.panelSelector='.controls-panel']
 * @param {string} [opts.handleSelector='.sheet-drag-handle']
 * @param {string} [opts.tabNavSelector='.tab-nav']
 * @param {string} [opts.collapseBtnSelector='.btn-collapse-sidebar']
 * @param {string} [opts.defaultState='peek'] - 'peek' | 'half' | 'expanded'
 * @param {Function} [opts.onStateChange] - Callback: (state) => void
 * @returns {Object} Controlador com .setState(state), .getState(), .toggle()
 */
export function initBottomSheet(opts = {}) {
    const options = typeof opts === 'string' ? { panelSelector: opts } : (opts || {});
    const {
        panelSelector = '.controls-panel',
        handleSelector = '.sheet-drag-handle',
        tabNavSelector = '.tab-nav',
        collapseBtnSelector = '.btn-collapse-sidebar',
        defaultState = 'peek',
        onStateChange
    } = options;
    const panel = document.querySelector(panelSelector);
    const handle = document.querySelector(handleSelector);
    const tabNav = document.querySelector(tabNavSelector);
    const collapseBtn = document.querySelector(collapseBtnSelector);
    if (!panel) return null;

    let currentState = defaultState;

    const applyState = (state) => {
        if (window.innerWidth > 900) return;
        currentState = state;
        panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-expanded');
        panel.classList.add(`sheet-${state}`);

        if (typeof onStateChange === 'function') {
            onStateChange(state);
        }
    };

    // Configura estado inicial se estiver em tela mobile
    if (window.innerWidth <= 900) {
        applyState(defaultState);
    }

    // Ao clicar na alça de arraste: alterna entre peek e half
    if (handle) {
        handle.addEventListener('click', () => {
            if (window.innerWidth > 900) return;
            const nextState = currentState === 'peek' ? 'half' : 'peek';
            applyState(nextState);
        });
    }

    // Ao clicar em qualquer aba no mobile: se estiver em peek, abre automaticamente para half
    if (tabNav) {
        tabNav.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.innerWidth <= 900 && currentState === 'peek') {
                    applyState('half');
                }
            });
        });
    }

    // Botão de recolher/minimizar na barra de abas
    if (collapseBtn) {
        collapseBtn.addEventListener('click', (e) => {
            if (window.innerWidth <= 900) {
                e.stopPropagation();
                const nextState = currentState === 'peek' ? 'half' : 'peek';
                applyState(nextState);
            }
        });
    }

    // Suporte a Touch Swipe Vertical na alça de arraste
    if (handle) {
        let touchStartY = 0;
        handle.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        handle.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const diffY = touchEndY - touchStartY;
            // Se arrastar para cima mais de 30px: abre
            if (diffY < -30) {
                applyState(currentState === 'peek' ? 'half' : 'expanded');
            }
            // Se arrastar para baixo mais de 30px: fecha
            else if (diffY > 30) {
                applyState(currentState === 'expanded' ? 'half' : 'peek');
            }
        }, { passive: true });
    }

    // Listener de redimensionamento de janela
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-expanded');
        } else if (!panel.classList.contains('sheet-peek') && !panel.classList.contains('sheet-half') && !panel.classList.contains('sheet-expanded')) {
            applyState(currentState);
        }
    });

    return {
        setState: applyState,
        getState: () => currentState,
        toggle: () => {
            const next = currentState === 'peek' ? 'half' : 'peek';
            applyState(next);
        }
    };
}

/**
 * =============================================================================
 * BARRA FLUTUANTE DE FOCO DECLARATIVA & REATIVA (Design System 2.0)
 * =============================================================================
 * Varre o painel de controles em busca de elementos marcados com [data-focus-control]
 * e monta dinamicamente uma barra de ferramentas compacta no canvas, sensível à aba ativa
 * e sincronizada de forma bi-direcional via proxies de eventos e MutationObserver.
 * 
 * Atributos HTML suportados nos elementos originais:
 * - data-focus-control: "action" | "toggle" | "select" | "slider" | "badge"
 * - data-focus-label: Rótulo curto no modo foco (ou "" para apenas ícone)
 * - data-focus-icon: Nome do ícone SVG em ../assets/icons/ (sem .svg)
 * - data-focus-order: Posição numérica de ordenação (ex: 1, 2, 3...)
 * - data-focus-tab: Aba ou modo associado ("base", "construir", etc. ou "global")
 * - data-focus-divider: "before" | "after" | "both" (insere divisores verticais)
 * - data-focus-tooltip: Dica de hover (fallback para title)
 * 
 * @param {Object} [options]
 * @param {string|HTMLElement} [options.toolbarTarget] - Seletor ou container da toolbar
 * @param {string|HTMLElement} [options.scopeSelector='.controls-panel'] - Container raiz dos controles originais
 * @param {string} [options.layoutSelector='.sim-layout'] - Seletor do layout principal
 * @param {boolean} [options.onlyInFocusMode=true] - Se visível apenas no Modo Foco
 * @param {Function} [options.onRebuild] - Callback disparado após reconstrução: (contextId, toolbarEl) => void
 * @returns {Object} Controlador com .rebuild(contextId), .getContainer(), .destroy()
 */
export function initFocusMirrorToolbar(options = {}) {
    const {
        toolbarTarget,
        scopeSelector = '.controls-panel',
        layoutSelector = '.sim-layout',
        onlyInFocusMode = true,
        onRebuild = null
    } = options;

    // 1. Localiza ou cria dinamicamente o container flutuante no canvas
    let container = null;
    if (toolbarTarget) {
        container = typeof toolbarTarget === 'string' ? document.querySelector(toolbarTarget) : toolbarTarget;
    }
    if (!container) {
        container = document.querySelector('#focus-context-toolbar, .focus-mirror-toolbar');
    }
    if (!container) {
        const canvasArea = document.querySelector('.canvas-area');
        if (canvasArea) {
            container = document.createElement('div');
            container.className = 'canvas-toolbar pos-top-left focus-mirror-toolbar';
            canvasArea.appendChild(container);
        }
    }
    if (!container) return null;

    container.classList.add('canvas-toolbar', 'pos-top-left', 'focus-mirror-toolbar');
    if (onlyInFocusMode) {
        container.classList.add('focus-mirror-only-focus');
    }

    // 1.1 Empilhamento Vertical Automático no Canto Superior Esquerdo (.canvas-top-left-stack)
    const parentCanvasArea = container.closest('.canvas-area') || document.querySelector('.canvas-area');
    if (parentCanvasArea) {
        let topLeftStack = parentCanvasArea.querySelector('.canvas-top-left-stack');
        if (!topLeftStack) {
            topLeftStack = document.createElement('div');
            topLeftStack.className = 'canvas-top-left-stack';
            parentCanvasArea.insertBefore(topLeftStack, parentCanvasArea.firstChild);
        }

        // Coleta toolbars fixas do canto superior esquerdo (ex: #theme-selector-bar, #display-toolbar)
        const fixedTopLeftBars = Array.from(
            parentCanvasArea.querySelectorAll('.canvas-toolbar.pos-top-left:not(.focus-mirror-toolbar), .theme-selector-bar')
        );
        fixedTopLeftBars.forEach(el => {
            el.style.removeProperty('top');
            el.style.removeProperty('left');
            if (el.parentElement !== topLeftStack) {
                topLeftStack.appendChild(el);
            }
        });

        // Posiciona a barra espelhada do Modo Foco logo abaixo das barras fixas
        container.style.removeProperty('top');
        container.style.removeProperty('left');
        if (container.parentElement !== topLeftStack) {
            topLeftStack.appendChild(container);
        }

        // Posiciona popovers do canto superior esquerdo (ex: #color-customizer-tooltip) logo abaixo das toolbars
        const topLeftPopovers = Array.from(
            parentCanvasArea.querySelectorAll('.sim-popover:not(.pos-top-right):not(.pos-bottom-left):not(.pos-bottom-right), .color-tooltip-popover')
        );
        topLeftPopovers.forEach(pop => {
            pop.style.removeProperty('top');
            pop.style.removeProperty('left');
            if (pop.parentElement !== topLeftStack) {
                topLeftStack.appendChild(pop);
            }
        });
    }

    // Pool de MutationObservers ativos para evitar memory leaks
    let activeObservers = [];

    const cleanupObservers = () => {
        activeObservers.forEach(obs => obs.disconnect());
        activeObservers = [];
    };

    /**
     * Detecta o contexto operacional ou aba atualmente ativa na interface
     */
    const detectActiveContext = () => {
        // 1. Seletor de Modo Segmentado (ex: 1. Base, 2. Construir, etc.)
        const activeSegment = document.querySelector('.mode-selector .segment-btn.active, .segmented-control .segment-btn.active');
        if (activeSegment) {
            const mode = activeSegment.dataset.mode || activeSegment.dataset.tab;
            if (mode) return mode;
        }

        // 2. Subpainéis visíveis no DOM
        const visibleSubpane = document.querySelector('.subpane-controls:not(.hidden)');
        if (visibleSubpane && visibleSubpane.id) {
            return visibleSubpane.id.replace(/^subpane-controls-/, '').replace(/^pane-/, '');
        }

        // 3. Abas tradicionais ativas (.tab-btn.active)
        const activeTabBtn = document.querySelector('.tab-nav .tab-btn.active');
        if (activeTabBtn && activeTabBtn.dataset.tab) {
            return activeTabBtn.dataset.tab.replace(/^tab-/, '');
        }

        // 4. Painel de aba ativo (.tab-pane.active)
        const activePane = document.querySelector('.tab-pane.active, .tab-content.active');
        if (activePane && activePane.id) {
            return activePane.id.replace(/^tab-/, '');
        }

        return 'global';
    };

    /**
     * Identifica a qual aba ou contexto um elemento pertence
     */
    const getElementContext = (el) => {
        const explicitTab = el.getAttribute('data-focus-tab') || el.getAttribute('data-focus-mode');
        if (explicitTab) return explicitTab;

        const subpane = el.closest('.subpane-controls');
        if (subpane && subpane.id) {
            return subpane.id.replace(/^subpane-controls-/, '').replace(/^pane-/, '');
        }

        const tabPane = el.closest('.tab-pane, .tab-content');
        if (tabPane && (tabPane.id || tabPane.dataset.tab)) {
            return (tabPane.id || tabPane.dataset.tab).replace(/^tab-/, '');
        }

        return 'global';
    };

    /**
     * Verifica compatibilidade entre o contexto do controle e o contexto ativo
     */
    const isContextMatching = (ctrlCtx, activeCtx) => {
        if (!ctrlCtx || ctrlCtx === 'global') return true;
        if (!activeCtx || activeCtx === 'global') return true;

        const parts = ctrlCtx.split(',').map(s => s.trim().toLowerCase());
        const act = activeCtx.trim().toLowerCase();

        return parts.some(p => p === act || act.includes(p) || p.includes(act));
    };

    /**
     * Reconstrói a barra de ferramentas flutuante para o contexto especificado
     */
    const rebuild = async (targetContext = null) => {
        cleanupObservers();
        container.innerHTML = '';

        const activeCtx = targetContext || detectActiveContext();
        const scope = typeof scopeSelector === 'string' ? document.querySelector(scopeSelector) : scopeSelector;
        if (!scope) return;

        // Coleta todos os elementos declarados com [data-focus-control]
        const allCandidates = Array.from(scope.querySelectorAll('[data-focus-control]'));
        
        // Filtra os que pertencem ao contexto ativo ou são globais
        const matched = allCandidates.filter(el => {
            const ctx = getElementContext(el);
            return isContextMatching(ctx, activeCtx);
        });

        // Ordena por data-focus-order (crescente)
        matched.sort((a, b) => {
            const orderA = parseFloat(a.getAttribute('data-focus-order') || '999');
            const orderB = parseFloat(b.getAttribute('data-focus-order') || '999');
            return orderA - orderB;
        });

        if (matched.length === 0) {
            container.style.display = 'none';
            if (typeof onRebuild === 'function') onRebuild(activeCtx, container);
            return;
        }

        container.style.display = '';

        // Cria os espelhos dinâmicos
        for (const orig of matched) {
            const controlType = (orig.getAttribute('data-focus-control') || '').toLowerCase() || 
                                (orig.tagName === 'SELECT' ? 'select' : 
                                 orig.tagName === 'INPUT' && orig.type === 'range' ? 'slider' : 'action');

            const divider = orig.getAttribute('data-focus-divider') || '';
            const addDivider = () => {
                const div = document.createElement('div');
                div.className = 'toolbar-divider';
                container.appendChild(div);
            };

            if (divider === 'before' || divider === 'both') {
                addDivider();
            }

            // --- CASO 1: BOTÕES DE AÇÃO E TOGGLE ---
            if (controlType === 'action' || controlType === 'toggle') {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'toolbar-btn focus-mirror-btn';

                const tooltip = orig.getAttribute('data-focus-tooltip') || orig.title || orig.getAttribute('data-text-idle') || '';
                if (tooltip) btn.title = tooltip;

                // Ícone
                const customIcon = orig.getAttribute('data-focus-icon');
                if (customIcon) {
                    const img = document.createElement('img');
                    img.src = `../assets/icons/${customIcon}.svg`;
                    img.className = 'icon-svg';
                    img.alt = '';
                    btn.appendChild(img);
                } else {
                    const iconEl = orig.querySelector('.icon-svg, svg, img');
                    if (iconEl) {
                        btn.appendChild(iconEl.cloneNode(true));
                    }
                }

                // Rótulo de Texto
                const rawLabel = orig.getAttribute('data-focus-label');
                if (rawLabel !== null) {
                    if (rawLabel.trim() !== '') {
                        const span = document.createElement('span');
                        span.className = 'focus-btn-text';
                        span.textContent = rawLabel.trim();
                        btn.appendChild(span);
                    }
                } else {
                    const origText = (orig.querySelector('.btn-text')?.textContent || orig.textContent || '').trim();
                    if (origText) {
                        const span = document.createElement('span');
                        span.className = 'focus-btn-text';
                        span.textContent = origText;
                        btn.appendChild(span);
                    }
                }

                // Sincroniza classes iniciais
                const syncButtonClasses = () => {
                    const isActive = orig.classList.contains('is-active') || orig.classList.contains('active') || orig.getAttribute('data-state') === '1';
                    btn.classList.toggle('is-active', isActive);
                    btn.classList.toggle('active', isActive);

                    const isDisabled = orig.disabled || orig.classList.contains('is-disabled');
                    btn.disabled = isDisabled;
                    btn.classList.toggle('is-disabled', isDisabled);
                };
                syncButtonClasses();

                // Disparo: Forwarding direto de clique para o elemento original
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (!orig.disabled && !orig.classList.contains('is-disabled')) {
                        orig.click();
                    }
                });

                // Observer de mutações no elemento original
                const obs = new MutationObserver(() => {
                    syncButtonClasses();

                    // Se for toggle sem data-focus-label fixo, atualiza texto dinâmico
                    if (rawLabel === null) {
                        const newText = (orig.querySelector('.btn-text')?.textContent || orig.textContent || '').trim();
                        const span = btn.querySelector('.focus-btn-text');
                        if (span && newText && span.textContent !== newText) {
                            span.textContent = newText;
                        }
                    }
                });
                obs.observe(orig, { attributes: true, attributeFilter: ['class', 'disabled', 'data-state', 'aria-pressed'], childList: true, subtree: true });
                activeObservers.push(obs);

                container.appendChild(btn);
            }

            // --- CASO 2: SELETORES (SELECT) ---
            else if (controlType === 'select') {
                const sel = document.createElement('select');
                sel.className = 'focus-mirror-select';
                const tooltip = orig.getAttribute('data-focus-tooltip') || orig.title || '';
                if (tooltip) sel.title = tooltip;

                // Clona as opções
                Array.from(orig.options).forEach(opt => {
                    const newOpt = document.createElement('option');
                    newOpt.value = opt.value;
                    newOpt.textContent = opt.textContent;
                    newOpt.selected = opt.selected;
                    sel.appendChild(newOpt);
                });
                sel.value = orig.value;

                // Clone -> Original
                sel.addEventListener('change', () => {
                    orig.value = sel.value;
                    orig.dispatchEvent(new Event('change', { bubbles: true }));
                });

                // Original -> Clone
                const onOrigChange = () => {
                    if (sel.value !== orig.value) {
                        sel.value = orig.value;
                    }
                };
                orig.addEventListener('change', onOrigChange);

                const obs = new MutationObserver(() => {
                    sel.disabled = orig.disabled || orig.classList.contains('is-disabled');
                });
                obs.observe(orig, { attributes: true, attributeFilter: ['disabled', 'class'] });
                activeObservers.push(obs);

                container.appendChild(sel);
            }

            // --- CASO 3: BADGES DE TELEMETRIA / LEITURA DINÂMICA ---
            else if (controlType === 'badge' || controlType === 'telemetry') {
                const badge = document.createElement('span');
                badge.className = 'focus-mirror-badge';
                badge.textContent = orig.textContent.trim();

                const obs = new MutationObserver(() => {
                    badge.textContent = orig.textContent.trim();
                });
                obs.observe(orig, { characterData: true, childList: true, subtree: true });
                activeObservers.push(obs);

                container.appendChild(badge);
            }

            // --- CASO 4: SLIDERS COMPACTOS ---
            else if (controlType === 'slider') {
                const sliderBox = document.createElement('div');
                sliderBox.className = 'focus-mirror-slider';

                const label = orig.getAttribute('data-focus-label');
                if (label) {
                    const lblSpan = document.createElement('span');
                    lblSpan.textContent = label;
                    sliderBox.appendChild(lblSpan);
                }

                const range = document.createElement('input');
                range.type = 'range';
                range.min = orig.min || '0';
                range.max = orig.max || '100';
                range.step = orig.step || '1';
                range.value = orig.value;

                range.addEventListener('input', () => {
                    orig.value = range.value;
                    orig.dispatchEvent(new Event('input', { bubbles: true }));
                });
                range.addEventListener('change', () => {
                    orig.value = range.value;
                    orig.dispatchEvent(new Event('change', { bubbles: true }));
                });

                const onOrigInput = () => { range.value = orig.value; };
                orig.addEventListener('input', onOrigInput);

                sliderBox.appendChild(range);
                container.appendChild(sliderBox);
            }

            if (divider === 'after' || divider === 'both') {
                addDivider();
            }
        }

        // Inline SVGs recém-adicionados para herdar cores
        await inlineSVGImages();

        if (typeof onRebuild === 'function') {
            onRebuild(activeCtx, container);
        }
    };

    // Listeners Automáticos de Navegação por Abas e Modos
    const handleNavClick = (e) => {
        const btn = e.target.closest('.segment-btn, .tab-btn, [data-mode], [data-tab]');
        if (btn) {
            // Aguarda atualização da classe .active no DOM
            setTimeout(() => {
                const mode = btn.dataset.mode || btn.dataset.tab;
                rebuild(mode || null);
            }, 30);
        }
    };
    document.addEventListener('click', handleNavClick);

    const handleTabChange = (e) => {
        const tabId = e.detail?.tabId;
        rebuild(tabId || null);
    };
    document.addEventListener('tabchange', handleTabChange);

    // Inicialização da primeira montagem
    rebuild();

    return {
        rebuild: (ctx) => rebuild(ctx),
        getContainer: () => container,
        destroy: () => {
            cleanupObservers();
            document.removeEventListener('click', handleNavClick);
            document.removeEventListener('tabchange', handleTabChange);
            if (container) container.innerHTML = '';
        }
    };
}

// =============================================================================
// UTILITÁRIOS DE RENDERIZAÇÃO MATEMÁTICA (KATEX)
// =============================================================================

/**
 * Renderiza uma expressão LaTeX em um elemento DOM via KaTeX síncrono.
 * @param {HTMLElement|string} target - Elemento ou seletor CSS
 * @param {string} tex - Código LaTeX
 * @param {object} options - Opções do KaTeX (displayMode, throwOnError, etc.)
 */
export function renderMath(target, tex, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (window.katex && typeof window.katex.render === 'function') {
        try {
            window.katex.render(tex, el, {
                throwOnError: false,
                displayMode: false,
                ...options
            });
            return;
        } catch (e) {
            console.warn('[sim-ui] Erro ao renderizar KaTeX:', e);
        }
    }
    el.textContent = tex;
}

/**
 * Converte uma expressão LaTeX diretamente em string HTML compilada pelo KaTeX.
 * @param {string} tex - Código LaTeX
 * @param {object} options - Opções do KaTeX
 * @returns {string} HTML renderizado ou fallback em texto plano
 */
export function renderMathToString(tex, options = {}) {
    if (window.katex && typeof window.katex.renderToString === 'function') {
        try {
            return window.katex.renderToString(tex, {
                throwOnError: false,
                displayMode: false,
                ...options
            });
        } catch (e) {
            console.warn('[sim-ui] Erro ao compilar KaTeX:', e);
        }
    }
    return tex;
}

/**
 * Inicializa a renderização automática de fórmulas matemáticas KaTeX ($...$ e $$...$$).
 * Trata carregamento assíncrono do CDN com tentativas de contingência imediatas.
 * @param {HTMLElement|string} [root=document.body] - Elemento raiz para varredura
 * @param {object} [customOptions] - Opções personalizadas de delimitadores
 */
export function initKaTeXAutoRender(root = document.body, customOptions = {}) {
    const el = typeof root === 'string' ? document.querySelector(root) : root;
    if (!el) return;

    const defaultOptions = {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        ...customOptions
    };

    const runRender = () => {
        if (typeof window.renderMathInElement === 'function') {
            try {
                window.renderMathInElement(el, defaultOptions);
            } catch (err) {
                console.warn('[sim-ui] Erro durante auto-render do KaTeX:', err);
            }
        }
    };

    if (typeof window.renderMathInElement === 'function') {
        runRender();
    } else {
        window.addEventListener('load', runRender, { once: true });
        setTimeout(runRender, 150);
        setTimeout(runRender, 500);
        setTimeout(runRender, 1200);
    }
}

/**
 * =============================================================================
 * ÁLGEBRA LINEAR & TENSORES (MatrixMath & MatrixTensorEditor)
 * =============================================================================
 */

/**
 * Normaliza matriz 2x2 para array 2x2 [[a, b], [c, d]]
 */
function normalize2x2(M) {
    if (Array.isArray(M)) return [[M[0][0], M[0][1]], [M[1][0], M[1][1]]];
    return [[M.a ?? 1, M.b ?? 0], [M.c ?? 0, M.d ?? 1]];
}

/**
 * Determinante de matriz 2x2
 */
export function det2x2(M) {
    const m = normalize2x2(M);
    return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

/**
 * Traço de matriz 2x2
 */
export function trace2x2(M) {
    const m = normalize2x2(M);
    return m[0][0] + m[1][1];
}

/**
 * Autovalores e Autovetores de matriz real 2x2
 */
export function eigen2x2(M) {
    const m = normalize2x2(M);
    const a = m[0][0], b = m[0][1], c = m[1][0], d = m[1][1];
    const tr = a + d;
    const det = a * d - b * c;
    const disc = (a - d) * (a - d) + 4 * b * c;

    if (disc < -1e-12) {
        return {
            isReal: false,
            trace: tr,
            determinant: det,
            eigenvalues: [
                { re: tr / 2, im: Math.sqrt(-disc) / 2 },
                { re: tr / 2, im: -Math.sqrt(-disc) / 2 }
            ],
            eigenvectors: []
        };
    }

    const sqrtDisc = Math.sqrt(Math.max(0, disc));
    const lambda1 = (tr + sqrtDisc) / 2;
    const lambda2 = (tr - sqrtDisc) / 2;

    const findVector = (lambda) => {
        let vx, vy;
        if (Math.abs(b) > 1e-9) {
            vx = b;
            vy = lambda - a;
        } else if (Math.abs(c) > 1e-9) {
            vx = lambda - d;
            vy = c;
        } else {
            if (Math.abs(lambda - a) < Math.abs(lambda - d)) {
                vx = 1; vy = 0;
            } else {
                vx = 0; vy = 1;
            }
        }
        const norm = Math.hypot(vx, vy) || 1;
        return [vx / norm, vy / norm];
    };

    return {
        isReal: true,
        trace: tr,
        determinant: det,
        eigenvalues: [lambda1, lambda2],
        eigenvectors: [findVector(lambda1), findVector(lambda2)]
    };
}

/**
 * Determinante de matriz 3x3
 */
export function det3x3(A) {
    return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
           A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
           A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
}

/**
 * Traço de matriz 3x3
 */
export function trace3x3(A) {
    return A[0][0] + A[1][1] + A[2][2];
}

/**
 * Autovalores analíticos de matriz real simétrica 3x3 com clamp contra overflow de arco-cosseno (Smith/Cardano)
 */
export function solveEigenvaluesSymmetric3x3(A) {
    const p1 = (A[0][1] ** 2) + (A[0][2] ** 2) + (A[1][2] ** 2);
    if (p1 < 1e-14) {
        return [A[0][0], A[1][1], A[2][2]].sort((a, b) => a - b);
    }
    const q = (A[0][0] + A[1][1] + A[2][2]) / 3;
    const p2 = ((A[0][0] - q) ** 2) + ((A[1][1] - q) ** 2) + ((A[2][2] - q) ** 2) + 2 * p1;
    const p = Math.sqrt(p2 / 6);
    if (p < 1e-14) return [q, q, q];

    const B = [
        [(A[0][0] - q) / p, A[0][1] / p, A[0][2] / p],
        [A[1][0] / p, (A[1][1] - q) / p, A[1][2] / p],
        [A[2][0] / p, A[2][1] / p, (A[2][2] - q) / p]
    ];
    const detB = det3x3(B);
    const r = Math.max(-1.0, Math.min(1.0, detB / 2));
    const phi = Math.acos(r) / 3;

    const eig1 = q + 2 * p * Math.cos(phi);
    const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI / 3));
    const eig2 = 3 * q - eig1 - eig3;

    return [eig1, eig2, eig3].sort((a, b) => a - b);
}

/**
 * Diagonalização de matriz real simétrica 3x3 via algoritmo cíclico de Jacobi
 * Retorna { values: [λ1, λ2, λ3], vectors: [[x1,y1,z1], [x2,y2,z2], [x3,y3,z3]] } (autovetores colunares ortonormais)
 */
export function diagonalizeSymmetric3x3(A_in, maxSweeps = 30) {
    const A = [
        [A_in[0][0], A_in[0][1], A_in[0][2]],
        [A_in[1][0], A_in[1][1], A_in[1][2]],
        [A_in[2][0], A_in[2][1], A_in[2][2]]
    ];
    const V = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
    ];

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
        const offDiag = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]);
        if (offDiag < 1e-13) break;

        const pairs = [[0, 1], [0, 2], [1, 2]];
        for (const [p, q] of pairs) {
            const app = A[p][p];
            const aqq = A[q][q];
            const apq = A[p][q];
            if (Math.abs(apq) < 1e-15) continue;

            const theta = (aqq - app) / (2 * apq);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
            const c = 1 / Math.sqrt(1 + t * t);
            const s = t * c;
            const tau = s / (1 + c);

            A[p][q] = 0;
            A[q][p] = 0;
            A[p][p] = app - t * apq;
            A[q][q] = aqq + t * apq;

            for (let i = 0; i < 3; i++) {
                if (i !== p && i !== q) {
                    const aip = A[i][p];
                    const aiq = A[i][q];
                    A[i][p] = aip - s * (aiq + tau * aip);
                    A[p][i] = A[i][p];
                    A[i][q] = aiq + s * (aip - tau * aiq);
                    A[q][i] = A[i][q];
                }
            }

            for (let i = 0; i < 3; i++) {
                const vip = V[i][p];
                const viq = V[i][q];
                V[i][p] = vip - s * (viq + tau * vip);
                V[i][q] = viq + s * (vip - tau * viq);
            }
        }
    }

    const vals = [A[0][0], A[1][1], A[2][2]];
    const indices = [0, 1, 2].sort((i, j) => vals[i] - vals[j]);
    return {
        values: indices.map(i => vals[i]),
        vectors: indices.map(i => [V[0][i], V[1][i], V[2][i]])
    };
}

/**
 * Componente Reativo de Edição e Análise de Matrizes/Tensores
 */
export class MatrixTensorEditor {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            dim: 2,
            symmetric: false,
            step: 0.1,
            labels: null,
            initialValue: null,
            onChange: () => {},
            ...options
        };
        this.inputs = [];
        this.render();
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.classList.add('sim-matrix-tensor-editor');

        const dim = this.options.dim;
        const box = document.createElement('div');
        box.className = 'matrix-box';

        const bracketLeft = document.createElement('span');
        bracketLeft.className = 'matrix-bracket left';
        bracketLeft.textContent = '[';
        box.appendChild(bracketLeft);

        const grid = document.createElement('div');
        grid.className = `matrix-grid matrix-grid-${dim}x${dim}`;
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${dim}, 1fr)`;
        grid.style.gap = '8px';

        const initVal = this.options.initialValue;
        this.inputs = [];

        for (let r = 0; r < dim; r++) {
            this.inputs[r] = [];
            for (let c = 0; c < dim; c++) {
                const cell = document.createElement('div');
                cell.className = 'matrix-cell';

                const inp = document.createElement('input');
                inp.type = 'number';
                inp.step = this.options.step;
                inp.className = 'sim-input matrix-input';
                inp.dataset.row = r;
                inp.dataset.col = c;

                let defaultVal = (r === c) ? 1 : 0;
                if (initVal) {
                    if (Array.isArray(initVal) && initVal[r] && initVal[r][c] !== undefined) {
                        defaultVal = initVal[r][c];
                    } else if (dim === 2 && typeof initVal === 'object') {
                        const keys = [['a', 'b'], ['c', 'd']];
                        defaultVal = initVal[keys[r][c]] ?? defaultVal;
                    }
                }
                inp.value = defaultVal;

                inp.addEventListener('input', () => {
                    if (this.options.symmetric && r !== c) {
                        const mirror = this.inputs[c][r];
                        if (mirror) mirror.value = inp.value;
                    }
                    this.notifyChange();
                });

                cell.appendChild(inp);
                if (this.options.labels && this.options.labels[r] && this.options.labels[r][c]) {
                    const sub = document.createElement('span');
                    sub.className = 'cell-sub';
                    sub.textContent = this.options.labels[r][c];
                    cell.appendChild(sub);
                }

                grid.appendChild(cell);
                this.inputs[r][c] = inp;
            }
        }

        box.appendChild(grid);

        const bracketRight = document.createElement('span');
        bracketRight.className = 'matrix-bracket right';
        bracketRight.textContent = ']';
        box.appendChild(bracketRight);

        this.container.appendChild(box);
    }

    getMatrix() {
        const dim = this.options.dim;
        const res = [];
        for (let r = 0; r < dim; r++) {
            res[r] = [];
            for (let c = 0; c < dim; c++) {
                res[r][c] = parseFloat(this.inputs[r][c].value) || 0;
            }
        }
        return res;
    }

    setMatrix(M) {
        const dim = this.options.dim;
        for (let r = 0; r < dim; r++) {
            for (let c = 0; c < dim; c++) {
                let v = 0;
                if (Array.isArray(M)) {
                    v = M[r]?.[c] ?? 0;
                } else if (dim === 2 && typeof M === 'object') {
                    const keys = [['a', 'b'], ['c', 'd']];
                    v = M[keys[r][c]] ?? 0;
                }
                if (this.inputs[r]?.[c]) {
                    this.inputs[r][c].value = Number.isInteger(v) ? v : v.toFixed(2);
                }
            }
        }
        this.notifyChange();
    }

    notifyChange() {
        const M = this.getMatrix();
        let analysis = null;
        if (this.options.dim === 2) {
            analysis = eigen2x2(M);
        } else if (this.options.dim === 3) {
            analysis = {
                trace: trace3x3(M),
                determinant: det3x3(M),
                ...diagonalizeSymmetric3x3(M)
            };
        }
        this.options.onChange(M, analysis);
    }
}

/**
 * Define o estado semântico de um campo ou controle (.is-valid, .is-invalid, .is-warning, .is-ready, .is-disabled).
 * Atualiza classes CSS, acessibilidade (aria-invalid) e mensagem de apoio (.field-hint).
 * @param {HTMLElement|string} target - Elemento ou seletor CSS do controle ou container
 * @param {'valid'|'invalid'|'warning'|'ready'|'disabled'|null} state - Novo estado semântico
 * @param {string} [hintText] - Texto explicativo opcional para exibir no .field-hint
 */
export function setFieldState(target, state = null, hintText = '') {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    el.classList.remove('is-valid', 'is-invalid', 'is-warning', 'is-ready', 'is-disabled');

    if (state) {
        el.classList.add(`is-${state}`);
        if (state === 'invalid') {
            el.setAttribute('aria-invalid', 'true');
        } else {
            el.removeAttribute('aria-invalid');
        }
        if (state === 'disabled') {
            el.setAttribute('aria-disabled', 'true');
        } else {
            el.removeAttribute('aria-disabled');
        }
    } else {
        el.removeAttribute('aria-invalid');
        el.removeAttribute('aria-disabled');
    }

    let hintEl = el.querySelector?.('.field-hint');
    if (!hintEl && el.id && el.parentElement) {
        hintEl = el.parentElement.querySelector(`.field-hint[data-for="${el.id}"]`);
    }
    if (!hintEl && el.nextElementSibling?.classList?.contains('field-hint')) {
        hintEl = el.nextElementSibling;
    }
    if (hintEl) {
        hintEl.textContent = hintText || '';
        hintEl.className = 'field-hint' + (state ? ` is-${state}` : '');
    }
}


