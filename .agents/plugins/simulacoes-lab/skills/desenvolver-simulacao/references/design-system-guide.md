# Guia de Referência: Design System 2.0 & `sim-ui.js`

Este documento detalha todos os componentes de interface, contratos HTML/CSS e controladores JavaScript disponíveis no laboratório de simulações.

> **Fonte da Verdade Canônica**: Todos os componentes abaixo estão implementados e demonstrados ao vivo em `simulacoes/ui_lab.html` e `simulacoes/scripts/ui_lab.js`. Os agentes **só podem** inserir componentes cuja estrutura siga este catálogo e exista no `ui_lab`. Sempre que um novo componente for criado em `design-system.css` ou `sim-ui.js`, ele deve ser sincronizado no `ui_lab` e neste guia.

---

## 1. Tokens CSS Globais (`design-system.css`)

Nunca codifique cores hexadecimais soltas para elementos de UI. Utilize os tokens em `:root`:

* **Superfícies**:
  * `--bg-main`: `#09090d` (Fundo geral e área do canvas)
  * `--bg-surface`: `#101018` (Painel lateral e cabeçalho)
  * `--bg-card`: `#181824` (Cards de controle, inputs, modais)
  * `--bg-card-hover`: `#222233` (Hover de botões secundários e cards)
* **Texto**:
  * `--text-main`: `#f4f4f6`
  * `--text-muted`: `#8a8a9e`
* **Paleta de Acentos e Tons Semânticos**:
  * `--accent-color`: `#6366f1` (Indigo — padrão)
  * `--color-cyan`: `#06b6d4`
  * `--color-emerald`: `#10b981`
  * `--color-purple`: `#a855f7`
  * `--color-pink`: `#ec4899`
  * `--color-rose`: `#f43f5e`
  * `--color-orange`: `#f59e0b`
* **Classes de Tom (`Tone Classes`)**:
  Aplicáveis em `.sim-dual-slider`, `.sim-switch`, `.btn-primary`, `.btn-preset`, `.sim-badge` ou containers:
  `.tone-accent`, `.tone-cyan`, `.tone-emerald`, `.tone-purple`, `.tone-pink`, `.tone-rose`, `.tone-orange`.

---

## 2. Anatomia de Layout, Painel Lateral e Utilitários Estruturais

### 2.1 Esqueleto Principal da Simulação
```html
<header class="sim-header">
    <div class="header-left">
        <a href="../simulacoes.html" class="back-link">
            <img src="../assets/icons/arrow-left-icon.svg" class="icon-svg" alt="Voltar">
            Simulações
        </a>
        <span class="header-Separator">/</span>
        <span class="sim-title">Título da Simulação</span>
    </div>
    <div class="header-right">
        <div id="status-badge" class="sim-badge">
            <span class="status-dot"></span>
            <span id="status-text">Executando</span>
        </div>
    </div>
</header>

<main class="sim-layout">
    <!-- Área do Canvas (Esquerda no Desktop / Topo no Mobile) -->
    <div class="canvas-area">
        <div id="canvas-container" style="width:100%; height:100%; position:relative; touch-action:none;"></div>

        <!-- Botão para reabrir painel quando recolhido em Modo Foco -->
        <button id="btn-expand-sidebar" class="canvas-btn-expand-sidebar" title="Expandir Painel (F)">
            <img src="../assets/icons/sidebar-expand-icon.svg" class="icon-svg" alt="Expandir">
        </button>

        <!-- Barra Flutuante Automática do Modo Foco -->
        <div id="focus-context-toolbar" class="canvas-toolbar pos-bottom-center" style="display: none;"></div>
    </div>

    <!-- Painel Lateral / Bottom Sheet -->
    <aside class="controls-panel">
        <div class="sheet-drag-handle"><div class="sheet-handle-bar"></div></div>

        <nav class="tab-nav">
            <button class="tab-btn active" data-tab="tab-controls">Controles</button>
            <button class="tab-btn" data-tab="tab-analysis">Análise</button>
            <button class="tab-btn" data-tab="tab-theory">Teoria</button>
            <button id="btn-collapse-sidebar" class="btn-collapse-sidebar" title="Modo Foco (F)">
                <img src="../assets/icons/sidebar-collapse-icon.svg" class="icon-svg" alt="Ocultar">
            </button>
        </nav>

        <div class="panel-body">
            <div id="tab-controls" class="tab-pane active">
                <div class="tab-header">
                    <div class="tab-header-row">
                        <h3 class="tab-title">Parâmetros do Sistema</h3>
                        <button id="btn-open-theory" class="btn-icon" title="Ver Dedução">
                            <img src="../assets/icons/book-icon.svg" class="icon-svg" alt="Teoria">
                        </button>
                    </div>
                    <p class="tab-subtitle">Ajuste as condições iniciais e constantes físicas.</p>
                </div>

                <div class="control-group">
                    <label class="control-label">Nome do Controle</label>
                    <!-- Componentes aqui -->
                </div>
            </div>

            <div id="tab-analysis" class="tab-pane" style="display: none;"></div>
            <div id="tab-theory" class="tab-pane" style="display: none;"></div>
        </div>

        <div class="panel-footer">
            <button id="btn-reset" class="btn-secondary">
                <img src="../assets/icons/reset-icon.svg" class="icon-svg" alt="Reset"> Resetar
            </button>
            <button id="btn-action" class="btn-primary tone-accent">
                <img src="../assets/icons/play-icon.svg" class="icon-svg" alt="Ação"> Aplicar
            </button>
        </div>
    </aside>
</main>
```

