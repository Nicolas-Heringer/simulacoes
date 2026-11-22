# Guia de Referência: Design System 2.0 & `sim-ui.js`

Este documento detalha todos os tokens CSS, componentes HTML e controladores JavaScript reais do laboratório de simulações científicas.

> **Fonte da Verdade Canônica**: Todos os componentes abaixo estão implementados e demonstrados ao vivo em `simulacoes/ui_lab.html` e `simulacoes/scripts/ui_lab.js`. Os agentes **só podem** inserir componentes cuja marcação siga este catálogo e exista no `ui_lab`. Sempre que um novo componente for adicionado a `design-system.css` ou `sim-ui.js`, ele deve ser sincronizado no `ui_lab` e neste guia.

---

## 1. Tokens CSS Globais (`simulacoes/css/design-system.css`)

Nunca codifique cores hexadecimais soltas para elementos de interface. Utilize os tokens semânticos definidos em `:root` (Tema Escuro — **Superfície Papel / Carbono Quente + Índigo**) e `:root[data-theme="light"]` (Tema Claro — **Superfície Papel + Grafite / Azul Marinho Forte**):

### 1.1 Superfícies, Contornos & Tipografia
| Token | Tema Escuro (`:root`) | Tema Claro (`[data-theme="light"]`) | Uso |
| :--- | :--- | :--- | :--- |
| `--bg-main` | `#0c0a09` | `#e7e5e4` | Fundo geral da página |
| `--bg-surface` | `#1c1917` | `#fafaf9` | Cabeçalho (`.sim-header`) e modais |
| `--bg-surface-elevated` | `#292524` | `#f5f5f4` | Cabeçalhos/rodapés de modais |
| `--bg-panel` | `rgba(28, 25, 23, 0.85)` | `#f5f5f4` | Painel lateral (`.controls-panel`) |
| `--bg-card` | `rgba(41, 37, 36, 0.65)` | `#ffffff` | Cards (`.slider-container`, `.sim-plot-card`, `.sim-readout`, `.theory-card`) |
| `--bg-input` | `rgba(28, 25, 23, 0.90)` | `#ffffff` | Inputs e selects |
| `--bg-recessed` | `rgba(0, 0, 0, 0.40)` | `#fafaf9` | Containers rebaixados (`.dual-input-wrapper`, `.tab-nav`, `.sim-math-display`) |
| `--bg-canvas` | `#070b16` | `#070b16` | Palco visual 3D/2D (sempre escuro) |
| `--text-primary` | `#f8fafc` | `#0f172a` | Títulos e valores principais |
| `--text-secondary` | `#94a3b8` | `#334155` | Rótulos e corpo de texto |
| `--text-muted` | `#94a3b8` | `#475569` | Legendas, unidades e dicas (calibrado para WCAG AA `>= 4.5:1`) |
| `--ui-border-width` | `1.5px` | `1.5px` | Espessura paramétrica padrão de contornos |
| `--border-color` | `rgba(255, 255, 255, 0.28)` | `#64748b` | Contornos de inputs, botões secundários e hover de cards |
| `--border-subtle` | `rgba(255, 255, 255, 0.18)` | `#94a3b8` | Contornos estruturais de cards, painel e cabeçalho |
| `--border-strong` | `rgba(255, 255, 255, 0.45)` | `#334155` | Ênfase de contorno e separadores fortes |

### 1.2 Acentos, Tons Semânticos (`.tone-*`) e Palco Blindado (`--stage-*`)
* **Acento Global**: `--accent-color` (`#818cf8` escuro / `#1e1b4b` claro), `--accent-color-hover` (`#6366f1` / `#131136`), `--accent-fg` (`#0c0a09` / `#ffffff`), `--accent-subtle`, `--accent-glow`.
* **Acentos por Componente** (todos herdam `var(--accent-color)` por padrão, permitindo customização granular): `--accent-nav`, `--accent-btn`, `--accent-card`, `--accent-text`, `--accent-slider`, `--accent-switch`, `--accent-hud`, `--accent-divider` (`#94a3b8` escuro / `#475569` claro).
* **Cores Semânticas Auxiliares** (calibradas WCAG AA):
  * `--color-cyan` (`#38bdf8` escuro / `#0369a1` claro)
  * `--color-emerald` (`#22c55e` / `#15803d`)
  * `--color-purple` (`#a855f7` / `#7e22ce`)
  * `--color-rose` (`#fb7185` / `#e11d48`)
  * `--color-pink` (`#f472b6` / `#db2777`)
  * `--color-orange` (`#fb923c` / `#c2410c`)
