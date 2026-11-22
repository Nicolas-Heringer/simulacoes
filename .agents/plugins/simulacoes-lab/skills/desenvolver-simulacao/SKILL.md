---
name: desenvolver-simulacao
description: >-
  Guia operacional para criação, refatoração, modernização e manutenção de simulações
  científicas e matemáticas no padrão Design System 2.0 (sim-ui.js, ui_lab.html como fonte
  da verdade canônica, temas claro/escuro com blindagem do palco, painel flutuante mobile,
  Three.js, KaTeX, 75 ícones SVG nativos e validação automatizada via validate-ds.js).
  Acionado em tarefas de criação de simulações, migração de páginas legadas, adição de
  controles físicos ou evolução de componentes do Design System.
---

# Workflow: Desenvolvimento e Modernização de Simulações Científicas

Este guia operacional orienta a criação do zero, a refatoração de simulações interativas e a evolução de componentes para a plataforma, assegurando conformidade estrita com o **Design System 2.0**, com a vitrine canônica **`ui_lab`** e com o validador automatizado **`validate-ds.js`**.

---

## 1. Documentos e Recursos de Referência (Fonte da Verdade)

Ao executar este fluxo, consulte obrigatoriamente os arquivos de referência:
* **Vitrine Canônica de Componentes (HTML)**: [`simulacoes/ui_lab.html`](../../../../../simulacoes/ui_lab.html)
* **Vitrine Canônica de Controladores (JS)**: [`simulacoes/scripts/ui_lab.js`](../../../../../simulacoes/scripts/ui_lab.js)
* **Biblioteca Central de UI**: [`simulacoes/scripts/sim-ui.js`](../../../../../simulacoes/scripts/sim-ui.js)
* **Folha de Estilos do Design System**: [`simulacoes/css/design-system.css`](../../../../../simulacoes/css/design-system.css)
* **Validador Automatizado (CI Gate)**: [`simulacoes/scripts/validate-ds.js`](../../../../../simulacoes/scripts/validate-ds.js)
* **Especificação Completa de Componentes**: [references/design-system-guide.md](./references/design-system-guide.md)
* **Catálogo de Ícones Nativos (75 SVGs)**: [references/icon-catalog.md](./references/icon-catalog.md)
* **Template HTML Base**: [templates/simulacao-template.html](./templates/simulacao-template.html)
* **Template JS Modular**: [templates/simulacao-template.js](./templates/simulacao-template.js)

> **Regra de Ouro (`ui_lab`)**: Nenhuma simulação pode introduzir sliders, botões, seletores, readouts ou gráficos fora do padrão demonstrado em `simulacoes/ui_lab.html`. Sempre copie a estrutura DOM semântica validada no `ui_lab`.

---

## 2. Procedimento 1: Criando uma Nova Simulação do Zero

1. **Consulta ao Catálogo (`ui_lab.html`) e Scaffold do HTML**:
   * Crie `simulacoes/<nome>.html` a partir de [templates/simulacao-template.html](./templates/simulacao-template.html).
   * Atualize `<title>` e o `<script type="module" src="scripts/<nome>.js">`. Mantenha `<meta name="theme-color" content="#1c1917">` e `<script src="../theme-init.js"></script>` antes de `css/design-system.css` para boot sem piscada.
   * Mantenha `.sim-header` com `.btn-back` à esquerda e `.sim-header-actions` contendo `#btn-theme-toggle` e `#btn-open-onboarding` à direita.
   * Estruture abas com `<div class="tab-nav" role="tablist">`, botões `<button type="button" class="tab-btn" data-tab="...">` e painéis `.tab-pane` (sem `style="display: none;"` inline).
   * Insira controles exclusivamente a partir de `simulacoes/ui_lab.html`:
     - `#canvas-transport-toolbar` (`.canvas-toolbar.pos-bottom-center`) dentro de `.canvas-area`.
     - `#btn-mobile-settings` (`.canvas-btn-settings`) dentro de `.canvas-area`.
     - `.slider-container.sim-dual-slider` para parâmetros contínuos (com `data-focus-control="slider"` diretamente no `<input type="range">`).
     - `.sim-switch`, `.segmented-control`, `select.sim-control` e `.sim-readout` (com `.tone-*` quando aplicável).
     - `.sim-plot-card` para `RealtimePlot` ou `MultiSeriesPlot`; container para `MatrixTensorEditor` quando houver matrizes/tensores.
   * Configure `#modal-onboarding` com linguagem intuitiva, **sem ícones dentro de `.onboarding-card-title`**, preservando `#onboarding-qr-panel` e `#btn-toggle-onboarding-qr`.
   * Registre o arquivo `<nome>.html` no catálogo `KNOWN_SIMULATIONS` em `simulacoes/scripts/sim-ui.js` para a geração canônica do QR Code.

2. **Scaffold do JavaScript**:
   * Crie `simulacoes/scripts/<nome>.js` a partir de [templates/simulacao-template.js](./templates/simulacao-template.js).
   * Importe os controladores necessários de `./sim-ui.js`: `initSidebarCollapse`, `initBottomSheet`, `initTabs`, `initFocusMirrorToolbar`, `initToggleButton`, `syncDualSlider`, `setFieldState`, `RealtimePlot`, `MultiSeriesPlot`, `MatrixTensorEditor`, `initModal`, `initOnboardingModal`, `getTheme`, `getThemeColors`, `onThemeChange`, `initThemeToggle`, `inlineSVGImages`, `initKaTeXAutoRender`, `renderMath`.
   * Conecte os controles de transporte sincronizando `playControl.setState(0, true)` em Passo Único e Reset para garantir que `state.isRunning` seja atualizado corretamente.
   * **Desacoplamento Física vs. Apresentação**: mantenha `stepPhysics(dt)` isolado (executado apenas com `state.isRunning === true` ou passo único) e invoque `updateVisualScene()` em todo controle de interface para atualização imediata mesmo pausado.
   * Finalize com `await inlineSVGImages()` e `initKaTeXAutoRender(document.body)`.