### 2.2 Divisores, Grids e Containers Utilitários
```html
<!-- Divisor simples -->
<hr class="sim-divider">

<!-- Divisor com brilho suave -->
<hr class="sim-divider-glow">

<!-- Divisor com rótulo centralizado em caixa alta -->
<div class="sim-divider-label"><span>TELEMETRIA E ANÁLISE</span></div>

<!-- Grade 2x2 para botões de preset ou ações -->
<div class="control-grid-2x2">
    <button class="btn-preset active">Opção 1</button>
    <button class="btn-preset">Opção 2</button>
</div>

<!-- Grade 3x1 (3 colunas iguais) -->
<div class="control-grid-3x1">
    <button class="btn-secondary">X</button>
    <button class="btn-secondary">Y</button>
    <button class="btn-secondary">Z</button>
</div>

<!-- Linha flexível com espaçamento entre extremos -->
<div class="flex-row-between">
    <span class="control-label" style="margin:0;"> Rótulo </span>
    <span class="sim-badge">Ativo</span>
</div>

<!-- Caixa de pré-visualização ou container destacado -->
<div class="preview-box">
    <!-- Conteúdo interno -->
</div>
```

---

## 3. Catálogo de Componentes HTML & CSS

### 3.1 Dual Slider (`.sim-dual-slider`)
Obrigatório para todos os parâmetros contínuos:
```html
<div class="control-group">
    <label class="control-label">Frequência Angular ($\omega$)</label>
    <div class="sim-dual-slider tone-cyan" data-focus-control="slider" data-focus-label="ω">
        <input type="range" id="omega-slider" min="0.1" max="10" step="0.1" value="2.5">
        <div class="dual-number-wrapper">
            <input type="number" id="omega-num" class="sim-input dual-number" min="0.1" max="10" step="0.1" value="2.5">
            <span class="dual-unit">rad/s</span>
        </div>
    </div>
    <span class="field-hint"></span>
</div>
```