* **Classes de Tom (`.tone-*`)**:
  `.tone-accent`, `.tone-cyan`, `.tone-emerald`, `.tone-purple`, `.tone-pink`, `.tone-rose`, `.tone-orange`.
  * Aplicáveis tanto em **textos/readouts/badges** (`.sim-readout-value`, `.hud-val`, `.sim-badge`) quanto em **controles interativos** (`.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-preset`, `.sim-dual-slider`, `.sim-switch`), sobrescrevendo localmente `--accent-color`, `--accent-btn`, `--accent-slider`, `--accent-switch`, `--accent-card`, `--accent-hud` e `color` sem afetar controles sem `.tone-*` (preservando o padrão 90/10).
* **Blindagem do Palco Escuro (`.canvas-area > *`)**:
  No Tema Claro (`:root[data-theme="light"]`), todos os filhos diretos de `.canvas-area` (barras de transporte, HUDs, overlays e popovers sobre o canvas) mantêm tokens escuros 3Blue1Brown, preservando contraste sobre a cena. Para objetos 3D/2D no palco, utilize os tokens blindados `--stage-accent` (`#facc15`), `--stage-cyan`, `--stage-emerald`, `--stage-purple`, `--stage-rose`, `--stage-orange`, `--stage-pink`, `--stage-text` e `--stage-text-muted`.
* **Gráficos 2D**: `--plot-bg`, `--plot-grid`, `--plot-axis`, `--plot-text`, `--plot-crosshair`, `--plot-tooltip-bg`, `--plot-tooltip-border`, `--plot-tooltip-text`.
* **Divisores de Seção (`.sim-divider-label`)**:
  * Padrão **Limpo** (`1.5px`, sem atributo extra em `<html>`).
  * Variantes opcionais via `html[data-divider-style="minimal"]` (`1px`) ou `html[data-divider-style="pill"]` (cápsula).
* **Viewport Dinâmico e Safe Areas Mobile**:
  * `--app-height`: `100dvh` (via `@supports` com fallback `100vh` e `visualViewport` via `initViewportFix()`). Nunca use `vh` puro em containers estruturais.
  * `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right`: mapeiam `env(safe-area-inset-*, 0px)`.

---

## 2. Anatomia de Layout & Utilitários Estruturais

### 2.1 `<head>` e Esqueleto Principal
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">
    <meta name="theme-color" content="#1c1917">
    <title>Título da Simulação</title>
    <link rel="icon" type="image/svg+xml" href="../favicon.svg">
    <script src="../theme-init.js"></script>
    <link rel="stylesheet" href="css/design-system.css">
    <!-- KaTeX CDN (sem onload duplicado — inicializado via initKaTeXAutoRender) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"></script>
