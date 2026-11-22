## 📌 Descrição das Alterações
<!-- Descreva de forma concisa o que este PR implementa ou corrige (nova simulação, bug fix, melhoria de UI, etc.). -->

### Tipo de Mudança
- [ ] 🚀 Nova simulação científica ou matemática
- [ ] 🐛 Correção de bug / erro físico ou numérico
- [ ] 🎨 Ajuste no Design System 2.0 ou UI (`sim-ui.js`, `design-system.css`)
- [ ] 📖 Atualização na aba Teoria ou fórmulas KaTeX
- [ ] ⚙️ CI / Infraestrutura / Documentação

---

## 🧪 Checklist de Qualidade e Design System 2.0
- [ ] **Validador Automático**: Executei `node simulacoes/scripts/validate-ds.js` e obtive **0 erros e 0 avisos**.
- [ ] **Fonte da Verdade Canônica**: Todos os componentes, sliders e botões utilizados existem e seguem o padrão de `simulacoes/ui_lab.html`.
- [ ] **Tema Claro/Escuro & Blindagem**: Página carrega `../theme-init.js` antes de `design-system.css`, possui `#btn-theme-toggle` e mantém o palco escuro (`.canvas-area`) no Modo Claro sem hexadecimais soltos na UI.
- [ ] **Ícones Nativos**: Apenas os 75 ícones de `../assets/icons/` foram utilizados com `inlineSVGImages()`.
- [ ] **Responsividade**:
  - [ ] Desktop: Testado com atalho `F` / `[` (Modo Foco + barra espelhada `data-focus-control`).
  - [ ] Mobile/Tablet (`<= 900px`): Testado com o Painel Flutuante Mobile (`#btn-mobile-settings` + `initBottomSheet()`).
- [ ] **Onboarding & QR Code**: `#modal-onboarding` com painel `#onboarding-qr-panel` e `#btn-toggle-onboarding-qr` validados.
- [ ] **Canvas e Interação**: O container do canvas possui `touch-action: none;` para prevenir interferência de scroll touch.
- [ ] **Fórmulas Matemáticas**: Todas as fórmulas KaTeX utilizam `renderMath()` ou `initKaTeXAutoRender()`.

---

## 📸 Demonstração Visual (Opcional)
<!-- Se a alteração impactar a interface ou os modelos 3D, adicione capturas de tela ou gravações curtas aqui. -->