### 3.2 Transport Bar (`.sim-transport-bar`)
Obrigatório para simulações com evolução temporal:
```html
<div class="sim-transport-bar">
    <div class="transport-controls-row">
        <button id="btn-play-pause" class="btn-primary tone-emerald transport-btn-play"
            data-state="idle"
            data-text-idle="Simular"
            data-text-active="Pausar"
            data-icon-idle="play-icon.svg"
            data-icon-active="pause-icon.svg"
            data-focus-control="toggle">
            <img src="../assets/icons/play-icon.svg" class="icon-svg" alt="">
            <span class="btn-text">Simular</span>
        </button>
        <button id="btn-step" class="btn-secondary" title="Avançar 1 Passo (dt)"
            data-focus-control="action" data-focus-label="Passo">
            <img src="../assets/icons/step-forward-icon.svg" class="icon-svg" alt="Passo">
        </button>
        <button id="btn-restart" class="btn-secondary" title="Reiniciar Tempo (t = 0)"
            data-focus-control="action" data-focus-label="Reset">
            <img src="../assets/icons/reset-icon.svg" class="icon-svg" alt="Reset">
        </button>
    </div>
    <div class="transport-speed-row">
        <span class="transport-speed-label">Velocidade</span>
        <div class="transport-speed-pills">
            <button class="speed-btn" data-speed="0.25">0.25x</button>
            <button class="speed-btn" data-speed="0.5">0.5x</button>
            <button class="speed-btn active" data-speed="1">1x</button>
            <button class="speed-btn" data-speed="2">2x</button>
            <button class="speed-btn" data-speed="4">4x</button>
        </div>
    </div>
</div>
```

### 3.3 Variantes de Botões e Ações de Canvas
```html
<!-- Botão Primário (aceita .tone-accent, .tone-emerald, .tone-rose, etc.) -->
<button class="btn-primary tone-accent">
    <img src="../assets/icons/play-icon.svg" class="icon-svg" alt=""> Executar
</button>

<!-- Botão Secundário / Outline -->
<button class="btn-secondary">
    <img src="../assets/icons/reset-icon.svg" class="icon-svg" alt=""> Restaurar
</button>
<button class="btn-outline">Ação Alternativa</button>

<!-- Botão de Preset (suporta estado .active e classes de tom) -->
<button class="btn-preset tone-purple active">
    <img src="../assets/icons/atom-icon.svg" class="icon-svg" alt=""> Estado Fundamental
</button>

<!-- Botão Compacto Apenas Ícone -->
<button class="btn-icon" title="Configurações">
    <img src="../assets/icons/settings-icon.svg" class="icon-svg" alt="Config">
</button>

<!-- Botões Flutuantes no Topo Direito do Canvas -->
<div class="canvas-top-actions">
    <button class="canvas-btn-floating" title="Centralizar Câmera">
        <img src="../assets/icons/target-icon.svg" class="icon-svg" alt="Focar">
    </button>
    <button class="canvas-btn-floating" title="Capturar Tela">
        <img src="../assets/icons/camera-icon.svg" class="icon-svg" alt="Foto">
    </button>
</div>
```

### 3.4 Switches, Segmented Controls, Selects e Inputs
```html
<!-- Switch Booleano (.sim-switch) -->
<div class="switch-container">
    <span class="switch-label">Exibir Vetores de Força</span>
    <label class="sim-switch tone-cyan">
        <input type="checkbox" id="chk-vectors" checked>
        <span class="slider-round"></span>
    </label>
</div>

<!-- Segmented Control (Pílulas de Escolha Mutuamente Exclusiva) -->
<div class="segmented-control">
    <button class="segment-btn active" data-mode="euler">Euler</button>
    <button class="segment-btn" data-mode="verlet">Verlet</button>
    <button class="segment-btn" data-mode="rk4">RK4</button>
</div>

<!-- Select Dropdown Nativo Estilizado -->
<select id="preset-select" class="sim-control" data-focus-control="select" data-focus-label="Preset">
    <option value="harmonic">Oscilador Harmônico</option>
    <option value="duffing">Oscilador de Duffing</option>
</select>

<!-- Input Textual ou Numérico Avulso -->
<input type="text" id="expr-input" class="sim-input" value="sin(x) * exp(-0.1*x)">
<span class="field-hint"></span>
```

### 3.5 Telemetria Numérica no Painel (`.sim-readout`)
Para exibir invariantes, energias ou grandezas calculadas:
```html
<div class="sim-readout">
    <div class="sim-readout-title">Invariantes do Sistema</div>
    <div class="sim-readout-row">
        <span class="sim-readout-label">Energia Total ($E$)</span>
        <span id="val-energy" class="sim-readout-value">12.450 J</span>
    </div>
    <div class="sim-readout-row">
        <span class="sim-readout-label">Momento Angular ($L_z$)</span>
        <span id="val-lz" class="sim-readout-value">1.000 J·s</span>
    </div>
</div>
```