</head>
<body>
    <header class="sim-header">
        <a href="../index.html#secao-simulacoes" class="btn-back">
            <img src="../assets/icons/arrow-left.svg" class="icon-svg" alt="Voltar">
            Voltar ao Hub
        </a>
        <div class="sim-header-actions">
            <button type="button" id="btn-theme-toggle" class="btn-header-action btn-theme-toggle"
                    title="Alternar para modo claro" aria-label="Alternar tema claro/escuro" aria-pressed="false">
                <img src="../assets/icons/sun.svg" class="icon-svg" alt="">
            </button>
            <button type="button" id="btn-open-onboarding" class="btn-header-action" title="Instruções e Guia Rápido">
                <img src="../assets/icons/lightbulb.svg" class="icon-svg icon-accent" alt="Instruções">
                <span class="btn-label-text">Instruções</span>
            </button>
        </div>
    </header>

    <main class="sim-layout">
        <div class="canvas-area">
            <div id="three-container"></div>

            <!-- Pilha vertical automática no canto superior esquerdo (sem style="display:none") -->
            <div class="canvas-top-left-stack">
                <div id="focus-context-toolbar" class="canvas-toolbar pos-top-left focus-mirror-toolbar"></div>
            </div>

            <div class="canvas-top-actions">
                <button type="button" id="btn-expand-sidebar" class="canvas-btn-expand-sidebar" title="Expandir Controles (F)">
                    <img src="../assets/icons/expand.svg" class="icon-svg" alt="Expandir">
                    <span class="btn-label-text">Controles</span>
                </button>
            </div>

            <!-- Barra Flutuante de Transporte (ver seção 3.2) -->
            <div class="canvas-toolbar pos-bottom-center" id="canvas-transport-toolbar">...</div>

            <!-- Engrenagem Mobile (<= 900px) -->
            <button type="button" id="btn-mobile-settings" class="canvas-btn-settings"
                    title="Configurações e Parâmetros" aria-label="Configurações e Parâmetros" aria-expanded="false">
                <img src="../assets/icons/gear.svg" class="icon-svg" alt="Configurações">
            </button>
        </div>

        <aside class="controls-panel">
            <div class="tab-nav" role="tablist">
                <button type="button" class="tab-btn active" id="tab-btn-params" data-tab="panel-tab-params">
                    <img src="../assets/icons/sliders.svg" class="icon-svg" alt="Parâmetros">
                    <span class="tab-label">Parâmetros</span>
                </button>
                <button type="button" class="tab-btn" id="tab-btn-theory" data-tab="panel-tab-theory">
                    <img src="../assets/icons/book-open.svg" class="icon-svg" alt="Teoria">
                    <span class="tab-label">Teoria</span>
                </button>
                <button type="button" class="btn-collapse-sidebar" id="btn-collapse-sidebar"
                        title="Modo Foco (F)" aria-label="Recolher painel lateral">
                    <img src="../assets/icons/collapse.svg" class="icon-svg" alt="Recolher">
                </button>
            </div>

            <div class="panel-body">
                <div id="panel-tab-params" class="tab-pane active">...</div>
                <div id="panel-tab-theory" class="tab-pane">...</div>
            </div>

            <div class="panel-footer">
                <div class="sim-badge idle" id="footer-status-badge">
                    <span class="status-dot"></span>
                    <span id="footer-status-text">Simulação Pronta</span>
                </div>
                <span class="footer-meta" id="footer-sim-timer" data-focus-control="badge" data-focus-order="10" data-focus-tab="global">t = 0.00s</span>
            </div>
        </aside>
    </main>
</body>
</html>
```

### 2.2 Divisores, Grades e Utilitários
```html
<hr class="sim-divider">
<hr class="sim-divider-glow">
<div class="sim-divider-label"><span>Telemetria e Análise</span></div>

<div class="control-grid-2x2">...</div>
<div class="control-grid-3x1">...</div>
<div class="flex-row-between">...</div>
<div class="flex-wrap-row">...</div>
<div class="preview-box">...</div>
<!-- Utilitário de largura cheia: .w-full -->
```

---

## 3. Catálogo de Componentes HTML & CSS

### 3.1 Dual Slider (`.slider-container.sim-dual-slider`)
Obrigatório para todos os parâmetros contínuos. **Regra crítica**: `data-focus-control="slider"` deve ser colocado diretamente no `<input type="range">`, nunca na `<div>` externa.
```html
<div class="control-group">
    <div class="slider-container sim-dual-slider tone-cyan" id="field-omega">
        <div class="slider-header">
            <label for="slider-omega" class="slider-label">Frequência Angular ($\omega$)</label>
            <div class="dual-input-wrapper">
                <input type="number" class="dual-input-number" id="input-omega"
                       min="0.1" max="10" step="0.1" value="2.5">
                <span class="dual-input-unit">rad/s</span>
            </div>
        </div>
        <input type="range" class="sim-slider" id="slider-omega"
               min="0.1" max="10" step="0.1" value="2.5"
               data-focus-control="slider"
               data-focus-label="ω"
               data-focus-order="1"
               data-focus-tab="global">
    </div>
    <div class="field-hint" data-for="field-omega"></div>
