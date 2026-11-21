// Atualiza a posição relativa do ponteiro em cada card para a lanterna/brilho no hover
const handleCardPointerMove = e => {
  const { currentTarget: target } = e;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  target.style.setProperty("--mouse-X", `${x}px`);
  target.style.setProperty("--mouse-Y", `${y}px`);
};

// Converte <img class="icon-svg"> em <svg> inline com cache (herança de currentColor + animações nativas)
async function inlineSVGImages() {
  const images = document.querySelectorAll('img.icon-svg[src$=".svg"]');
  if (images.length === 0) return;

  const svgCache = new Map();
  const parser = new DOMParser();

  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;

    let svgText = svgCache.get(src);
    if (!svgText) {
      try {
        const res = await fetch(src);
        if (!res.ok) continue;
        svgText = await res.text();
        svgCache.set(src, svgText);
      } catch {
        continue;
      }
    }

    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) continue;

    svg.setAttribute("class", img.getAttribute("class") || "icon-svg");
    svg.setAttribute("aria-hidden", "true");
    if (img.id) svg.setAttribute("id", img.id);
    img.replaceWith(svg);
  }
}

function initCardPreviews() {
  const cardLinks = document.querySelectorAll(".card-link[data-preview]");
  const loadedUrls = new Set();

  const loadPreviewForLink = link => {
    const previewUrl = link.getAttribute("data-preview");
    const card = link.querySelector(".card");
    if (!previewUrl || !card || card.dataset.previewStatus) return;

    card.dataset.previewStatus = "loading";

    // Injeta o compositor unificado de preview se ainda não existir
    if (!card.querySelector(".card-preview")) {
      const preview = document.createElement("div");
      preview.className = "card-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.innerHTML = `
        <div class="card-preview-ambient"></div>
        <div class="card-preview-spotlight"></div>
        <div class="card-preview-scrim"></div>
      `;
      card.prepend(preview);
    }

    const applyPreview = () => {
      card.style.setProperty("--card-preview", `url("${previewUrl}")`);
      // Garante um frame em opacity: 0 antes de ativar .has-preview para transição sempre suave
      requestAnimationFrame(() => {
        card.classList.add("has-preview");
        card.dataset.previewStatus = "loaded";
      });
    };

    if (loadedUrls.has(previewUrl)) {
      applyPreview();
      return;
    }

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loadedUrls.add(previewUrl);
      applyPreview();
    };
    img.onerror = () => {
      // Fallback automático: mantém sem .has-preview (exibe brilho radial padrão)
      card.dataset.previewStatus = "missing";
    };
    img.src = previewUrl;
  };

  // Registra rastreamento de ponteiro em todos os cards e pré-carrega preview no pointerenter
  document.querySelectorAll(".card").forEach(card => {
    const link = card.closest(".card-link[data-preview]");
    card.addEventListener("pointerenter", e => {
      handleCardPointerMove(e);
      if (link) loadPreviewForLink(link);
    });
    card.addEventListener("pointermove", handleCardPointerMove);
  });

  // Carregamento lazy quando os cards entram na viewport (inclusive ao ativar #secao-simulacoes)
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            loadPreviewForLink(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "200px 0px" }
    );

    cardLinks.forEach(link => {
      if (!link.hasAttribute("hidden")) {
        observer.observe(link);
      }
    });
  } else {
    cardLinks.forEach(link => {
      if (!link.hasAttribute("hidden")) {
        loadPreviewForLink(link);
      }
    });
  }
}

// Aqui eu lido com o menu e a mudança entre seções
document.addEventListener("DOMContentLoaded", function () {
  const secoes = document.querySelectorAll(".section");
  const links = document.querySelectorAll(".menu a");

  // Oculta todas as seções e remove 'active' dos links
  function resetSections() {
    secoes.forEach(secao => {
      secao.classList.remove("active");
    });
    links.forEach(link => {
      link.classList.remove("active");
    });
  }

  // Verifica se há um hash na URL (ex: #secao-sobre)
  const hash = window.location.hash;
  let secaoInicial = "secao-simulacoes"; // Padrão: abre direto no acervo de simulações

  if (hash) {
    const secaoTentativa = hash.substring(1); // Remove o #
    if (document.getElementById(secaoTentativa)) {
      secaoInicial = secaoTentativa;
    }
  }

  // Define aba inicial ativa
  const secaoPadrao = document.getElementById(secaoInicial);
  const linkPadrao = document.querySelector(`.menu a[href="#${secaoInicial}"]`);

  if (secaoPadrao && linkPadrao) {
    resetSections();
    secaoPadrao.classList.add("active");
    linkPadrao.classList.add("active");
  }

  // Adiciona o evento de clique para todos os links de seção (menu e botões CTA)
  const allSectionLinks = document.querySelectorAll('a[href^="#secao-"]');
  allSectionLinks.forEach(link => {
    link.addEventListener("click", function (event) {
      event.preventDefault();

      const idSecao = this.getAttribute("href").substring(1);
      const secaoAlvo = document.getElementById(idSecao);

      if (secaoAlvo) {
        resetSections();
        secaoAlvo.classList.add("active");

        // Destaca o link correspondente no menu da sidebar
        const linkCorrespondente = document.querySelector(`.menu a[href="#${idSecao}"]`);
        if (linkCorrespondente) {
          linkCorrespondente.classList.add("active");
        }

        // Atualiza a URL com o hash e rola até o topo
        history.pushState(null, null, '#' + idSecao);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // --- Lógica de filtragem de simulações ---
  const filterBtnsSim = document.querySelectorAll('#secao-simulacoes .filter-btn');
  const cardLinks = document.querySelectorAll('.card-link');
  const noResultsSim = document.getElementById('no-results');

  if (filterBtnsSim.length > 0) {
    filterBtnsSim.forEach(btn => {
      btn.addEventListener('click', function () {
        // Atualiza botão ativo
        filterBtnsSim.forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        const filtro = this.getAttribute('data-filtro');
        let visiveis = 0;

        cardLinks.forEach(link => {
          // Ignora cards ocultos manualmente (atributo hidden ou classes hide/hidden)
          if (link.hasAttribute('hidden') || link.classList.contains('hide') || link.classList.contains('hidden')) {
            return;
          }

          const categorias = (link.getAttribute('data-categorias') || '').split(' ');
          const mostrar = filtro === 'todas' || categorias.includes(filtro);
          link.classList.toggle('card-hidden', !mostrar);
          if (mostrar) visiveis++;
        });

        // Exibe mensagem se nenhum card for encontrado
        if (noResultsSim) {
          noResultsSim.style.display = visiveis === 0 ? 'block' : 'none';
        }
      });
    });
  }

  // Atualiza contador dinâmico de simulações visíveis na sidebar
  const menuCountSim = document.getElementById("menu-count-sim");
  if (menuCountSim) {
    const visibleCardsCount = Array.from(cardLinks).filter(
      link => !link.hasAttribute("hidden") && !link.classList.contains("hide") && !link.classList.contains("hidden")
    ).length;
    menuCountSim.textContent = String(visibleCardsCount);
  }

  // Converte ícones SVG nativos inline (ex.: mouse-left.svg nos cards)
  inlineSVGImages();

  // Inicializa alternância de tema claro/escuro sincronizada com as simulações
  initHomeThemeToggle();

  // Inicializa previews e efeito spotlight dos cards de simulações
  initCardPreviews();

  // Inicializa seção de Material Bibliográfico
  initBibliograficaSection();
});

// --- Alternância de Tema Claro / Escuro (Sincronizada com localStorage 'sim_theme') ---
function initHomeThemeToggle() {
  const THEME_KEY = "sim_theme";
  const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>`;
  const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

  const btn = document.getElementById("btn-theme-toggle");

  const getCurrentTheme = () =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark";

  const applyTheme = (theme, persist = true) => {
    const normalized = theme === "light" ? "light" : "dark";
    const isLight = normalized === "light";
    document.documentElement.dataset.theme = normalized;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", isLight ? "#ffffff" : "#0f172a");
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, normalized);
      } catch {
        // Ignora indisponibilidade de storage
      }
    }

    if (btn) {
      const nextAction = isLight ? "Alternar para modo escuro" : "Alternar para modo claro";
      btn.setAttribute("aria-pressed", isLight ? "true" : "false");
      btn.setAttribute("title", nextAction);
      btn.setAttribute("aria-label", nextAction);

      const labelEl = btn.querySelector(".theme-toggle-label");
      if (labelEl) {
        labelEl.textContent = isLight ? "Modo escuro" : "Modo claro";
      }

      const existingIcon = btn.querySelector(".icon-svg");
      const wrap = document.createElement("span");
      wrap.innerHTML = isLight ? ICON_MOON : ICON_SUN;
      const nextSvg = wrap.firstElementChild;
      if (existingIcon && nextSvg) {
        existingIcon.replaceWith(nextSvg);
      } else if (nextSvg && !existingIcon) {
        btn.prepend(nextSvg);
      }
    }
  };

  if (btn) {
    applyTheme(getCurrentTheme(), false);
    btn.addEventListener("click", () => {
      applyTheme(getCurrentTheme() === "light" ? "dark" : "light", true);
    });
  }

  window.addEventListener("storage", e => {
    if (e.key === THEME_KEY) {
      applyTheme(e.newValue === "light" ? "light" : "dark", false);
    }
  });
}