3. **Estilos Complementares**:
   * Crie `simulacoes/css/<nome>.css` apenas para regras restritas ao domínio do palco/canvas, consumindo exclusivamente tokens CSS de `:root` / `--stage-*` (evite hexadecimais hardcoded na UI).

---

## 3. Procedimento 2: Migrando uma Simulação Legada para o DS 2.0

1. **Migração do `<head>` e Layout HTML**:
   * Garantir `viewport-fit=cover, interactive-widget=resizes-content`, `<meta name="theme-color" content="#1c1917">` e `<script src="../theme-init.js"></script>` antes de `css/design-system.css`.
   * Migrar `<header>` para `.sim-header` com `.btn-back` à esquerda e `.sim-header-actions` (`#btn-theme-toggle` + `#btn-open-onboarding`) à direita.
   * Envolver área visual e painel em `<main class="sim-layout">` com `<div class="canvas-area">` contendo `#three-container` (ou `<canvas>`), `.canvas-top-left-stack` (`#focus-context-toolbar` sem `style="display: none;"`), `.canvas-top-actions` (`#btn-expand-sidebar`), `#canvas-transport-toolbar` (`.canvas-toolbar.pos-bottom-center`) e `#btn-mobile-settings` (`.canvas-btn-settings`).
   * Migrar a barra lateral para `<aside class="controls-panel">` com `<div class="tab-nav" role="tablist">`, `.panel-body` (com `.tab-pane`) e `.panel-footer` (`.sim-badge.idle` + `#footer-sim-timer`). Remover qualquer `.sheet-drag-handle` ou `.sim-transport-bar` legado.

2. **Refatoração dos Controles e Onboarding**:
   * Substituir sliders avulsos por `.slider-container.sim-dual-slider`, matrizes avulsas por `MatrixTensorEditor`, gráficos externos por `RealtimePlot`/`MultiSeriesPlot`, e ícones externos pelos **75 SVGs** de `../assets/icons/` com `.icon-svg`.
   * Atualizar modais para `.sim-modal-overlay.hidden` > `.sim-modal-container` + `[data-modal-close]` (removendo `.sim-modal-content` e `.sim-modal-close-btn` legados).
   * Garantir `#modal-onboarding` com `#onboarding-qr-panel` e sem ícones em `.onboarding-card-title`.

3. **Refatoração do JavaScript**:
   * Converter para ES Module (`type="module"`), inicializar `initSidebarCollapse`, `initBottomSheet` (sem opções legadas), `initTabs`, `initOnboardingModal`, `initFocusMirrorToolbar`, `inlineSVGImages` e `initKaTeXAutoRender`.
   * Usar `getThemeColors()` e `onThemeChange()` em canvas 2D adaptáveis ao tema claro/escuro.
   * Garantir `touch-action: none` no canvas e Pointer Events (`pointerdown`, `pointermove`, `pointerup`).

---

## 4. Procedimento 3: Evoluindo um Componente no Design System

1. **Centralização**: Implemente o estilo baseado em tokens em `simulacoes/css/design-system.css` e o controlador em `simulacoes/scripts/sim-ui.js`.
2. **Paridade no `ui_lab`**: Demonstre o novo componente em `simulacoes/ui_lab.html` e re-exporte/inicialize-o em `simulacoes/scripts/ui_lab.js`.
3. **Documentação**: Atualize [references/design-system-guide.md](./references/design-system-guide.md) (e [references/icon-catalog.md](./references/icon-catalog.md) se adicionar novos SVGs em `assets/icons/`).

---

## 5. Validação Obrigatória (Antes de Concluir)

Antes de finalizar qualquer tarefa em simulações ou no Design System, execute obrigatoriamente no terminal:

```bash
node simulacoes/scripts/validate-ds.js
```

Para auditorias completas durante migrações ou criação de novas simulações, execute também o modo estrito:

```bash
node simulacoes/scripts/validate-ds.js --strict
```

### Checklist de Conformidade Final
- [ ] `node simulacoes/scripts/validate-ds.js` encerra com código `0` (zero erros).
- [ ] Todos os componentes seguem a marcação canônica de `simulacoes/ui_lab.html`.
- [ ] Tema Claro/Escuro validado (`theme-init.js`, `theme-color="#1c1917"`, `#btn-theme-toggle`, blindagem do palco).
- [ ] Experiência Desktop (Modo Foco `F`, foco visível via `Tab`) e Mobile (`<= 900px`, `#btn-mobile-settings`, `var(--app-height)` e `var(--safe-bottom)` sem `vh` puro).
- [ ] Transporte flutuante em `#canvas-transport-toolbar` com desacoplamento `stepPhysics(dt)` vs. `updateVisualScene()` e `setState(0, true)` em Step/Reset.
- [ ] `data-focus-control="slider"` posicionado diretamente no `<input type="range">` e sincronizado via `initFocusMirrorToolbar()`.
- [ ] Onboarding `#modal-onboarding` com `#onboarding-qr-panel` e sem ícones em `.onboarding-card-title`.
- [ ] Apenas ícones válidos dos **75 SVGs** de `assets/icons/` + `inlineSVGImages()` + `initKaTeXAutoRender()`.