</div>
```

### 3.2 Barra Flutuante de Transporte Temporal (`#canvas-transport-toolbar`)
Posicionar dentro de `.canvas-area`. Não utilize `.sim-transport-bar` legado na barra lateral.
```html
<div class="canvas-toolbar pos-bottom-center" id="canvas-transport-toolbar">
    <button type="button" class="toolbar-btn btn-toggle tone-accent" id="btn-play-sim"
            data-state="0"
            data-text-idle="Executar"
            data-text-active="Pausar"
            data-icon-idle="play"
            data-icon-active="pause"
            title="Executar / Pausar">
        <img src="../assets/icons/play.svg" class="icon-svg" alt="Play">
        <span class="btn-text">Executar</span>
    </button>
    <button type="button" class="toolbar-btn" id="btn-step-sim" title="Avançar 1 Passo (Δt)" aria-label="Avançar 1 passo">
        <img src="../assets/icons/step.svg" class="icon-svg" alt="Passo">
    </button>
    <button type="button" class="toolbar-btn" id="btn-reset-sim" title="Reiniciar (t = 0)" aria-label="Reiniciar simulação">
        <img src="../assets/icons/refresh.svg" class="icon-svg" alt="Reset">
    </button>
    <span class="toolbar-divider"></span>
    <button type="button" class="toolbar-btn speed-cycle-btn" id="btn-speed-cycle" data-speed="1.0" title="Alternar Velocidade Temporal">
        1.0×
    </button>
</div>
```

### 3.3 Variantes de Botões e Ações de Canvas
```html
<button type="button" class="btn-primary tone-accent w-full">
    <img src="../assets/icons/play.svg" class="icon-svg" alt=""> Executar
</button>
<button type="button" class="btn-secondary">
    <img src="../assets/icons/refresh.svg" class="icon-svg" alt=""> Restaurar
</button>
<button type="button" class="btn-outline">Ação Alternativa</button>
<button type="button" class="btn-preset active">
    <img src="../assets/icons/orbital.svg" class="icon-svg" alt=""> Estado Fundamental
</button>
<button type="button" class="btn-icon" title="Configurações" aria-label="Configurações">
    <img src="../assets/icons/gear.svg" class="icon-svg" alt="">
</button>
<button type="button" class="canvas-btn-floating" title="Centralizar Câmera">
    <img src="../assets/icons/camera-reset.svg" class="icon-svg" alt="Câmera">
    <span class="btn-label-text">Câmera</span>
</button>
```

### 3.4 Switches, Controles Segmentados, Selects, Inputs e Estados Semânticos
```html
<div class="switch-container">
    <span class="switch-label">Exibir Vetores de Força</span>
    <label class="sim-switch tone-cyan">
        <input type="checkbox" id="chk-vectors" checked>
        <span class="slider-round"></span>
    </label>
</div>

<!-- Use .segmented-grid-3 para grids 2×3 equilibrados com 6 opções -->
<div class="segmented-control">
    <button type="button" class="segment-btn active" data-mode="euler">Euler</button>
    <button type="button" class="segment-btn" data-mode="verlet">Verlet</button>
    <button type="button" class="segment-btn" data-mode="rk4">RK4</button>
</div>

<select id="preset-select" class="sim-control" data-focus-control="select" data-focus-order="4">
    <option value="harmonic">Oscilador Harmônico</option>
    <option value="duffing">Oscilador de Duffing</option>
</select>

<input type="number" id="expr-input" class="sim-input w-full" value="42">
<div class="field-hint"></div>
```
> **Contrato de Estados Semânticos (`setFieldState`)**: Os estados `.is-valid`, `.is-invalid`, `.is-warning` e `.is-ready` **mantêm os contornos, sliders, inputs e botões com as cores originais do tema**, alterando exclusivamente a cor semântica de `.field-hint` e de `.icon-svg` com a classe de estado. Já `.is-disabled` reduz a opacidade (`0.4`), bloqueia ponteiro (`pointer-events: none`) e desabilita automaticamente inputs/botões internos para teclado.

