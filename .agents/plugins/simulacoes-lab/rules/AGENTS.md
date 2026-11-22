# Regras de Engenharia para Simulações Científicas (Design System 2.0)

Invariantes obrigatórios para toda simulação científica e matemática do projeto. Para procedimentos passo a passo, templates e catálogo completo, consulte a skill `desenvolver-simulacao`.

---

## 1. Arquitetura, Fonte da Verdade e Dependências
* **Estrutura**: HTML em `simulacoes/`, scripts ES Modules em `simulacoes/scripts/` e estilos complementares opcionais em `simulacoes/css/`.
* **Fonte da Verdade Canônica (`ui_lab`)**: `simulacoes/ui_lab.html` e `simulacoes/scripts/ui_lab.js` são o catálogo oficial de componentes.
  * **Restrição Estrita**: Só utilize componentes, controles e padrões existentes no `ui_lab`. É proibido inventar marcações HTML/CSS avulsas fora do padrão.
  * **Sincronização Obrigatória**: Qualquer novo componente, variante ou controlador adicionado a `design-system.css` ou `sim-ui.js` DEVE ser demonstrado em `ui_lab.html` / `ui_lab.js` e documentado nas referências do plugin.
* **Boot de Tema e CSS Base**: Toda página DEVE incluir `<script src="../theme-init.js"></script>` imediatamente antes de `<link rel="stylesheet" href="css/design-system.css">` (zero-FOUC), além do botão `#btn-theme-toggle` em `.sim-header-actions`.
* **Módulos e Bibliotecas**: Scripts em ES Modules importando de `./sim-ui.js`, Three.js via `importmap` padronizado e matemática via KaTeX CDN (`initKaTeXAutoRender()`, `renderMath()`, `renderMathToString()`).

---

## 2. Padrões Visuais, Temas e Tokens
* **Sem Hexadecimais Soltos na UI**: Utilize estritamente os tokens de `:root` e `:root[data-theme="light"]` (**Superfície Papel**: `#1c1917` escuro / `#fafaf9` claro; contornos `--ui-border-width: 1.5px`; divisores Limpo padrão) e as classes `.tone-*` (`.tone-accent`, `.tone-cyan`, `.tone-emerald`, `.tone-purple`, `.tone-pink`, `.tone-rose`, `.tone-orange`), válidas em textos/readouts/badges e controles interativos.
* **Blindagem do Palco Escuro**: O palco (`.canvas-area` e filhos diretos `.canvas-area > *`) permanece escuro no Modo Claro; utilize os tokens `--stage-*` para elementos da cena 3D/2D e `getThemeColors()` / `onThemeChange()` para gráficos 2D.
* **75 Ícones Vetoriais Nativos**: Utilize apenas os **75 SVGs** de `../assets/icons/<nome>.svg` com `.icon-svg` e `inlineSVGImages()`.

---

## 3. Controles, Física e Onboarding (`sim-ui.js`)
* **Abas e Sliders**: Navegação com `<div class="tab-nav" role="tablist">` + `.tab-btn[data-tab]` + `.tab-pane` via `initTabs()`; parâmetros contínuos com `.slider-container.sim-dual-slider` via `syncDualSlider()`.
* **Transporte Flutuante e Desacoplamento Física vs. Apresentação**: Simulações temporais DEVEM usar `#canvas-transport-toolbar` (`.canvas-toolbar.pos-bottom-center`) dentro de `.canvas-area` (proibido usar `.sim-transport-bar` legado na sidebar) com `initToggleButton()`. Separe estritamente:
  * `stepPhysics(dt)`: executa **apenas** quando `state.isRunning === true` (ou em passo único).
  * `updateVisualScene()`: *Presentation Pass* chamado por todo controle de UI para feedback visual imediato mesmo pausado.
* **Estados Semânticos (`setFieldState`)**: Comunica `.is-valid`, `.is-invalid`, `.is-warning`, `.is-ready` e `.is-disabled` alterando **apenas** `.field-hint` e `.icon-svg` (sem repintar contornos/inputs/sliders), além de desabilitar inputs internos em `'disabled'`.
* **Telemetria, Álgebra Linear e Modo Foco**: Gráficos em `.sim-plot-card` via `RealtimePlot` / `MultiSeriesPlot`; matrizes/tensores via `MatrixTensorEditor`; leituras via `.sim-readout`, `.sim-hud` e `.canvas-info-badge`; Modo Foco declarativo via `data-focus-control` (`slider` sempre no `<input type="range">`, nunca na `<div>`) e `initFocusMirrorToolbar()`.
* **Onboarding Simplificado e Teoria**: `#modal-onboarding` via `initOnboardingModal()` com linguagem intuitiva, **sem ícones em `.onboarding-card-title`**, e painel `#onboarding-qr-panel` + `#btn-toggle-onboarding-qr`; deduções formais em `.theory-card` ou `.sim-modal-overlay.hidden` via `initModal()`.

---

## 4. Responsividade, Viewport e Validação Obrigatória
* **Meta Tags**: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">` e `<meta name="theme-color" content="#1c1917">`.
* **Proibição de `vh` Puro e Safe Areas**: Utilize `var(--app-height)` e some `var(--safe-bottom)` em elementos ancorados na base.
* **Desktop & Mobile**: Modo Foco desktop (`initSidebarCollapse()`, tecla `F`/`[`), Painel Flutuante mobile `<= 900px` (`#btn-mobile-settings` + `initBottomSheet()`, sem `.sheet-drag-handle` legado), `touch-action: none` no canvas e Pointer Events.
* **Gate Automatizado**: Antes de encerrar qualquer alteração no Design System ou em simulações, execute `node simulacoes/scripts/validate-ds.js` e corrija todos os erros reportados.
