# Catálogo de Ícones Nativos (`assets/icons/`)

Todos os **71 ícones vetoriais** estão disponíveis em `assets/icons/` e adaptam-se automaticamente à cor do texto via `currentColor` quando carregados com a classe `.icon-svg` e processados por `inlineSVGImages()`.

## Sintaxe Padrão de Uso
```html
<img src="../assets/icons/<nome>.svg" class="icon-svg" alt="Descrição">
```

### Classes Auxiliares de Estilo e Microanimação
* `.icon-accent`: aplica a cor de destaque `var(--accent-text, var(--accent-color))`.
* `.icon-spin`: aplica rotação contínua suave (ideal para `rotate.svg` quando ativo).
* Microanimações internas embutidas nos SVGs (ativadas automaticamente após `inlineSVGImages()`): `.particle-stem` / `.particle-head` (`particle-moving.svg`), `.oscillate-body` (`motion-oscillate.svg`), `.mouse-click-left` / `.mouse-click-right`, `.mouse-drag-sway`.

---

## Tabela Completa dos 71 Ícones por Categoria

### 1. Transporte, Navegação & Interface (18 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `play` | `play.svg` | Executar, Iniciar simulação |
| `pause` | `pause.svg` | Pausar simulação |
| `step` | `step.svg` | Avançar 1 quadro temporal ($\Delta t$) |
| `refresh` | `refresh.svg` | Reiniciar parâmetros ($t=0$) |
| `refresh-cw` | `refresh-cw.svg` | Recarregar / Reset horário |
| `rotate` | `rotate.svg` | Rotação 3D, Velocidade angular |
| `camera-reset` | `camera-reset.svg` | Restaurar enquadramento da câmera |
| `stopwatch` | `stopwatch.svg` | Cronômetro, Passo temporal, Período |
| `collapse` | `collapse.svg` | Recolher painel lateral (Modo Foco) |
| `expand` | `expand.svg` | Expandir painel lateral |
| `focus` | `focus.svg` | Modo foco, Centralizar alvo |
| `arrow-left` | `arrow-left.svg` | Voltar ao Hub, Retornar |
| `chevron-right` | `chevron-right.svg` | Avançar item, Indicador de expansão |
| `sliders` | `sliders.svg` | Aba de parâmetros e ajustes |
| `toggle-switch` | `toggle-switch.svg` | Aba de interruptores e opções |
| `chart-line` | `chart-line.svg` | Telemetria, Gráficos em tempo real |
| `book-open` | `book-open.svg` | Teoria aberta, Deduções matemáticas |
| `book` | `book.svg` | Referência bibliográfica, Guia |

### 2. Auxiliares, Dicas & Presets Gerais (3 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `sparkles` | `sparkles.svg` | Customização, Efeitos visuais, Destaque |
| `lightbulb` | `lightbulb.svg` | Dicas interativas, Insight físico |
| `dice` | `dice.svg` | Sortear configuração ou parâmetros aleatórios |

### 3. Dispositivos, Mouse, Teclado & Gestos Táteis (17 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `mouse` | `mouse.svg` | Dispositivo mouse, Interação geral |
| `mouse-left` | `mouse-left.svg` | Clique esquerdo, Selecionar / Orbitar |
| `mouse-right` | `mouse-right.svg` | Clique direito, Panning |
| `mouse-wheel` | `mouse-wheel.svg` | Roda do mouse, Zoom |
| `mouse-scroll` | `mouse-scroll.svg` | Rolagem vertical / Zoom contínuo |
| `mouse-drag-horizontal` | `mouse-drag-horizontal.svg` | Arraste horizontal com o mouse |
| `keyboard` | `keyboard.svg` | Atalhos de teclado |
| `key` | `key.svg` | Tecla individual (Keycap) |
| `smartphone` | `smartphone.svg` | Dispositivo smartphone |
| `mobile` | `mobile.svg` | Interface móvel compacta |
| `tablet` | `tablet.svg` | Dispositivo tablet |
| `touch` | `touch.svg` | Toque simples (Tap) na tela |
| `touch-drag` | `touch-drag.svg` | Arraste com 1 dedo (Orbitar / Mover) |
| `touch-pan` | `touch-pan.svg` | Arraste com 2 dedos (Panning) |
| `touch-pinch` | `touch-pinch.svg` | Gesto de pinça (Pinch-to-Zoom) |
| `pinch` | `pinch.svg` | Pinça compacta para zoom |
| `screen-rotate` | `screen-rotate.svg` | Rotação de tela (Retrato / Paisagem) |