### 3.5 Leituras Numéricas (`.sim-readout`) e Status Badges (`.sim-badge`)
```html
<div class="sim-readout">
    <div class="sim-readout-title">
        <img src="../assets/icons/gauge.svg" class="icon-svg icon-accent" alt="">
        <span>Invariantes do Sistema</span>
    </div>
    <div class="sim-readout-row">
        <span class="sim-readout-label">Energia Total ($E$):</span>
        <span id="val-energy" class="sim-readout-value tone-accent">12.45 J</span>
    </div>
</div>

<div class="sim-badge"><span class="status-dot"></span><span>Ativo</span></div>
<div class="sim-badge idle"><span class="status-dot"></span><span>Em Espera</span></div>
```

### 3.6 Card de Gráfico 2D (`.sim-plot-card`)
```html
<div class="sim-plot-card">
    <div class="plot-header">
        <div class="plot-title-group">
            <span class="plot-dot"></span>
            <span class="plot-title">Velocidade Angular $\omega(t)$</span>
        </div>
        <div class="plot-stats">
            <span class="plot-stat-label">Atual:</span>
            <span class="plot-stat-val" id="plot-current-val">0.00 rad/s</span>
        </div>
    </div>
    <!-- Adicione .plot-canvas-tall para altura 110px (padrão: 84px) -->
    <div class="plot-canvas-wrapper">
        <canvas id="plot-canvas" class="sim-plot-canvas"></canvas>
        <span class="plot-axis-label plot-axis-max" id="plot-axis-max">+1.2</span>
        <span class="plot-axis-label plot-axis-min" id="plot-axis-min">-1.2</span>
    </div>
</div>
```

### 3.7 Overlays de Canvas: HUD, Badge, Hint, Tooltip e Popover
```html
<div class="sim-hud">
    <div class="hud-item">
        <span class="hud-label">Raio ($R$)</span>
        <span id="hud-radius" class="hud-val tone-cyan">1.00 m</span>
    </div>
</div>

<div class="canvas-info-badge">Cena 3D · Regime Estacionário</div>

<div class="interactive-hint">
    <img src="../assets/icons/mouse-left.svg" class="icon-svg" alt="">
    <span>Arraste para orbitar • Scroll para zoom</span>
</div>

<div id="cell-tooltip" class="cell-tooltip">
    <div class="tooltip-header"><span>Sítio (4, 7)</span></div>
    <div class="tooltip-row">
        <span class="tooltip-lbl">Campo</span>
        <span class="tooltip-v">-2.4 J</span>
    </div>
</div>

<div id="custom-popover" class="sim-popover hidden">
    <div class="popover-header">
        <div class="popover-title">
            <img src="../assets/icons/sliders.svg" class="icon-svg" alt="">
            <span>Configuração</span>
        </div>
        <button type="button" class="popover-close" aria-label="Fechar">✕</button>
    </div>
    <div class="popover-body">...</div>
</div>
```

