// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Google DeepMind & Antigravity
// Projeto: Plataforma de Simulações Educacionais (Design System 2.0)
// Arquivo: matrizes.js (Controlador Mestre dos 4 Modos Integrados)
// =============================================================================

import {
    initBottomSheet,
    initSidebarCollapse,
    initTabs,
    inlineSVGImages,
    initKaTeXAutoRender,
    initModal,
    initFocusMirrorToolbar
} from './sim-ui.js';

import { PlanoCartesiano } from './matrizes/matrizes-plano.js';
import { ModoBase } from './matrizes/matrizes-modo-base.js';
import { ModoConstruir } from './matrizes/matrizes-modo-construir.js';
import { ModoFuncoes } from './matrizes/matrizes-modo-funcoes.js';
import { ModoDinamico } from './matrizes/matrizes-modo-dinamico.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar subsistemas do Design System 2.0
    inlineSVGImages();
    initTabs();
    initSidebarCollapse({
        layoutSelector: '.sim-layout',
        collapseBtnSelector: '#btn-collapse-sidebar',
        expandBtnSelector: '#btn-expand-sidebar',
        onResize: () => handleGlobalResize()
    });
    initBottomSheet('#controls-panel');
    initKaTeXAutoRender();

    // 1.1 Barra Flutuante Reativa no Modo Foco (Zero Duplicação de Código)
    const focusToolbar = initFocusMirrorToolbar({
        toolbarTarget: '#focus-context-toolbar',
        scopeSelector: '#controls-panel'
    });

    // 2. Elementos DOM do Canvas
    const canvasSingleEl = document.getElementById('simCanvas');
    const canvasLeftEl = document.getElementById('canvasLeft');
    const canvasRightEl = document.getElementById('canvasRight');

    const containerSingle = document.getElementById('canvas-single-container');
    const containerSplit = document.getElementById('canvas-split-container');

    const canvasHintText = document.getElementById('canvasHintText');
    const footerStatusText = document.getElementById('footer-status-text');

    // 3. Inicialização dos Planos Cartesianos
    const planoSingle = new PlanoCartesiano(canvasSingleEl, { id: 'single' });
    const planoLeft = new PlanoCartesiano(canvasLeftEl, { id: 'left' });
    const planoRight = new PlanoCartesiano(canvasRightEl, { id: 'right' });

    // 4. Instanciação dos 4 Modos
    const domBase = {
        m11: document.getElementById('base-m11'),
        m12: document.getElementById('base-m12'),
        m21: document.getElementById('base-m21'),
        m22: document.getElementById('base-m22'),
        valIx: document.getElementById('base-valIx'),
        valIy: document.getElementById('base-valIy'),
        valJx: document.getElementById('base-valJx'),
        valJy: document.getElementById('base-valJy'),
        presetSelect: document.getElementById('base-presetSelect'),
        rotSlider: document.getElementById('base-rotSlider'),
        btnApply: document.getElementById('base-btnApply'),
        btnReset: document.getElementById('base-btnReset'),
        detVal: document.getElementById('base-detVal'),
        detAreaText: document.getElementById('base-detAreaText'),
        detOrientText: document.getElementById('base-detOrientText'),
        chkGhostGrid: document.getElementById('base-chkGhostGrid'),
        chkDetArea: document.getElementById('base-chkDetArea'),
        chkUnitCircle: document.getElementById('base-chkUnitCircle')
    };

    const domConstruir = {
        chkLockInitialBase: document.getElementById('construir-chkLockBase'),
        chkShowEigenModo2: document.getElementById('construir-chkEigen'),
        chkShowGhostModo2: document.getElementById('construir-chkGhost'),
        btnAnimateModo2: document.getElementById('construir-btnAnimate'),
        btnResetModo2: document.getElementById('construir-btnReset')
    };

    const domFuncoes = {
        fnM11: document.getElementById('fn-m11'),
        fnM12: document.getElementById('fn-m12'),
        fnM21: document.getElementById('fn-m21'),
        fnM22: document.getElementById('fn-m22'),
        presetFnSelect: document.getElementById('fn-presetSelect'),
        btnAddCircle: document.getElementById('fn-btnAddCircle'),
        btnAddSquare: document.getElementById('fn-btnAddSquare'),
        btnClearSurfaces: document.getElementById('fn-btnClearSurfaces'),
        btnPlayFn: document.getElementById('fn-btnPlay'),
        btnStepFn: document.getElementById('fn-btnStep'),
        btnResetFn: document.getElementById('fn-btnReset'),
        sliderT: document.getElementById('fn-sliderT'),
        numT: document.getElementById('fn-numT'),
        speedPills: document.getElementById('fn-speedPills')
    };

    const domDinamico = {
        dynM11: document.getElementById('dyn-m11'),
        dynM12: document.getElementById('dyn-m12'),
        dynM21: document.getElementById('dyn-m21'),
        dynM22: document.getElementById('dyn-m22'),
        presetDynSelect: document.getElementById('dyn-presetSelect'),
        btnPlayDyn: document.getElementById('dyn-btnPlay'),
        btnStepDyn: document.getElementById('dyn-btnStep'),
        btnResetDyn: document.getElementById('dyn-btnReset'),
        btnClearDyn: document.getElementById('dyn-btnClear'),
        btnSeedCircle: document.getElementById('dyn-btnSeedCircle'),
        btnSeedGrid: document.getElementById('dyn-btnSeedGrid'),
        chkVectorField: document.getElementById('dyn-chkVectorField'),
        chkShowEigenDyn: document.getElementById('dyn-chkEigen'),
        speedPillsDyn: document.getElementById('dyn-speedPills')
    };

    const modos = {
        base: new ModoBase(planoSingle, domBase),
        construir: new ModoConstruir(planoLeft, planoRight, domConstruir),
        funcoes: new ModoFuncoes(planoSingle, domFuncoes),
        dinamico: new ModoDinamico(planoSingle, domDinamico)
    };

    let activeModeName = 'base';

    // 5. Troca de Modos pelo Seletor Segmentado
    function switchMode(newMode) {
        if (!modos[newMode]) return;

        // Desmonta modo anterior
        if (modos[activeModeName]) {
            modos[activeModeName].unmount();
        }

        activeModeName = newMode;

        // Atualizar botões do seletor
        const modeBtns = document.querySelectorAll('#mode-selector .segment-btn');
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === newMode);
        });

        // Alternar containers de canvas (Single vs Split)
        const isSplit = newMode === 'construir';
        containerSingle.classList.toggle('hidden', isSplit);
        containerSplit.classList.toggle('hidden', !isSplit);

        // Alternar subpanes de controles
        document.querySelectorAll('.subpane-controls').forEach(pane => {
            const matches = pane.id === `subpane-controls-${newMode}`;
            pane.classList.toggle('hidden', !matches);
        });

        // Alternar subpanes de teoria
        document.querySelectorAll('.subpane-theory').forEach(pane => {
            const matches = pane.id === `subpane-theory-${newMode}`;
            pane.classList.toggle('hidden', !matches);
        });

        // Sincronizar painel de ferramentas reativo do Modo Foco
        focusToolbar?.rebuild(newMode);

        // Atualizar Dica e Legenda no Canvas
        if (newMode === 'base') {
            canvasHintText.innerHTML = 'Arraste as pontas dos vetores <strong>î\'</strong> (amarelo) ou <strong>ĵ\'</strong> (ciano) no gráfico!';
            footerStatusText.textContent = 'Modo 1: Interpretação Geométrica Canônica';
        } else if (newMode === 'construir') {
            canvasHintText.innerHTML = 'Arraste <strong>î, ĵ, v⃗</strong> à esquerda e veja <strong>î\', ĵ\', v⃗\', d⃗</strong> evoluírem à direita!';
            footerStatusText.textContent = 'Modo 2: Construir Operador por Imagens';
        } else if (newMode === 'funcoes') {
            canvasHintText.innerHTML = 'Arraste o centro das <strong>superfícies de prova</strong> ou suas bordas para inspecionar a área local!';
            footerStatusText.textContent = 'Modo 3: Matrizes Não-Lineares M(x, y, t)';
        } else if (newMode === 'dinamico') {
            canvasHintText.innerHTML = '<strong>Clique no gráfico</strong> para semear novas órbitas no campo vetorial contínuo!';
            footerStatusText.textContent = 'Modo 4: Sistemas Dinâmicos dx/dt = Mx';
        }

        // Redimensionar e montar o novo modo
        handleGlobalResize();
        modos[newMode].mount();

        // Auto-renderizar KaTeX nas abas recém-exibidas
        const activeSubpane = document.getElementById(`subpane-controls-${newMode}`);
        if (activeSubpane) initKaTeXAutoRender(activeSubpane);
    }

    // Eventos do seletor de modos
    document.querySelectorAll('#mode-selector .segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchMode(btn.dataset.mode);
        });
    });

    // 6. Redimensionamento Global dos Canvases
    function handleGlobalResize() {
        if (activeModeName === 'construir') {
            planoLeft.resize();
            planoRight.resize();
            planoLeft.draw();
            planoRight.draw();
        } else {
            planoSingle.resize();
            planoSingle.draw();
        }
    }

    window.addEventListener('resize', handleGlobalResize);

    // 7. Ações Flutuantes
    const btnQuickReset = document.getElementById('btn-quick-reset');
    if (btnQuickReset) {
        btnQuickReset.addEventListener('click', () => {
            if (activeModeName === 'base') {
                document.getElementById('base-btnReset')?.click();
            } else if (activeModeName === 'construir') {
                document.getElementById('construir-btnReset')?.click();
            } else if (activeModeName === 'funcoes') {
                document.getElementById('fn-btnReset')?.click();
            } else if (activeModeName === 'dinamico') {
                document.getElementById('dyn-btnReset')?.click();
            }
        });
    }

    // 8. Botão de Modo Foco no Cabeçalho
    const btnFocus = document.getElementById('btn-focus-mode');
    if (btnFocus) {
        btnFocus.addEventListener('click', () => {
            const layout = document.querySelector('.sim-layout');
            const isCollapsed = layout?.classList.contains('sidebar-collapsed');
            if (isCollapsed) {
                document.getElementById('btn-expand-sidebar')?.click();
            } else {
                document.getElementById('btn-collapse-sidebar')?.click();
            }
        });
    }

    // 9. Modal Didático de Teoria Completa
    const modalTeoria = initModal('#modal-theory-matrizes');
    const btnAbrirModal = document.getElementById('btn-abrir-modal-teoria');
    if (btnAbrirModal && modalTeoria) {
        btnAbrirModal.addEventListener('click', () => modalTeoria.open());
    }

    // 10. Inicialização do Modo Padrão
    switchMode('base');
});
