---
name: desenvolver-simulacao
description: >-
  Criação, refatoração, modernização e manutenção de simulações científicas e matemáticas
  no padrão Design System 2.0 (sim-ui.js, ui_lab.html como fonte da verdade canônica, layout
  responsivo desktop/mobile bottom-sheet, Three.js, KaTeX e 71 ícones nativos). Use sempre que
  o usuário pedir para criar uma nova simulação, migrar uma simulação legada, adicionar
  controles físicos, criar novos componentes de UI ou ajustar a interface.
---

# Workflow: Desenvolvimento e Modernização de Simulações Científicas

Este guia operacional orienta a criação do zero, a refatoração de simulações interativas e a evolução de componentes para a plataforma, assegurando conformidade estrita com o **Design System 2.0** e com a vitrine canônica **`ui_lab`**.

---

## 1. Documentos e Recursos de Referência (Fonte da Verdade)

Ao executar este fluxo, consulte obrigatoriamente os arquivos de referência:
* **Vitrine Canônica de Componentes (HTML)**: [`simulacoes/ui_lab.html`](../../../../simulacoes/ui_lab.html)
* **Vitrine Canônica de Controladores (JS)**: [`simulacoes/scripts/ui_lab.js`](../../../../simulacoes/scripts/ui_lab.js)
* **Biblioteca Central de UI**: [`simulacoes/scripts/sim-ui.js`](../../../../simulacoes/scripts/sim-ui.js)
* **Folha de Estilos do Design System**: [`simulacoes/css/design-system.css`](../../../../simulacoes/css/design-system.css)
* **Especificação Completa de Componentes**: [references/design-system-guide.md](./references/design-system-guide.md)
* **Catálogo de Ícones Nativos (71 SVGs)**: [references/icon-catalog.md](./references/icon-catalog.md)
* **Template HTML Base**: [templates/simulacao-template.html](./templates/simulacao-template.html)
* **Template JS Modular**: [templates/simulacao-template.js](./templates/simulacao-template.js)

> **Regra de Ouro (`ui_lab`)**: Nenhuma simulação pode introduzir sliders, botões, seletores, readouts ou gráficos fora do padrão demonstrado em `simulacoes/ui_lab.html`. Sempre copie a estrutura DOM semântica validada no `ui_lab`.

---

## 2. Procedimento 1: Criando uma Nova Simulação do Zero

1. **Consulta ao Catálogo (`ui_lab.html`) e Scaffold do HTML**:
   * Crie o arquivo `simulacoes/<nome>.html` copiando a estrutura de [templates/simulacao-template.html](./templates/simulacao-template.html).
   * Atualize a tag `<title>`, o cabeçalho `.sim-title` e a importação do script final (`scripts/<nome>.js`).
   * Configure a navegação por abas usando `.tab-nav` com botões `.tab-btn[data-tab="..."]` e painéis `.tab-pane`.
   * Insira os controles necessários baseando-se exclusivamente nas marcações de `simulacoes/ui_lab.html`:
     - `.sim-transport-bar` para controle temporal (Play/Pause, Passo, Reset e Velocidades).
     - `.sim-dual-slider` para parâmetros numéricos contínuos.
     - `.sim-switch` e `.segmented-control` para opções booleanas ou modos discretos.
     - `.sim-readout` (`.sim-readout-row` + `.tone-*`) para painéis de grandezas calculadas.
     - `.sim-plot-card` para gráficos `RealtimePlot` ou `MultiSeriesPlot`.
     - Container para `MatrixTensorEditor` caso a simulação envolva matrizes $2\times 2$ ou tensores $3\times 3$.
     - Atributos `data-focus-control` nos controles essenciais que devem aparecer na barra flutuante durante o Modo Foco (`F`).
   * Configure a teoria e equações KaTeX em `.theory-card` na aba de teoria e/ou no modal `.sim-modal-overlay`.

2. **Scaffold do JavaScript**:
   * Crie `simulacoes/scripts/<nome>.js` a partir de [templates/simulacao-template.js](./templates/simulacao-template.js).
   * Importe os controladores necessários de `./sim-ui.js`: `initSidebarCollapse`, `initBottomSheet`, `initTabs`, `initFocusMirrorToolbar`, `initToggleButton`, `syncDualSlider`, `setFieldState`, `RealtimePlot`, `MultiSeriesPlot`, `MatrixTensorEditor`, `initModal`, `inlineSVGImages`, `initKaTeXAutoRender`, `renderMath`.
   * Conecte cada grandeza física com `syncDualSlider('#slider-id', '#num-id', callback)`.
   * Utilize `setFieldState(target, state, hintText)` sempre que precisar indicar estados semânticos (`.is-valid`, `.is-warning`, `.is-invalid`, `.is-ready`, `.is-disabled`).
   * Finalize a inicialização chamando `await inlineSVGImages()` e `initKaTeXAutoRender()`.

3. **Verificação de Estilos Complementares**:
   * O estilo principal é suprido integralmente por `css/design-system.css`.
   * Se a simulação exigir regras específicas de layout interno do canvas, crie `css/<nome>.css` contendo apenas regras de domínio restrito, derivando todas as cores de `var(--accent-color)` e das variáveis semânticas do `:root`.