### 3.8 Teoria, Visor Dinâmico KaTeX, Referência Bibliográfica e Modais (`.theory-card`, `.sim-math-display`, `.biblio-ref`, `.sim-modal-overlay`)
* **Referência Bibliográfica (`.biblio-ref`)**: bloco padronizado para citações e links bibliográficos na aba de Teoria (com suporte nativo aos temas Claro e Escuro).
* **Modal de Teoria**: sempre inicia com `.hidden`, usa `.sim-modal-container` (nunca `.sim-modal-content`) e fecha via `[data-modal-close]` / `.sim-modal-close` (nunca `.sim-modal-close-btn`).
* **Modal de Onboarding (`#modal-onboarding`)**: linguagem direta focada na intuição de uso, **sem ícones dentro de `.onboarding-card-title`**, e incluindo o painel de compartilhamento `#onboarding-qr-panel` + `#btn-toggle-onboarding-qr`.
```html
<div class="theory-card">
    <h4><img src="../assets/icons/book-open.svg" class="icon-svg icon-accent" alt=""> Equação de Movimento</h4>
    <p>Evolução temporal governada pelo Hamiltoniano:</p>
    $$i\hbar \frac{\partial}{\partial t}|\psi(t)\rangle = \hat{H}|\psi(t)\rangle$$
    <div id="math-live-display" class="sim-math-display"></div>
</div>

<div class="biblio-ref">
    <strong>Referência:</strong> Título da Obra (Autor, Editora).
</div>

<!-- Modal Imersivo (.sim-modal-overlay.hidden) -->
<div id="modal-theory" class="sim-modal-overlay hidden" aria-hidden="true" role="dialog">
    <div class="sim-modal-container">
        <div class="sim-modal-header">
            <div class="sim-modal-title">
                <img src="../assets/icons/book-open.svg" class="icon-svg icon-accent" alt="">
                <span>Dedução Formal</span>
            </div>
            <button type="button" class="sim-modal-close" data-modal-close title="Fechar (Esc)" aria-label="Fechar">✕</button>
        </div>
        <div class="sim-modal-body">
            <div class="theory-section">
                <h4>1. Princípio da Mínima Ação</h4>
                <p>Considere $S[q] = \int_{t_1}^{t_2} L(q, \dot{q}, t)\,dt$.</p>
                <div class="theory-callout"><strong>Observação:</strong> ...</div>
            </div>
        </div>
        <div class="sim-modal-footer">
            <span class="sim-modal-hint">Pressione <kbd>Esc</kbd> para fechar</span>
            <button type="button" class="btn-primary" data-modal-close>Entendido</button>
        </div>
    </div>
</div>
```
*(Para o markup completo de `#modal-onboarding` com `#onboarding-qr-panel`, consulte `templates/simulacao-template.html` ou `simulacoes/ui_lab.html`.)*

---

## 4. API Completa de `simulacoes/scripts/sim-ui.js` (36 Exportações)

Sempre importe de `./sim-ui.js`:

### 4.1 Ícones SVG & Acento Global
* `getSVGContent(iconName)` — `async`. Busca `../assets/icons/<iconName>.svg` (sem `.svg`) com cache em memória e verificação `res.ok`. Retorna `Promise<string|null>`.
* `setElementIcon(containerEl, iconName)` — `async`. Substitui ou insere `.icon-svg` em `containerEl` preservando classes existentes (`.icon-accent`, `.icon-spin`, etc.). Passe apenas o nome sem `.svg` (ex.: `setElementIcon(btn, 'pause')`).
* `inlineSVGImages(root = document)` — `async`. Converte tags `<img class="icon-svg">` dentro de `root` (elemento, documento ou seletor) em `<svg>` inline.
* `setGlobalAccent(color)` — Define `--accent-color` em `:root` e sincroniza `.toolbar-dot` / `.theme-dot-btn`.

### 4.2 Controles Interativos & Estados Semânticos
* `initToggleButton(target, onToggleCallback, options = {})` — Inicializa toggle binário `0`/`1`, atalho `Space` (ignora modais abertos, inputs, selects e botões/links focados) e sincronização com `#footer-status-badge`.
  * `options`: `{ enableSpaceShortcut, syncFooterBadge }`.
  * Retorno: `{ toggle(), setState(newState, triggerCallback = false), getState(), isActive() }`.
* `syncDualSlider(sliderTarget, numTarget, onChangeCallback)` — Sincroniza `<input type="range">` e `<input type="number">` bidirecionalmente, com clamping `min`/`max` seguro (`Number.isFinite`), sem disparo duplicado em `change`+`blur`, e sincronizando o espelho do Modo Foco.
  * Retorno: `{ getValue(), setValue(val, triggerCallback = true) }`.