### 3.6 Card de Gráfico 2D (`.sim-plot-card`)
Estrutura obrigatória para envolver instâncias de `RealtimePlot` ou `MultiSeriesPlot`:
```html
<div class="sim-plot-card">
    <div class="plot-header">
        <span class="plot-title">Espaço de Fase ($x$ vs $p_x$)</span>
        <span id="plot-live-val" class="plot-value tone-cyan">E = 1.00 J</span>
    </div>
    <div class="plot-canvas-wrapper">
        <canvas id="phase-plot-canvas" class="sim-plot-canvas" width="320" height="180"></canvas>
        <span class="plot-axis-label label-y">p_x</span>
        <span class="plot-axis-label label-x">x (m)</span>
    </div>
</div>
```

### 3.7 Overlays de Canvas: HUD, Badges, Tooltips, Toolbars e Popovers
```html
<!-- HUD de Telemetria Rápida no Canvas -->
<div class="sim-hud">
    <div class="hud-item">
        <span class="hud-label">FPS</span>
        <span id="hud-fps" class="hud-val">60</span>
    </div>
    <div class="hud-item">
        <span class="hud-label">Tempo</span>
        <span id="hud-time" class="hud-val">4.20 s</span>
    </div>
</div>

<!-- Badge Informativo de Canvas -->
<div class="canvas-info-badge">
    <img src="../assets/icons/orbit-icon.svg" class="icon-svg" alt="">
    <span>Regime Caótico ($E > E_c$)</span>
</div>

<!-- Dica Interativa Temporária (Some após interação) -->
<div class="interactive-hint">
    <img src="../assets/icons/hand-grab-icon.svg" class="icon-svg" alt="">
    <span>Arraste para orbitar • Scroll para zoom</span>
</div>

<!-- Tooltip de Inspeção Puntiforme no Canvas -->
<div id="cell-tooltip" class="cell-tooltip visible" style="left: 120px; top: 80px;">
    <div class="tooltip-header">Sítio (i=4, j=7)</div>
    <div class="tooltip-row">
        <span class="tooltip-lbl">Spin ($s_i$)</span>
        <span class="tooltip-v">+1</span>
    </div>
    <div class="tooltip-row">
        <span class="tooltip-lbl">Campo Local</span>
        <span class="tooltip-v">-2.4 J</span>
    </div>
</div>

<!-- Barra de Ferramentas Flutuante no Canvas (.pos-top-left, .pos-top-center, .pos-bottom-center, .pos-bottom-right) -->
<div class="canvas-toolbar pos-top-left">
    <button class="toolbar-btn active" title="Selecionar">
        <img src="../assets/icons/pointer-icon.svg" class="icon-svg" alt="Ponteiro">
    </button>
    <button class="toolbar-btn" title="Medir Distância">
        <img src="../assets/icons/ruler-icon.svg" class="icon-svg" alt="Régua">
    </button>
    <div class="toolbar-divider"></div>
    <button id="btn-popover-trigger" class="toolbar-btn" title="Opções de Grade">
        <img src="../assets/icons/grid-3x3-icon.svg" class="icon-svg" alt="Grade">
    </button>
</div>

<!-- Popover Contextual Ancorado -->
<div id="grid-popover" class="sim-popover hidden" style="top: 56px; left: 16px;">
    <div class="popover-header">
        <span>Configuração da Malha</span>
    </div>
    <div class="popover-body">
        <!-- Controles compactos aqui -->
    </div>
</div>
```