---

## 3. Procedimento 2: Migrando uma Simulação Legada para o DS 2.0

Para atualizar uma simulação existente que ainda não segue o Design System 2.0:

1. **Substituição do Layout HTML**:
   * Migrar `<header>` para a estrutura `.sim-header` com `.btn-back` e `.sim-title`.
   * Envolver a área visual e controles em `<main class="sim-layout">`.
   * Envolver o canvas em `<div class="canvas-area">` com `#three-container` (ou `<canvas>`) e as ações flutuantes (`.canvas-top-actions`).
   * Substituir barras laterais antigas por `<aside class="controls-panel">` contendo:
     - `.sheet-drag-handle` (essencial para mobile).
     - `.tab-nav` com botões `.tab-btn[data-tab="..."]`.
     - `.panel-body` rolável contendo `.tab-pane`.
     - `.panel-footer` com `.sim-badge` de status e timer.

2. **Refatoração dos Controles (Alinhamento com `ui_lab.html`)**:
   * Substituir inputs e sliders avulsos pela estrutura `.sim-dual-slider`.
   * Substituir botões de Play/Pausa antigos por `.sim-transport-bar` com botão toggle.
   * Substituir tabelas ou inputs de matrizes avulsos por `MatrixTensorEditor` e gráficos externos (ex.: Chart.js) por `RealtimePlot` ou `MultiSeriesPlot`.
   * Substituir listas de valores estáticos por blocos `.sim-readout`.
   * Substituir ícones de bibliotecas externas pelos 71 SVGs nativos de `../assets/icons/` com a classe `icon-svg`.

3. **Refatoração do JavaScript**:
   * Converter o script para módulo ES (`type="module"`).
   * Importar e inicializar `initSidebarCollapse`, `initBottomSheet`, `initTabs`, `initFocusMirrorToolbar`, `inlineSVGImages` e `initKaTeXAutoRender` de `./sim-ui.js`.
   * Adicionar anotações `data-focus-control` nos controles prioritários para popularem a barra flutuante no Modo Foco sem duplicação de listeners.
   * Garantir `touch-action: none;` no container do canvas e usar Pointer Events (`pointerdown`, `pointermove`, `pointerup`).

---

## 4. Procedimento 3: Criando ou Evoluindo um Componente no Design System

Sempre que uma simulação demandar um componente inédito que ainda não exista no Design System:
1. **Proibição de Solução Local Isolada**: Não crie o componente apenas no CSS/JS da simulação específica se ele tiver utilidade estrutural ou de controle de UI.
2. **Implementação Centralizada**: Adicione os estilos genéricos baseados em tokens em `simulacoes/css/design-system.css` e o controlador em `simulacoes/scripts/sim-ui.js`.
3. **Demonstração Obrigatória no `ui_lab`**: Adicione imediatamente um exemplo funcional e interativo do novo componente em `simulacoes/ui_lab.html` e exporte/inicialize-o em `simulacoes/scripts/ui_lab.js`.
4. **Atualização da Documentação**: Documente a assinatura e o HTML padrão em [references/design-system-guide.md](./references/design-system-guide.md) (e em [references/icon-catalog.md](./references/icon-catalog.md) caso novos ícones SVG sejam adicionados em `assets/icons/`).

---

## 5. Checklist de Qualidade Obrigatório

Antes de concluir qualquer tarefa de simulação ou UI, verifique os seguintes pontos:
- [ ] Todos os componentes utilizados na simulação existem e seguem a marcação canônica de `simulacoes/ui_lab.html`.
- [ ] Se algum componente ou ícone novo foi criado no projeto, ele foi adicionado ao `ui_lab.html` / `ui_lab.js` e ao catálogo do plugin.
- [ ] O layout possui as duas experiências: Desktop (com modo foco `F`) e Mobile (Bottom Sheet deslizante).
- [ ] A alça `.sheet-drag-handle` está presente no topo do `.controls-panel`.
- [ ] A navegação de abas utiliza `initTabs()` (ou mapeamento equivalente sem conflitos) e re-renderiza fórmulas KaTeX.
- [ ] Os controles vitais para Modo Foco possuem `data-focus-control` e são sincronizados via `initFocusMirrorToolbar()`.
- [ ] Os sliders de parâmetros físicos estão sincronizados bidirecionalmente com os inputs numéricos via `syncDualSlider()`.
- [ ] Estados de validação ou prontidão utilizam `setFieldState()` (`.is-valid`, `.is-invalid`, `.is-warning`, `.is-ready`, `.is-disabled`) e `.field-hint`.
- [ ] Todos os ícones utilizam `../assets/icons/<nome>.svg` com a classe `.icon-svg` e `inlineSVGImages()`.
- [ ] Todas as equações matemáticas estão formatadas com KaTeX (`$$...$$` ou `$...$`) e inicializadas com `initKaTeXAutoRender()`.
- [ ] Não há cores hexadecimais arbitrárias soltas sobrescrevendo os tokens do `:root`.
- [ ] O redimensionamento de janela (`resize`) ajusta a câmera e o renderer Three.js / Canvas 2D sem distorção visual.