* `setFieldState(target, state = null, hintText = '')` — Aplica `'valid' | 'invalid' | 'warning' | 'ready' | 'disabled' | 'neutral' | null`, atualiza `aria-invalid`/`aria-disabled`, desabilita inputs internos em `'disabled'` e atualiza `.field-hint` (aceita tanto o container quanto o próprio elemento `.field-hint`).

### 4.3 Layout, Abas, Modo Foco, Mobile & Modais
* `initTabs(root = document, onTabChange = null)` — Configura `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`, navegação por setas (`ArrowLeft`/`ArrowRight`/`Home`/`End`), auto-render KaTeX na aba ativa e dispara evento único `tabchange`.
* `initSidebarCollapse({ layoutSelector = '.sim-layout', collapseBtnSelector = '#btn-collapse-sidebar', expandBtnSelector = '#btn-expand-sidebar', onResize } = {})` — Recolhe/expande sidebar no desktop (`F` ou `[`, ignorando modificadores `Ctrl`/`Meta`/`Alt`, inputs, selects e modais abertos). Retorna `{ collapse(), expand(), toggle(), isCollapsed() }`.
* `initFocusMirrorToolbar({ toolbarTarget, scopeSelector = '.controls-panel', layoutSelector = '.sim-layout', onlyInFocusMode = true, onRebuild = null } = {})` — Espelha `[data-focus-control]` (`action`, `toggle`, `select`, `slider`, `badge`) na barra flutuante com sincronia bidirecional (incluindo ícone dinâmico de toggle, `.slider-mirror-val` e limpeza via `AbortController`). Retorna `{ rebuild(ctx), getContainer(), destroy() }`.
* `initViewportFix(onUpdate = null)` — Monitora `visualViewport`, aplica `.is-keyboard-open` em `<html>` e fallback de `--app-height`. Retorna `{ getMetrics(), update() }`.
* `initBottomSheet({ panelSelector = '.controls-panel', triggerSelector = '#btn-mobile-settings', defaultState = 'peek', onStateChange } = {})` — Gerencia o Painel Flutuante mobile (`<= 900px`), reseta estado ao ir para desktop e chama `initViewportFix()`. Retorna `{ setState(state), getState(), isOpen(), open(), close(), toggle() }`.
* `initModal(modalTarget, { triggerSelector = null, autoOpenFirstSession = false, storageKey, onOpen = null, onClose = null } = {})` — Gerencia `.sim-modal-overlay` com `aria-modal="true"`, focus-trap (`Tab`/`Shift+Tab`), retorno de foco ao fechar, `Escape`, backdrop e suporte a modais empilhados. Retorna `{ open(), close(), toggle() }`.
* `initOnboardingModal(modalTarget = '#modal-onboarding', options = {})` — Wrapper de `initModal` com `triggerSelector: '#btn-open-onboarding'`, `autoOpenFirstSession: true` e inicialização automática de `initOnboardingQRCode`.
* `initOnboardingQRCode(modalTarget, { url } = {})` — Carrega `qr-generator.js` sob demanda no `#onboarding-qr-panel` e gerencia cópia de link. Retorna `{ show(), hide(), toggle() }`.
* `getCanonicalSimulationUrl(overrideUrl = '')` — Resolve a URL pública canônica no GitHub Pages a partir de `KNOWN_SIMULATIONS`.

### 4.4 Gráficos 2D em Tempo Real & Tela Cheia
* `class RealtimePlot(canvasTarget, { maxPoints = 80, minVal = -1.2, maxVal = 1.2, color, autoScale = false, minSpan = 0.1, maxLabelSelector, minLabelSelector, keepRecords = false, maxHistoryPoints = 50000, disableFullscreen = false, onOpenFullscreen = null, unit = '', title = '' } = {})`
  * Prioriza `options.color` quando explicitamente fornecido (com fallback `--accent-hud` → `--accent-color`) e adapta cores automaticamente no Tema Claro.
  * Métodos: `.push(val, time?)`, `.setKeepRecords(enabled)`, `.getActiveRecords()`, `.clear()`, `.openFullscreen()`, `.resize()`, `.render()`, `.destroy()`.
