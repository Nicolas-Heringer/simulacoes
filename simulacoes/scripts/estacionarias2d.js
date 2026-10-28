// =============================================================================
// Autor: Nicolas Heringer
// Simulação: Ondas Estacionárias 2D (Padrões de Chladni em Superfícies)
// Descrição: Visualização de modos normais bidimensionais e linhas nodais de
//            Chladni através da superposição antissimétrica de autofunções cossenoidais.
// Arquivo: scripts/estacionarias2d.js (ES Module com suporte ao Design System 2.0)
// =============================================================================

import {
    syncDualSlider,
    initSidebarCollapse,
    initFocusMirrorToolbar,
    initBottomSheet,
    initModal,
    initTabs,
    initKaTeXAutoRender,
    inlineSVGImages
} from './sim-ui.js';

// =============================================================================
// 1. CANVAS E VARIÁVEIS DE ESTADO DA SIMULAÇÃO
// =============================================================================
const canvas = document.getElementById("simulacao");
const ctx = canvas ? canvas.getContext("2d") : null;

let tamanhodDaCelula = 4; // Célula de cálculo padrão (px)
let numDeColunas = 0;
let numDeLinhas = 0;

// Elementos de Entrada e Controle do DOM
const inputN = document.getElementById("n");
const inputM = document.getElementById("m");
const selectDrawType = document.getElementById("drawType");
const selectCellSize = document.getElementById("cellSizeSelect");
const btnAtualizar = document.getElementById("atualizar");
const btnExportPng = document.getElementById("btn-export-png");

// Elementos de Telemetria (HUD)
const hudMode = document.getElementById("hud-mode");
const hudFreq = document.getElementById("hud-freq");
const hudCoords = document.getElementById("hud-coords");
const hudAmplitude = document.getElementById("hud-amplitude");
const footerSimInfo = document.getElementById("footer-sim-info");

// Variáveis de Estado Físico
let n = inputN ? parseInt(inputN.value, 10) || 1 : 1;
let m = inputM ? parseInt(inputM.value, 10) || 5 : 5;
let drawTypeSelected = selectDrawType ? selectDrawType.value : "mapped";

// =============================================================================
// 2. MODELO FÍSICO — EQUAÇÃO DE CHLADNI
// =============================================================================
function linearmap(value, minFrom, maxFrom, minTo, maxTo) {
    return minTo + (maxTo - minTo) * (value - minFrom) / (maxFrom - minFrom);
}

function Chladni(x, y, n, m) {
    const L = 1;
    const normalizedX = x / canvas.width;
    const normalizedY = y / canvas.height;
    return Math.cos(n * Math.PI * normalizedX / L) * Math.cos(m * Math.PI * normalizedY / L) -
        Math.cos(m * Math.PI * normalizedX / L) * Math.cos(n * Math.PI * normalizedY / L);
}

// =============================================================================
// 3. MAPEAMENTO DE CORES E MODOS DE DESENHO
// =============================================================================
const drawType = {
    // Mapeamento linear para escala de cinza
    mapped: (chladniValue) => {
        let colorValue = Math.round(linearmap(chladniValue, -2.0, 2.0, 0, 255));
        colorValue = Math.max(0, Math.min(255, colorValue));
        return `rgb(${colorValue}, ${colorValue}, ${colorValue})`;
    },

    // Mapeamento binário dos nós das ondas (linhas de Chladni)
    abs: (chladniValue) => {
        if (Math.abs(chladniValue) < 0.1) {
            return "rgb(0, 0, 0)"; // Região nodal (acúmulo de areia)
        } else {
            return "rgb(255, 255, 255)"; // Antinós
        }
    },

    // Mapeamento de fases opostas (positivo e negativo)
    positiveAndNegative: (chladniValue) => {
        if (chladniValue < 0) {
            return "rgb(50, 0, 0)";
        } else {
            return "rgb(0, 0, 50)";
        }
    },

    // Mapeamento cromático aleatório original
    random: (chladniValue) => {
        let r = Math.floor(Math.random() * 256);
        let g = Math.floor(Math.random() * 256);
        let b = Math.floor(Math.random() * 256);
        return `rgb(${r}, ${g}, ${b})`;
    }
};

// =============================================================================
// 4. ATUALIZAÇÃO DA TELEMETRIA E HUD
// =============================================================================
function updateHUDTelemetry() {
    const freqRel = Math.sqrt(n * n + m * m);

    if (hudMode) {
        hudMode.textContent = `n = ${n}, m = ${m}`;
    }
    if (hudFreq) {
        hudFreq.textContent = `${freqRel.toFixed(2)} f₀`;
    }
    if (footerSimInfo) {
        footerSimInfo.textContent = `f = ${freqRel.toFixed(2)} f₀`;
    }
}

// =============================================================================
// 5. RENDERIZAÇÃO DA GRADE MODAL NO CANVAS
// =============================================================================
function draw(type = drawTypeSelected) {
    if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return;

    if (!drawType[type]) {
        console.error(`Tipo de desenho "${type}" não encontrado. Usando "mapped" como padrão.`);
        type = "mapped";
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < numDeLinhas; i++) {
        const y = i * tamanhodDaCelula;
        for (let j = 0; j < numDeColunas; j++) {
            const x = j * tamanhodDaCelula;
            let chladniValue = Chladni(x, y, n, m);

            let color = drawType[type](chladniValue);

            ctx.fillStyle = color;
            ctx.fillRect(x, y, tamanhodDaCelula, tamanhodDaCelula);
        }
    }

    updateHUDTelemetry();
}

