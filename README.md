# Simulações Educacionais de Física e Matemática

[![Validação do Design System](https://github.com/Nicolas-Heringer/simulacoes/actions/workflows/validate.yml/badge.svg)](https://github.com/Nicolas-Heringer/simulacoes/actions/workflows/validate.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Online-success?logo=github)](https://nicolas-heringer.github.io/simulacoes/)

Repositório dedicado ao desenvolvimento de simulações interativas para o ensino e aprendizagem de conceitos de física e matemática.

**Acesse o site online via GitHub Pages:** [https://nicolas-heringer.github.io/simulacoes/](https://nicolas-heringer.github.io/simulacoes/)

---

## Sobre o Projeto

Este projeto tem como objetivo fornecer ferramentas visuais e interativas para explorar fenômenos físicos e formulações matemáticas. O repositório e a página são atualizados de forma contínua para adicionar novas simulações, funcionalidades e melhorias na interface. Minha principal inspiração é o Phet, reconhecidamente uma das plataformas mais completas sobre simulações educacionais.

Todas as simulações seguem uma arquitetura visual que está encapsulada no que eu estou chamando de **Design System 2.0**, com controladores padronizados, suporte completo a dispositivos móveis via *Bottom Sheet*, modo de foco imersivo em tela cheia e renderização de equações em KaTeX. A proposta dessa padronização é que eu possa requisitar um agente para fazer uma alteração em qualquer uma das simulações, e ela não fique totalmente fora do formato após as alterações.

---

## Simulações Disponíveis

- **Átomo de Hidrogênio:** Visualização 3D dos orbitais, densidade de probabilidade e autovetores quânticos.
- **Áudio Fourier:** Análise de ondas sonoras e decomposição no espectro de frequências em tempo real via Web Audio API.
- **Clima Terrestre:** Aqui começamos apresentando a ideia de dividir a esfera em células e depois trabalhamos estações do ano e modelos climáticos.
- **Fônons:** Visualização de ondas de matéria.
- **Gravidade:** Gravitação básica, a ideia é inserir uma análise via Leis de Kepler aqui, mas essa simulação ainda está numa versão rudimentar. O que o usuário pode ver aqui é basicamente o que o agente estabeleceu sem minha interferência.
- **Lei de Snell:** Óptica geométrica com refração, reflexão total interna e dispersão da luz em múltiplos meios ópticos. Essa simulação está quase **impecável**. O mais legal aqui é que eu não estou solucionando a Lei de Snell simples, mas a equação dos raios geral.
- **Matrizes 2D:** Interpretação geométrica de transformações lineares, deformação do plano, autovetores e determinante.
- **Modelo de Drude:** Representação microscópica da condução elétrica clássica de elétrons livres interagindo com a rede iônica.
- **Movimento em 1D:** Cinemática gráfica em tempo real, estudo de movimento uniforme e acelerado, e colisão/encontro de corpos. Essa funcionou muito bem em sala de aula.
- **Ondas Estacionárias 2D:** Visualização de padrões de interferência bidimensionais e modos vibracionais de placas (padrões de Chladni).
- **Partículas:** Sistemas interagentes com interações retardadas no tempo. Essa foi uma das primeiras simulações da página, a ideia para ela é de meados da minha graduação, em que eu comecei a estudar funções de Green e sistemas de elétrons e realizei que a modelagem de qualquer sistema físico fica incompleta se não colocarmos as interações retardadas.
- **Queda Livre:** Cinemática sob aceleração gravitacional com resistência do ar e gráficos dinâmicos de velocidade e posição. Essa precisa de muitas alterações
- **Tensor de Inércia:** Visualização 3D dos eixos principais de rotação, elipsoide de inércia e diagonalização tensorial. Essa está **HORRÍVEL**
- **UI Lab (Design System 2.0):** Catálogo de todos os componentes de interface, controladores e contratos visuais do laboratório.

---

## Estrutura do Projeto

A estrutura adota uma separação anatômica clara entre o portal de entrada, os componentes centrais de interface e as experiências interativas individuais:

```text
simulacoes/
├── index.html                   # Portal de entrada com cards de navegação e filtros por categoria
├── script.js                    # Mecanismo de busca, filtros e interatividade do portal
├── styles.css                   # Identidade visual e layout responsivo do portal principal
├── livros.json                  # Referências bibliográficas e recomendações didáticas
├── assets/
│   └── icons/                   # Catálogo nativo com 71 ícones vetoriais SVG (currentColor)
├── .github/
│   └── workflows/
│       └── validate.yml         # Integração Contínua (CI) para checagem estática automática
└── simulacoes/
    ├── ui_lab.html              # Vitrine canônica e fonte da verdade do Design System 2.0
    ├── [simulacao].html         # Páginas individuais com layout responsivo (Desktop & Mobile Bottom-Sheet)
    ├── css/
    │   ├── design-system.css    # Tokens globais (:root), temas, barras de transporte, abas e modais
    │   └── [simulacao].css      # Estilos complementares e dimensionamento do canvas da simulação
    └── scripts/
        ├── sim-ui.js            # Biblioteca central de controladores (sliders, abas, plots, modais)
        ├── validate-ds.js       # Script de análise estática e prevenção de regressões
        ├── [simulacao].js       # Lógica matemática e física estruturada em ES Modules
        └── *.worker.js          # Processamento numérico em segundo plano (Clima, Snell)
```

---

## Tecnologias Utilizadas

- **HTML5 & Web APIs:** Estruturação semântica, Canvas 2D, Web Audio API e Web Workers para cálculos em segundo plano sem travamento da taxa de quadros (60 FPS).
- **Design System 2.0 (CSS3):** Design tokens semânticos (`:root`), responsividade adaptativa com *Bottom Sheet* para mobile e *Modo Foco* (`F`) para desktop.
- **JavaScript Moderno (ES Modules):** Código desacoplado e manutenível, sem dependências externas obsoletas.
- **Three.js (WebGL):** Visualizações tridimensionais de alta performance e controles orbitais com prevenção de rolagem acidental (`touch-action: none`).
- **KaTeX:** Renderização ultrarrápida de tipografia matemática para equações e deduções didáticas.
- **GitHub Actions (CI):** Esteira de integração contínua para validação automatizada de integridade a cada commit.

---

## Como Executar Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/Nicolas-Heringer/simulacoes.git
   ```

2. Acesse o diretório do projeto:
   ```bash
   cd simulacoes
   ```

3. Inicie um servidor local HTTP (recomendado via Python):
   ```bash
   python -m http.server 8080
   ```
   Depois, basta abrir o navegador e acessar `http://localhost:8080`.

   *Alternativamente, você pode abrir o arquivo `index.html` diretamente no navegador ou utilizar extensões como o Live Server do VS Code.*

4. Para rodar a validação do Design System localmente:
   ```bash
   node simulacoes/scripts/validate-ds.js
   ```

---

## Autor

**Nicolas Heringer**

- GitHub: [Nicolas-Heringer](https://github.com/Nicolas-Heringer)
- LinkedIn: [nicolasheringer](https://www.linkedin.com/in/nicolasheringer/)
- Instagram: [@nicolasheringer](https://www.instagram.com/nicolasheringer/)