### 4. Clima, Geofísica, Ecologia & Termodinâmica (10 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `globe` | `globe.svg` | Planeta, Coordenadas globais, Esfera |
| `sun` | `sun.svg` | Sol, Insolação, Verão, Fonte de luz |
| `snowflake` | `snowflake.svg` | Inverno, Criogenia, Baixa temperatura |
| `leaf` | `leaf.svg` | Outono, Ecologia, Populações |
| `flower` | `flower.svg` | Primavera, Biologia, Padrões naturais |
| `thermometer` | `thermometer.svg` | Temperatura termodinâmica |
| `cyclone` | `cyclone.svg` | Ciclones, Vórtices, Efeito Coriolis |
| `wind` | `wind.svg` | Escoamento atmosférico, Vento |
| `gauge` | `gauge.svg` | Medidor, Velocímetro, Manômetro |
| `pressure` | `pressure.svg` | Pressão hidrostática ou barométrica |

### 5. Mecânica, Oscilações, Ondas, Óptica & Eletromagnetismo (11 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `gravity-fall` | `gravity-fall.svg` | Queda livre, Gravitação, Arrasto |
| `motion-oscillate` | `motion-oscillate.svg` | Movimento oscilatório harmônico |
| `spring` | `spring.svg` | Molas, Lei de Hooke, Fônons |
| `pendulum` | `pendulum.svg` | Pêndulo simples/duplo, Fase |
| `wave-sine` | `wave-sine.svg` | Onda senoidal, Interferência, Acústica |
| `fft-bars` | `fft-bars.svg` | Espectro de frequências, FFT, Harmônicos |
| `prism` | `prism.svg` | Refração, Lei de Snell, Dispersão óptica |
| `dipole` | `dipole.svg` | Dipolo elétrico/magnético, Polarização |
| `magnetic-field` | `magnetic-field.svg` | Campo magnético $\mathbf{B}$, Linhas de campo |
| `electron-drift` | `electron-drift.svg` | Deriva eletrônica, Modelo de Drude |
| `orbital` | `orbital.svg` | Orbitais atômicos, Átomo de Hidrogênio |

### 6. Álgebra Linear, Tensores & Geometria (4 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `compass` | `compass.svg` | Orientação espacial, Vetores direção |
| `axis-3d` | `axis-3d.svg` | Eixos cartesianos 3D ($X, Y, Z$), Tensor de Inércia |
| `matrix-basis` | `matrix-basis.svg` | Transformações lineares, Vetores da base ($\hat{i}, \hat{j}$) |
| `chladni-plate` | `chladni-plate.svg` | Modos normais 2D, Placas de Chladni |

### 7. Dinâmica de Partículas & Redes Cristalinas (8 ícones)
| Nome do Ícone | Arquivo | Finalidade Sugerida |
| :--- | :--- | :--- |
| `particle-single` | `particle-single.svg` | 1 Partícula estática isolada |
| `particle-moving` | `particle-moving.svg` | 1 Partícula móvel com vetor velocidade animado |
| `particles-double` | `particles-double.svg` | Par de partículas interagentes |
| `particles-opposite` | `particles-opposite.svg` | Colisão frontal / Momentos opostos |
| `particles-three` | `particles-three.svg` | Problema de 3 corpos / Tríade |
| `particle-circle` | `particle-circle.svg` | Anel circular de partículas |
| `particle-grid` | `particle-grid.svg` | Rede periódica $3\times 3$ / Cristal |
| `salt-nacl` | `salt-nacl.svg` | Rede iônica ($\text{Na}^+\text{Cl}^-$) |