// =============================================================================
// 6. REDIMENSIONAMENTO RESPONSIVO DO CANVAS (FULL-SCREEN)
// =============================================================================
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);

    numDeColunas = Math.ceil(canvas.width / tamanhodDaCelula);
    numDeLinhas = Math.ceil(canvas.height / tamanhodDaCelula);

    draw(drawTypeSelected);
}

// =============================================================================
// 7. INICIALIZAÇÃO DOS COMPONENTES E CONTROLADORES DO DESIGN SYSTEM
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Converte imagens de ícones SVG para inline SVG nativo
    inlineSVGImages();

    // 2. Renderização de equações KaTeX
    initKaTeXAutoRender();

    // 3. Inicializa o Modo Foco Desktop (Recolhimento Lateral com atalho 'F')
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: resizeCanvas
    });

    // Barra flutuante de contexto para Modo Foco
    initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '.controls-panel'
    });

    // 4. Inicializa o Bottom Sheet Responsivo para Mobile (<= 900px)
    initBottomSheet({
        panelSelector: '.controls-panel',
        handleSelector: '#sheet-drag-handle',
        tabNavSelector: '.tab-nav',
        collapseBtnSelector: '#btn-collapse-sidebar',
        defaultState: 'peek'
    });

    // 5. Inicializa o Modal Teórico com KaTeX
    const theoryModal = initModal('#modal-teoria');
    document.getElementById('btn-open-theory-modal')?.addEventListener('click', () => {
        theoryModal?.open();
    });

    // 6. Navegação entre Abas via Design System
    initTabs();

    // 7. Sincronização dos Dual Sliders (Modo n e Modo m)
    const presetButtons = document.querySelectorAll('.btn-preset');

    function updateActivePreset() {
        presetButtons.forEach(btn => {
            const pn = parseInt(btn.dataset.n, 10);
            const pm = parseInt(btn.dataset.m, 10);
            const isMatch = (pn === n && pm === m);
            btn.classList.toggle('active', isMatch);
        });
    }

    const sliderCtrlN = syncDualSlider('#slider-n', '#n', (val) => {
        n = Math.round(val);
        draw(drawTypeSelected);
        updateActivePreset();
    });

    const sliderCtrlM = syncDualSlider('#slider-m', '#m', (val) => {
        m = Math.round(val);
        draw(drawTypeSelected);
        updateActivePreset();
    });

    // 8. Seletores de Presets Clássicos
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const pn = parseInt(btn.dataset.n, 10);
            const pm = parseInt(btn.dataset.m, 10);
            n = pn;
            m = pm;
            if (sliderCtrlN) sliderCtrlN.setValue(pn);
            if (sliderCtrlM) sliderCtrlM.setValue(pm);
            updateActivePreset();
            draw(drawTypeSelected);
        });
    });

    // 9. Seletor de Tipo de Desenho
    if (selectDrawType) {
        selectDrawType.addEventListener('change', () => {
            drawTypeSelected = selectDrawType.value;
            draw(drawTypeSelected);
        });
    }

    // 10. Seletor de Resolução da Grade (Tamanho da Célula)
    if (selectCellSize) {
        selectCellSize.addEventListener('change', () => {
            tamanhodDaCelula = parseInt(selectCellSize.value, 10) || 4;
            numDeColunas = Math.ceil(canvas.width / tamanhodDaCelula);
            numDeLinhas = Math.ceil(canvas.height / tamanhodDaCelula);
            draw(drawTypeSelected);
        });
    }

    // 11. Botão "Atualizar Simulação"
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', () => {
            if (inputN) n = parseInt(inputN.value, 10) || 1;
            if (inputM) m = parseInt(inputM.value, 10) || 5;
            if (selectDrawType) drawTypeSelected = selectDrawType.value;
            updateActivePreset();
            draw(drawTypeSelected);
        });
    }

    // 12. Botão "Exportar PNG"
    if (btnExportPng) {
        btnExportPng.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `chladni-n${n}-m${m}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }

    // 13. Telemetria sob o Cursor (Mouse e Touch)
    function inspectAt(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const posX = clientX - rect.left;
        const posY = clientY - rect.top;

        if (posX < 0 || posX > canvas.width || posY < 0 || posY > canvas.height) {
            return;
        }

        const normX = Math.max(0, Math.min(1, posX / canvas.width));
        const normY = Math.max(0, Math.min(1, posY / canvas.height));
        const val = Chladni(posX, posY, n, m);

        if (hudCoords) hudCoords.textContent = `(${normX.toFixed(2)}, ${normY.toFixed(2)})`;
        if (hudAmplitude) {
            const sign = val >= 0 ? '+' : '';
            hudAmplitude.textContent = `ψ = ${sign}${val.toFixed(2)}`;
            hudAmplitude.style.color = Math.abs(val) < 0.1 ? 'var(--color-emerald, #22c55e)' : 'var(--accent-hud, var(--accent-color))';
        }
    }

    canvas.addEventListener('pointermove', (e) => {
        inspectAt(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointerleave', () => {
        if (hudCoords) hudCoords.textContent = `(x: -, y: -)`;
        if (hudAmplitude) {
            hudAmplitude.textContent = `ψ = 0.00`;
            hudAmplitude.style.color = '';
        }
    });

    // 14. Observador de Redimensionamento Automático
    window.addEventListener('resize', resizeCanvas);
    if (window.ResizeObserver && canvas.parentElement) {
        new ResizeObserver(() => resizeCanvas()).observe(canvas.parentElement);
    }

    // 15. Renderização Inicial
    resizeCanvas();
});