* `class MultiSeriesPlot(canvasTarget, { maxPoints = 100, mode = 'time-series', series, showLegend = true, showGrid = true, minVal, maxVal, keepRecords = false, maxHistoryPoints = 50000, disableFullscreen = false, onOpenFullscreen = null, title = '' } = {})`
  * Suporta `mode: 'time-series'` e `mode: 'phase-space'`.
  * Métodos: `.push(dataRecord, time?)`, `.pushPhasePoint(x, p)`, `.setKeepRecords(enabled)`, `.getActiveRecords()`, `.getActivePhaseRecords()`, `.clear()`, `.openFullscreen()`, `.resize()`, `.render()`, `.destroy()`.
* `openPlotFullscreenModal(plotInstance)` — Pausa a simulação (`#btn-play-sim` ou `#canvas-transport-toolbar .btn-toggle`) e abre `.modal-plot-viewer` com crosshair, estatísticas e exportação CSV/PNG.

### 4.5 Álgebra Linear, Tensores & KaTeX
* `det2x2(M)`, `trace2x2(M)`, `eigen2x2(M)` — Aceitam `[[a, b], [c, d]]` ou `{ a, b, c, d }`.
* `det3x3(A)`, `trace3x3(A)`, `solveEigenvaluesSymmetric3x3(A)`, `diagonalizeSymmetric3x3(A_in, maxSweeps = 30)` — Operam sobre matrizes $3\times 3$.
* `class MatrixTensorEditor(container, { dim = 2, symmetric = false, step = 0.1, labels = null, initialValue = null, onChange = () => {} } = {})`
  * Renderiza rótulos LaTeX em `.cell-sub` via KaTeX (com fallback `<sub>`) e executa diagonalização Jacobi em $3\times 3$ apenas quando a matriz é simétrica (`isSymmetric: true`).
  * Métodos: `.getMatrix()`, `.setMatrix(M)`, `.notifyChange()`.
* `renderMath(target, tex, options = {})` — Renderiza `tex` em `target` (elemento ou seletor) via `katex.render`.
* `renderMathToString(tex, options = {})` — Retorna string HTML compilada pelo KaTeX.
* `initKaTeXAutoRender(root = document.body, customOptions = {})` — Executa `renderMathInElement` com retentativas de contingência.

### 4.6 Sistema de Temas Claro / Escuro
* `getTheme()` — Retorna `'dark' | 'light'`.
* `getThemeColors()` — Extrai as cores computadas do tema atual (`theme`, `bgMain`, `bgSurface`, `bgCard`, `bgCanvas`, `accent`, `accentFg`, `textPrimary`, `textSecondary`, `textMuted`, `border`, `plotBg`, `plotGrid`, `plotAxis`, `plotText`, `plotCrosshair`, `plotTooltipBg`, `plotTooltipBorder`, `plotTooltipText`, `canvasGrid`, `canvasText`, `cyan`, `emerald`, `purple`, `rose`, `pink`, `orange`).
* `setTheme(theme, { persist = true } = {})` — Aplica `data-theme`, atualiza `meta[name="theme-color"]` (`#1c1917` / `#fafaf9`), persiste em `localStorage('sim_theme')`, sincroniza `#btn-theme-toggle`, redesenha o plot modal se estiver aberto e dispara `themechange`.
* `toggleTheme()` — Alterna entre `'dark'` e `'light'`.
* `onThemeChange(callback)` — Inscreve listener em `themechange`; retorna função de cancelamento.
* `initThemeToggle(target = '#btn-theme-toggle')` — Inicializa o botão de tema e sincronização entre abas (auto-inicializado no carregamento de `sim-ui.js`).
