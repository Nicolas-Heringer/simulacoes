# Regras de Engenharia para Simulações Científicas

Este conjunto de regras define os padrões de arquitetura, interface e performance para todas as simulações científicas e matemáticas do projeto.

---

## 1. Arquitetura de Arquivos, Fonte da Verdade e Dependências
* **Localização**: Arquivos HTML residem em `simulacoes/`, scripts JS em `simulacoes/scripts/` e folhas de estilo complementares em `simulacoes/css/`.
* **Fonte da Verdade Canônica (`ui_lab`)**: A página `simulacoes/ui_lab.html` e o script `simulacoes/scripts/ui_lab.js` constituem o catálogo vivo e oficial de todos os componentes de interface permitidos no projeto.
  * **Restrição Estrita de Catálogo**: Os agentes SÓ podem inserir controles, botões, sliders, switches, seletores, readouts, gráficos, editores matriciais, badges e modais que existam e estejam demonstrados em `simulacoes/ui_lab.html` e `simulacoes/scripts/ui_lab.js`. É estritamente proibido inventar marcações HTML/CSS de controles avulsos fora do padrão.
  * **Regra de Sincronização Obrigatória**: Sempre que um novo componente genérico, variante de estado ou controlador for adicionado a `simulacoes/css/design-system.css` ou `simulacoes/scripts/sim-ui.js`, ele DEVE ser obrigatoriamente incluído e demonstrado em `simulacoes/ui_lab.html` e `simulacoes/scripts/ui_lab.js`, além de documentado nas referências do plugin.
* **CSS Base**: Toda página DEVE incluir `<link rel="stylesheet" href="css/design-system.css">`.
* **JavaScript Modular**: Toda simulação DEVE ser estruturada em ES Modules (`<script type="module" src="scripts/...js">`) e importar controladores de UI a partir de `./sim-ui.js`.
* **Biblioteca 3D**: Three.js deve ser importado via importmap padronizado (`three` e `three/addons/`).
* **Fórmulas Matemáticas**: Renderização via KaTeX CDN inicializada com `initKaTeXAutoRender()` e atualizações dinâmicas via `renderMath()` / `renderMathToString()` de `./sim-ui.js`.

---

## 2. Padrões Visuais & Tokens de Design
* **Cores e Superfícies**: É proibido codificar cores hexadecimais soltas para elementos de interface. Utilize estritamente os tokens de `:root` (`--bg-main`, `--bg-surface`, `--bg-card`, `--accent-color`, `--color-cyan`, `--color-emerald`, `--color-purple`, `--color-rose`, `--color-orange`, etc.) e as classes utilitárias de tom (`.tone-accent`, `.tone-cyan`, `.tone-emerald`, `.tone-purple`, `.tone-pink`, `.tone-rose`, `.tone-orange`).
* **Ícones Vetoriais**: Use apenas os 71 ícones SVG nativos de `../assets/icons/` através de `<img src="../assets/icons/<nome>.svg" class="icon-svg">` e converta-os via `inlineSVGImages()`. Os ícones adaptam-se automaticamente à cor do texto via `currentColor`.
* **Nomenclatura Semântica**: Classes CSS e IDs de componentes devem refletir sua função no design system (ex.: `.sim-dual-slider`, `.sim-transport-bar`, `.sim-plot-card`, `.sim-readout`), nunca o domínio exclusivo de uma física em particular (ex.: evite `.temperatura-slider`).

---

## 3. Controles & Componentes Obrigatórios (`sim-ui.js`)
* **Navegação por Abas**: Painéis com múltiplas abas devem utilizar `.tab-nav` com botões `.tab-btn[data-tab="..."]` e painéis `.tab-pane`, inicializados via `initTabs()`.
* **Sliders Numéricos**: Parâmetros físicos devem utilizar a estrutura `.sim-dual-slider` sincronizada via `syncDualSlider(sliderSelector, numberInputSelector, onChange)`.
* **Evolução Temporal**: Simulações que evoluem no tempo devem implementar a barra `.sim-transport-bar` e o botão toggle com `initToggleButton()`.
* **Estados Semânticos de Intencionalidade**: Validação de entradas, alertas físicos e prontidão de ações devem ser comunicados via `setFieldState(target, state, hintText)` aplicando `.is-valid`, `.is-invalid`, `.is-warning`, `.is-ready` ou `.is-disabled` acompanhados de `.field-hint`.
* **Telemetria 2D e Espaço de Fase**: Plotagens em tempo real de uma única grandeza devem usar `RealtimePlot`; múltiplas curvas simultâneas (ex.: energias cinética, potencial e total) ou retratos de espaço de fase $(x, p)$ devem usar `MultiSeriesPlot` dentro de `.sim-plot-card`.
* **Álgebra Linear e Tensores**: Entradas matriciais $2\times 2$ ou $3\times 3$ e cálculo de invariantes (determinante, traço, autovalores e diagonalização simétrica) devem utilizar `MatrixTensorEditor` e os solvers exportados por `sim-ui.js`.
* **Leituras Numéricas e Badges**: Resumos de grandezas calculadas no painel devem utilizar `.sim-readout` (`.sim-readout-title`, `.sim-readout-row`, `.sim-readout-label`, `.sim-readout-value`), e avisos no canvas devem usar `.sim-hud` ou `.canvas-info-badge`.
* **Barra Flutuante de Modo Foco**: Controles que sobem para o menu flutuante em tela cheia/foco DEVEM utilizar a convenção declarativa `data-focus-control` (`action`, `toggle`, `select`, `slider`, `badge`) e ser inicializados via `initFocusMirrorToolbar()`. É proibido duplicar marcação HTML ou adicionar listeners manuais para replicar botões no canvas.
* **Teoria & Deduções**: Conteúdo pedagógico e deduções formais devem ser apresentados em `.theory-card` na aba "Teoria" ou em modal imersivo via `initModal()`.

---

## 4. Responsividade e Telas Táteis
* **Desktop**: Suporte a Modo Foco com recolhimento lateral via `initSidebarCollapse()` e atalho de teclado `F` (ou `[`).
* **Mobile / Tablet (<= 900px)**: Suporte obrigatório a Bottom Sheet com alça `.sheet-drag-handle` e `initBottomSheet()`.
* **Canvas 3D e 2D**: O container do canvas DEVE possuir a propriedade CSS `touch-action: none;` e utilizar eventos unificados de ponteiro (`pointerdown`, `pointermove`, `pointerup`) para prevenir que gestos de pinça, arraste ou órbita capturem a rolagem nativa do navegador.

---

## 5. Fluxo de Trabalho & Procedimentos
Para criar uma nova simulação do zero, migrar uma página legada ou expandir componentes do Design System 2.0, consulte e execute a skill `desenvolver-simulacao`.