// --- Lógica da seção de Material Bibliográfico ---
async function initBibliograficaSection() {
  const gridLivros = document.getElementById("grid-livros");
  const searchInput = document.getElementById("biblio-search");
  const clearSearchBtn = document.getElementById("biblio-clear-search");
  const filterBtns = document.querySelectorAll("#biblio-filter-bar .filter-btn");
  const noResults = document.getElementById("biblio-no-results");

  if (!gridLivros) return;

  let livrosData = [];

  try {
    const response = await fetch("livros.json");
    if (!response.ok) throw new Error("Network response was not ok");
    livrosData = await response.json();
    const menuCountBiblio = document.getElementById("menu-count-biblio");
    if (menuCountBiblio) {
      menuCountBiblio.textContent = String(livrosData.length);
    }
  } catch (error) {
    console.error("Erro ao carregar livros.json:", error);
    gridLivros.innerHTML = '<p class="no-results" style="display:block;">Não foi possível carregar a lista de livros.</p>';
    return;
  }

  function getLevelClass(nivel) {
    if (nivel.includes("Ensino Médio")) return "nivel-em";
    if (nivel.includes("Pós")) return "nivel-pos";
    return "nivel-grad";
  }

  function renderLivros(livros) {
    gridLivros.innerHTML = "";

    if (livros.length === 0) {
      if (noResults) noResults.style.display = "block";
      return;
    }

    if (noResults) noResults.style.display = "none";

    livros.forEach((livro, index) => {
      const item = document.createElement("div");
      item.className = "biblio-item";
      item.style.animationDelay = `${index * 0.1}s`;
      item.setAttribute("data-categoria", livro.categoria);

      const nivelClass = getLevelClass(livro.nivel);

      item.innerHTML = `
        <div class="biblio-item-main">
          <div class="biblio-citacao-text">${livro.citacao}</div>
          <div class="biblio-item-meta">
            <span class="tag-nivel ${nivelClass}">${livro.nivel}</span>
            <span class="card-tag tag-fisica">${livro.categoriaNome}</span>
          </div>
        </div>
        
        <div class="biblio-actions">
          ${livro.link && livro.url ? `
            <a href="${livro.url}" target="_blank" rel="noopener noreferrer" class="btn-link-afiliado">
              <ion-icon name="cart-outline"></ion-icon>
              <span>Comprar</span>
            </a>
          ` : ''}
          <button class="btn-copiar-citacao" data-citacao="${livro.citacao.replace(/"/g, '&quot;')}">
            <ion-icon name="copy-outline"></ion-icon>
            <span>Copiar ABNT</span>
          </button>
        </div>
      `;

      gridLivros.appendChild(item);
    });

    // Evento dos botões de copiar citação
    gridLivros.querySelectorAll(".btn-copiar-citacao").forEach(btn => {
      btn.addEventListener("click", function () {
        const citacao = this.getAttribute("data-citacao");
        navigator.clipboard.writeText(citacao).then(() => {
          const span = this.querySelector("span");
          const originalText = span.textContent;
          span.textContent = "Copiado!";
          this.style.borderColor = "var(--accent-color)";
          this.style.color = "var(--accent-color)";
          setTimeout(() => {
            span.textContent = originalText;
            this.style.borderColor = "";
            this.style.color = "";
          }, 2000);
        }).catch(err => {
          console.error("Erro ao copiar citação:", err);
        });
      });
    });
  }

  function updateClearButton() {
    if (!clearSearchBtn) return;
    const hasText = searchInput && searchInput.value.trim().length > 0;
    clearSearchBtn.classList.toggle("visible", hasText);
  }

  function filterAndSearch() {
    updateClearButton();

    const activeBtn = document.querySelector("#biblio-filter-bar .filter-btn.active");
    const categoriaFiltro = activeBtn ? activeBtn.getAttribute("data-filtro") : "todas";
    const termoBusca = (searchInput ? searchInput.value : "").toLowerCase().trim();

    const livrosFiltrados = livrosData.filter(livro => {
      const bateCategoria = categoriaFiltro === "todas" || livro.categoria === categoriaFiltro;

      const textoCompleto = `${livro.titulo} ${livro.autores} ${livro.editora} ${livro.ano} ${livro.descricao} ${(livro.tags || []).join(' ')}`.toLowerCase();
      const bateBusca = !termoBusca || textoCompleto.includes(termoBusca);

      return bateCategoria && bateBusca;
    });

    renderLivros(livrosFiltrados);
  }

  // Event Listeners para Filtros de Categoria
  filterBtns.forEach(btn => {
    btn.addEventListener("click", function () {
      filterBtns.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      filterAndSearch();
    });
  });

  // Event Listener para Busca Textual e Botão Limpar
  if (searchInput) {
    searchInput.addEventListener("input", filterAndSearch);

    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && this.value) {
        this.value = "";
        filterAndSearch();
      }
    });
  }

  if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener("click", function () {
      searchInput.value = "";
      searchInput.focus();
      filterAndSearch();
    });
  }

  // Renderização inicial
  renderLivros(livrosData);
}

