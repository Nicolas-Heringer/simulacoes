'use strict';

// =============================================================================
// Autor: Nicolas Heringer
// Coautor / Revisor: Gemini 3.6 Flash
// Simulação: Lei de Snell (Web Worker para Ray Tracing)
// Descrição: Computação de mapas bidimensionais de índice de refração n(x,y) e
//            gradiente ∇n em thread secundária para ray tracing contínuo.
// =============================================================================

// =============================================================================
// 1. PERFIS DE ÍNDICE DE REFRAÇÃO n(x,y)
// =============================================================================

const refractiveIndexFunctions = {

    constante: {
        minN: 1.0, maxN: 1.0, dispersion: 0.0,
        n: (x, y, W, H) => 1.0
    },

    interfacePlana: {
        minN: 1.0, maxN: 1.5, dispersion: 0.1,
        n: (x, y, W, H) => {
            const cy = H / 2;
            const nTop = 1.0, nBottom = 1.5;
            return nTop + (nBottom - nTop) / (1 + Math.exp(-(y - cy) * 0.8));
        }
    },

    fibraOptica: {
        minN: 1.0, maxN: 2.0, dispersion: 0.05,
        n: (x, y, W, H) => {
            const cy = H / 2;
            const sigTop = 1.0 / (1.0 + Math.exp(-(y - cy + 50)));
            const sigBot = 1.0 / (1.0 + Math.exp(-(y - cy - 50)));
            return 1.0 + sigTop - sigBot;
        }
    },

    gaussiana: {
        minN: 1.0, maxN: 2.0, dispersion: 0.1,
        n: (x, y, W, H) =>
            2 - Math.exp(-0.0001 * ((x - W / 2) ** 2 + (y - H / 2) ** 2))
    },

    senoidal: {
        minN: 0.5, maxN: 2.5, dispersion: 0.08,
        n: (x, y, W, H) => 1.5 + 0.5 * Math.sin(x / 10) * Math.sin(y / 10)
    },

    lenteConvergente: {
        minN: 1.0, maxN: 1.4, dispersion: 0.15,
        n: (x, y, W, H) => {
            const cx = W / 2, cy = H / 2;
            const nOut = 1.0, nIn = 1.4;
            const xL = 0.002 * (y - cy) ** 2 + (cx - 50);
            const xR = -0.002 * (y - cy) ** 2 + (cx + 50);
            const dist = x < cx ? (x - xL) : (xR - x);
            return nOut + (nIn - nOut) / (1 + Math.exp(-dist));
        }
    },

    lenteDivergente: {
        minN: 1.0, maxN: 1.4, dispersion: 0.15,
        n: (x, y, W, H) => {
            const cx = W / 2, cy = H / 2;
            const nOut = 1.0, nIn = 1.4;
            if (Math.abs(y - cy) > 120) return nOut;
            const xL = -0.002 * (y - cy) ** 2 + (cx - 20);
            const xR = 0.002 * (y - cy) ** 2 + (cx + 20);
            const dist = x < cx ? (x - xL) : (xR - x);
            return nOut + (nIn - nOut) / (1 + Math.exp(-dist));
        }
    },

    circulo: {
        minN: 1.0, maxN: 1.333, dispersion: 0.12,
        n: (x, y, W, H) => {
            const cx = W / 2, cy = H / 2;
            const radius = Math.min(W, H) * 0.22;
            const nOut = 1.0, nIn = 1.333;
            const distCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            const distEdge = radius - distCenter;
            return nOut + (nIn - nOut) / (1 + Math.exp(-distEdge * 0.8));
        }
    },

    prisma: {
        minN: 1.0, maxN: 1.5, dispersion: 0.15,
        n: (x, y, W, H) => {
            const cx = W / 2, cy = H / 2;
            const nOut = 1.0, nIn = 1.5;
            // Distância para a base (y = cy + 100)
            const distB = (cy + 100) - y;
            // Distância para as laterais inclinadas
            const distS = (y - (cy - 120 + 1.8 * Math.abs(x - cx))) * 0.5;
            // Intersecção das condições (min) suavizada pela função sigmóide
            const dist = Math.min(distB, distS);
            return nOut + (nIn - nOut) / (1 + Math.exp(-dist));
        }
    },

    // Novo: Atmosfera Terrestre
    // n diminui com a altitude (y pequeno = alto). Raios curvam para baixo,
    // explicando por que vemos o sol ainda visível logo após o pôr-do-sol.
    atmosfera: {
        minN: 1.0, maxN: 1.03, dispersion: 0.02,
        n: (x, y, W, H) => 1.0 + 0.03 * Math.exp(-3.5 * y / H)
    },

    // Novo: Miragem óptica
    // Próximo ao chão (y alto), o ar quente tem n menor. Raios vindos de
    // objetos distantes curvam para cima, criando a ilusão de um reflexo.
    miragem: {
        minN: 1.0, maxN: 1.3, dispersion: 0.03,
        n: (x, y, W, H) => {
            // n aumenta com a distância do chão (chão = y alto)
            const yNorm = (H - y) / H; // 0 no chão, 1 no topo
            return 1.0 + 0.3 * (1 - Math.exp(-6 * yNorm));
        }
    }
};

// =============================================================================
// 2. PROCESSAMENTO DE MENSAGENS E CÁLCULO DE GRADIENTE (WORKER THREAD)
// =============================================================================
self.onmessage = function (e) {
    const { funcName, canvasWidth: W, canvasHeight: H } = e.data;
    const profile = refractiveIndexFunctions[funcName];

    if (!profile) {
        self.postMessage({ error: 'Perfil desconhecido: ' + funcName });
        return;
    }

    const nFn = (x, y) => profile.n(x, y, W, H);

    // Alocar buffers tipados (muito mais eficientes que arrays JS normais)
    const n = new Float32Array(W * H);
    const gx = new Float32Array(W * H);
    const gy = new Float32Array(W * H);

    const delta = 1;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            n[idx] = nFn(x, y);
            gx[idx] = (nFn(x + delta, y) - nFn(x - delta, y)) / (2 * delta);
            gy[idx] = (nFn(x, y + delta) - nFn(x, y - delta)) / (2 * delta);
        }
    }

    // Transfere os buffers (zero-copy — muito mais rápido que copiar)
    self.postMessage(
        { n, gx, gy, dispersion: profile.dispersion, minN: profile.minN, maxN: profile.maxN },
        [n.buffer, gx.buffer, gy.buffer]
    );
};