### 3.8 Cards de Teoria e Modais Imersivos (`.theory-card` & `.sim-modal-overlay`)
```html
<!-- Card de Teoria dentro da aba #tab-theory -->
<div class="theory-card">
    <h4>Equação de Movimento</h4>
    <p>A evolução temporal do estado é governada pelo Hamiltoniano:</p>
    <div class="math-block">$$i\hbar \frac{\partial}{\partial t}|\psi(t)\rangle = \hat{H}|\psi(t)\rangle$$</div>
</div>

<!-- Modal Imersivo de Dedução Formal (Fora de .sim-layout, antes de fechar </body>) -->
<div id="theory-modal" class="sim-modal-overlay hidden">
    <div class="sim-modal-container">
        <div class="sim-modal-header">
            <h2 class="sim-modal-title">Dedução Formal das Equações de Euler-Lagrange</h2>
            <button class="sim-modal-close" data-modal-close title="Fechar (Esc)">✕</button>
        </div>
        <div class="sim-modal-body">
            <div class="theory-section">
                <h3>1. Princípio da Mínima Ação</h3>
                <p>Considere o funcional de ação $S[q] = \int_{t_1}^{t_2} L(q, \dot{q}, t)\,dt$...</p>
                <div class="theory-callout">
                    <strong>Teorema de Noether:</strong> Toda simetria diferenciável contínua da ação corresponde a uma lei de conservação.
                </div>
            </div>
        </div>
        <div class="sim-modal-footer">
            <button class="btn-secondary" data-modal-close>Fechar</button>
        </div>
    </div>
</div>
```

### 3.9 Status Badges (`.sim-badge`)
```html
<!-- Ativo / Executando (Ponto pulsante verde/acento) -->
<div id="status-badge" class="sim-badge" data-focus-control="badge">
    <span class="status-dot"></span>
    <span id="status-text">Convergindo</span>
</div>

<!-- Pausado / Ocioso (.idle desliga o brilho do status-dot) -->
<div class="sim-badge idle">
    <span class="status-dot"></span>
    <span>Em Espera</span>
</div>
```

---

## 4. Controladores e Utilitários (`simulacoes/scripts/sim-ui.js`)

Sempre importe de `./sim-ui.js`:

### 4.1 Ícones Vetoriais e Tema Dinâmico
* **`inlineSVGImages(rootSelector = document)`**:
  Converte todas as tags `<img class="icon-svg" src="../assets/icons/...">` em elementos `<svg>` inline para que herdem `currentColor`. Chame sempre no `DOMContentLoaded`.
* **`setElementIcon(containerElement, iconFileName)`**:
  Injeta ou substitui assincronamente o ícone SVG dentro de um elemento (ex.: `setElementIcon(btn, 'pause-icon.svg')`).
* **`getSVGContent(iconFileName)`**:
  Retorna uma `Promise<string>` com o markup `<svg>` bruto (com cache em memória) caso precise compor templates dinâmicos.
* **`setGlobalAccent(hexColor, hoverHexColor)`**:
  Altera dinamicamente `--accent-color`, `--accent-hover` e `--accent-glow` em `:root` (ex.: ao alternar entre modos físicos com identidades cromáticas distintas).

### 4.2 Layout, Abas, Modo Foco e Modais
* **`initTabs(root = document)`**:
  Inicializa `.tab-nav` alternando `.active` entre `.tab-btn[data-tab]` e exibindo o `.tab-pane` correspondente. Dispara `window.dispatchEvent(new Event('resize'))` automaticamente ao trocar de aba para recalibrar gráficos.
* **`initSidebarCollapse({ collapseBtnSelector, expandBtnSelector, layoutSelector, enableKeyboardShortcut = true })`**:
  Gerencia o Modo Foco no desktop (tecla `F` ou `[`). Dispara o evento customizado `sim-focus-change` em `window` com `{ detail: { collapsed: boolean } }`.
* **`initFocusMirrorToolbar({ toolbarSelector = '#focus-context-toolbar', panelSelector = '.controls-panel' })`**:
  Espelha automaticamente na barra flutuante todos os controles marcados com `data-focus-control` (`action`, `toggle`, `select`, `slider`, `badge`) quando o painel lateral é recolhido, mantendo sincronização bidirecional.
* **`initBottomSheet(panelSelector = '.controls-panel', handleSelector = '.sheet-drag-handle')`**:
  Habilita o arrasto vertical (peek / half / full) em telas `<= 900px`.
* **`initModal(openBtnSelector, modalOverlaySelector)`**:
  Conecta o botão de abertura ao overlay `.sim-modal-overlay`, fechando ao clicar em `[data-modal-close]`, no backdrop ou ao pressionar `Escape`.
* **`initPopover(triggerBtnSelector, popoverSelector)`**:
  Alterna a visibilidade (`.hidden`) de um `.sim-popover` ancorado, fechando automaticamente ao clicar fora ou pressionar `Escape`.

