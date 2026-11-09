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
    initOnboardingModal,
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
    const stepperToolbar = document.getElementById('construir-stepper-toolbar');
    const footerStatusText = document.getElementById('footer-status-text');

    // 3. Inicialização do Plano Cartesiano Único em Tela Cheia
    const planoSingle = new PlanoCartesiano(canvasSingleEl, { id: 'single' });

    // 4. Instanciação dos 4 Modos
    const domBase = {
        m11: document.getElementById('base-m11'),
        m12: document.getElementById('base-m12'),
        m21: document.getElementById('base-m21'),
        m22: document.getElementById('base-m22'),
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
        chkShowDisplacement: document.getElementById('construir-chkDisplacement'),
        chkShowEigenModo2: document.getElementById('construir-chkEigen'),
        chkShowGhostModo2: document.getElementById('construir-chkGhost'),
        btnAnimateModo2: document.getElementById('construir-btnAnimate'),
        btnResetModo2: document.getElementById('construir-btnReset'),
        stepperToolbar
    };

    const domFuncoes = {
        fnM11: document.getElementById('fn-m11'),
        fnM12: document.getElementById('fn-m12'),
        fnM21: document.getElementById('fn-m21'),
        fnM22: document.getElementById('fn-m22'),
        presetFnSelect: document.getElementById('fn-presetSelect'),
        btnAddCircle: document.getElementById('fn-btnAddCircle'),
        btnAddSquare: document.getElementById('fn-btnAddSquare'),
        btnPlayFn: document.getElementById('fn-btnPlay'),
        btnStepFn: document.getElementById('fn-btnStep'),
        btnResetFn: document.getElementById('fn-btnReset'),
        sliderT: document.getElementById('fn-sliderT'),
        numT: document.getElementById('fn-numT'),
        btnSpeedCycle: document.getElementById('fn-btnSpeedCycle'),
        chkGhostGrid: document.getElementById('fn-chkGhostGrid')
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
        btnSpeedCycleDyn: document.getElementById('dyn-btnSpeedCycle')
    };

    const modos = {
        base: new ModoBase(planoSingle, domBase),
        construir: new ModoConstruir(planoSingle, domConstruir),
        funcoes: new ModoFuncoes(planoSingle, domFuncoes),
        dinamico: new ModoDinamico(planoSingle, domDinamico)
    };

    let activeModeName = null;

    // 5. Troca de Modos pela Navegação Superior de Abas (.tab-nav)
    function switchMode(newMode) {
        if (!modos[newMode]) return;

        // Desmonta modo anterior
        if (activeModeName && modos[activeModeName]) {
            modos[activeModeName].unmount();
        }

        activeModeName = newMode;

        // Alternar grupos da barra de transporte inferior (#canvas-transport-toolbar)
        document.querySelectorAll('[data-transport-mode]').forEach(group => {
            group.classList.toggle('hidden', group.dataset.transportMode !== newMode);
        });

        // Alternar barra superior de etapas da Aba 2 (Construir)
        stepperToolbar?.classList.toggle('hidden', newMode !== 'construir');

        // Sincronizar painel de ferramentas reativo do Modo Foco
        focusToolbar?.rebuild(newMode);

        // Atualizar Legenda no Rodapé
        if (newMode === 'base') {
            footerStatusText.textContent = 'Modo 1: Interpretação Geométrica Canônica';
        } else if (newMode === 'construir') {
            footerStatusText.textContent = 'Modo 2: Construir Operador por Imagens';
        } else if (newMode === 'funcoes') {
            footerStatusText.textContent = 'Modo 3: Matrizes Não-Lineares M(x, y, t)';
        } else if (newMode === 'dinamico') {
            footerStatusText.textContent = 'Modo 4: Sistemas Dinâmicos dx/dt = Mx';
        }

        // Redimensionar e montar o novo modo
        handleGlobalResize();
        modos[newMode].mount();
    }

    // Inicializa as abas padronizadas do Design System 2.0 (dispara switchMode('base') na carga)
    initTabs('#controls-panel', (tabId) => {
        const mode = tabId.replace(/^tab-/, '');
        switchMode(mode);
    });

    // 6. Redimensionamento Global do Canvas
    function handleGlobalResize() {
        planoSingle.resize();
        if (activeModeName === 'dinamico') {
            modos.dinamico.drawDynamicScene();
        } else {
            planoSingle.draw();
        }
    }

    window.addEventListener('resize', handleGlobalResize);

    // 7. Modal de Instruções Iniciais (Guia Rápido)
    initOnboardingModal('#modal-onboarding', { triggerSelector: '#btn-open-onboarding' });
});
