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
- [ ] **Validador Automático**: Executei `node simulacoes/scripts/validate-ds.js` e obtive **0 erros**.
- [ ] **Fonte da Verdade Canônica**: Todos os componentes, sliders e botões utilizados existem e seguem o padrão de `simulacoes/ui_lab.html`.
- [ ] **Ícones Nativos**: Apenas os 71 ícones de `../assets/icons/` foram utilizados com `inlineSVGImages()`.
- [ ] **Responsividade**:
  - [ ] Desktop: Testado com atalho `F` / recolhimento lateral (Modo Foco).
  - [ ] Mobile/Tablet: Testado com o Bottom Sheet (`initBottomSheet()`).
- [ ] **Canvas e Interação**: O container do canvas possui `touch-action: none;` para prevenir interferência de scroll touch.
- [ ] **Fórmulas Matemáticas**: Todas as fórmulas KaTeX utilizam `renderMath()` ou `initKaTeXAutoRender()`.

---

## 📸 Demonstração Visual (Opcional)
<!-- Se a alteração impactar a interface ou os modelos 3D, adicione capturas de tela ou gravações curtas aqui. -->