### 4.3 Controles Físicos e Intencionalidade Semântica
* **`syncDualSlider(rangeSelector, numberSelector, onChangeCallback)`**:
  Sincroniza `<input type="range">` e `<input type="number">` bidirecionalmente, atualizando a variável `--slider-progress` para o preenchimento luminoso da trilha. Retorna `{ setValue(val, triggerCallback) }`.
* **`initToggleButton(btnSelector, onToggleCallback)`**:
  Alterna o atributo `data-state` entre `"idle"` e `"active"`, trocando ícone (`data-icon-idle` / `data-icon-active`) e texto (`data-text-idle` / `data-text-active`). Retorna `{ setState(active, triggerCallback), isActive() }`.
* **`setFieldState(target, state, hintText = '')`**:
  Aplica estados semânticos a um `.control-group`, `.sim-dual-slider` ou `.sim-input`:
  * `state`: `'neutral' | 'valid' | 'invalid' | 'warning' | 'ready' | 'disabled'`
  * Atualiza automaticamente o elemento `.field-hint` adjacente com `hintText`.

### 4.4 Gráficos 2D em Tempo Real e Espaço de Fase
* **`new RealtimePlot(canvasSelector, { minY, maxY, maxPoints, color, fillAlpha, autoScale })`**:
  * `.push(value)`: Adiciona ponto na série temporal e redesenha.
  * `.clear()`: Limpa histórico.
  * `.setColor(hexColor)`: Atualiza cor da curva.
* **`new MultiSeriesPlot(canvasSelector, { maxPoints, autoScale, minX, maxX, minY, maxY, mode, showZeroAxes, series })`**:
  * `mode`: `'time'` (séries temporais múltiplas) ou `'xy'` (retrato de espaço de fase $(x, y)$).
  * `series`: Array `[{ id: 'ke', label: 'Cinética', color: '#06b6d4' }, ...]`.
  * `.push(valuesMap)` (no modo `'time'`, ex.: `{ ke: 1.2, pe: 0.8 }`).
  * `.pushXY(seriesId, x, y)` (no modo `'xy'`, ex.: `plot.pushXY('traj', x, p)`).
  * `.setData(seriesId, pointsArray)`: Define uma curva inteira `[{x, y}, ...]`.
  * `.clear(seriesId?)`: Limpa uma série ou todas.

### 4.5 Álgebra Linear e Tensores (`MatrixTensorEditor`)
* **`new MatrixTensorEditor(containerSelector, { size = 2, initialValues, symmetric = false, symbol = 'T', onChange })`**:
  Gera automaticamente a estrutura `.sim-matrix-tensor-editor > .matrix-box > .matrix-bracket + .matrix-grid + .matrix-cell > .matrix-input + .cell-sub` e calcula invariantes automaticamente a cada edição:
  * Para $2\times 2$: retorna `{ matrix, size: 2, trace, det, isSymmetric, eigenvalues: { l1, l2, real } }`.
  * Para $3\times 3$: retorna `{ matrix, size: 3, trace, i2, det, isSymmetric, eigen: { eigenvalues, eigenvectors } }` (autovalores e autovetores via algoritmo de Jacobi quando simétrica).
  * Métodos de instância: `.getMatrix()`, `.setMatrix(newMat, trigger = true)`, `.setSymmetric(bool)`, `.computeInvariants()`.
* **Solvers puros exportados**:
  * `det2x2(m)`, `trace2x2(m)`, `eigenvalues2x2(m)`
  * `det3x3(m)`, `trace3x3(m)`, `secondInvariant3x3(m)`, `jacobiEigen3x3(A)`

### 4.6 Renderização Matemática (KaTeX)
* **`initKaTeXAutoRender(root = document.body)`**:
  Renderiza automaticamente delimitadores `$$...$$` e `$...$` estáticos no HTML.
* **`renderMath(latexString, targetElement, displayMode = false)`**:
  Renderiza uma expressão LaTeX dinâmica diretamente em um elemento DOM (com fallback gracioso se o CDN ainda estiver carregando).
* **`renderMathToString(latexString, displayMode = false)`**:
  Retorna a string HTML renderizada pelo KaTeX para interpolação em templates.
