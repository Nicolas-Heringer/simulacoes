// =============================================================================
// Gerador de Previews Provisórios das Simulações (Zero-Dependência / Node 20+)
// Captura o canvas limpo (Modo Foco) de cada simulação em assets/previews/*.png
//
// Uso:
//   node scripts/capture-previews.mjs                  -> captura apenas os que faltam
//   node scripts/capture-previews.mjs --force          -> regera todos os visíveis
//   node scripts/capture-previews.mjs gravidade clima --force -> regera específicos
//   node scripts/capture-previews.mjs --include-hidden -> inclui cards ocultos
// =============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PREVIEWS_DIR = path.join(PROJECT_ROOT, 'assets', 'previews');
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');

const VIEWPORT = { width: 1280, height: 720 };

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon',
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findBrowserExecutable() {
    if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
        return process.env.BROWSER_PATH;
    }

    const candidates = process.platform === 'win32'
        ? [
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        ]
        : process.platform === 'darwin'
            ? [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            ]
            : [
                '/usr/bin/google-chrome',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/microsoft-edge',
            ];

    return candidates.find(p => p && fs.existsSync(p)) || null;
}

function parseSimulationsFromIndex(includeHidden) {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    const regex = /<a\s+([^>]*class="card-link"[^>]*)>/g;
    const sims = [];

    for (const match of html.matchAll(regex)) {
        const attrs = match[1];
        const isHidden = /\bhidden\b/.test(attrs);
        const hrefMatch = attrs.match(/href=["']([^"']+)["']/);
        const previewMatch = attrs.match(/data-preview=["']([^"']+)["']/);
        if (!hrefMatch || !previewMatch) continue;

        const href = hrefMatch[1];
        const previewRel = previewMatch[1];
        const slug = path.basename(href, '.html');
        sims.push({ slug, href, previewRel, isHidden });
    }

    return includeHidden ? sims : sims.filter(s => !s.isHidden);
}

function startStaticServer(rootDir) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            const resolvedRoot = path.resolve(rootDir);
            const filePath = path.resolve(resolvedRoot, (urlPath === '/' ? 'index.html' : urlPath).replace(/^\/+/, ''));

            if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                fs.createReadStream(filePath).pipe(res);
            });
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }

    async connect() {
        await new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.addEventListener('open', resolve);
            this.ws.addEventListener('error', reject);
            this.ws.addEventListener('message', event => {
                const msg = JSON.parse(event.data);
                if (msg.id && this.pending.has(msg.id)) {
                    const { resolve: res, reject: rej } = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
                    else res(msg.result);
                } else if (msg.method && this.listeners.has(msg.method)) {
                    for (const cb of this.listeners.get(msg.method)) cb(msg.params);
                }
            });
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    once(method, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                off();
                reject(new Error(`Timeout aguardando evento CDP: ${method}`));
            }, timeoutMs);

            const cb = params => {
                clearTimeout(timer);
                off();
                resolve(params);
            };

            const off = () => {
                const set = this.listeners.get(method);
                if (set) set.delete(cb);
            };

            if (!this.listeners.has(method)) this.listeners.set(method, new Set());
            this.listeners.get(method).add(cb);
        });
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function launchBrowser(executablePath) {
    const debugPort = await getFreePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-previews-'));

    const args = [
        '--headless=new',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${userDataDir}`,
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--ignore-gpu-blocklist',
        'about:blank',
    ];

    const proc = spawn(executablePath, args, { stdio: 'ignore' });

    let pageTarget = null;
    for (let i = 0; i < 40; i++) {
        await sleep(250);
        try {
            const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
            const targets = await res.json();
            pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (pageTarget) break;
        } catch {
            // Aguarda inicialização da porta de debug
        }
    }

    if (!pageTarget) {
        proc.kill();
        throw new Error('Não foi possível conectar ao navegador headless via CDP.');
    }

    const cleanup = () => {
        try { proc.kill(); } catch {}
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    };

    return { wsUrl: pageTarget.webSocketDebuggerUrl, cleanup };
}

async function prepareAndCapture(cdp, url, outPath) {
    const loadPromise = cdp.once('Page.loadEventFired', 20000).catch(() => {});
    await cdp.send('Page.navigate', { url });
    await loadPromise;

    // Aguarda inicialização de scripts ES Modules, Three.js e canvas
    await sleep(1400);

    // Ativa Modo Foco, oculta overlays/HUDs temporariamente e aciona Play se pausado
    await cdp.send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async () => {
            // Fecha possíveis modais de boas-vindas (Onboarding DS 2.0)
            document.querySelectorAll('.sim-modal-overlay').forEach(el => {
                el.classList.add('hidden');
                el.setAttribute('aria-hidden', 'true');
            });

            // Recolhe a sidebar (Modo Foco) para o canvas ocupar 100%
            const collapseBtn = document.getElementById('btn-collapse-sidebar');
            if (collapseBtn) collapseBtn.click();
            document.body.classList.add('sidebar-collapsed');
            const layout = document.querySelector('.sim-layout');
            if (layout) layout.classList.add('sidebar-collapsed');

            // Oculta cabeçalho, controles flutuantes e HUDs para gerar um preview limpo do palco
            const style = document.createElement('style');
            style.textContent = \`
                .sim-header,
                .controls-panel,
                .sidebar-expand-btn,
                #btn-expand-sidebar,
                .canvas-top-actions,
                .canvas-top-left-stack,
                .canvas-btn-floating,
                .canvas-toolbar,
                .canvas-zoom-toolbar,
                #canvas-transport-toolbar,
                #focus-context-toolbar,
                .canvas-btn-settings,
                #btn-mobile-settings,
                .sim-hud,
                .canvas-info-badge,
                .interactive-hint,
                .stage-pills,
                .display-toolbar,
                .floating-hud,
                .sim-modal-overlay,
                .onboarding-overlay {
                    display: none !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                }
                .sim-layout {
                    height: var(--app-height, 100vh) !important;
                    padding: 0 !important;
                }
                .canvas-area {
                    width: 100vw !important;
                    height: 100% !important;
                    border-radius: 0 !important;
                    border: none !important;
                }
            \`;
            document.head.appendChild(style);

            // Dispara resize para Three.js / Canvas 2D ajustarem a proporção
            window.dispatchEvent(new Event('resize'));

            // Aciona o botão Play caso a simulação comece pausada
            const playSelectors = ['#btn-play-sim', '#base-btnApply', '#dyn-btnPlay'];
            for (const sel of playSelectors) {
                const btn = document.querySelector(sel);
                if (btn && btn.getAttribute('data-state') !== '1' && !btn.classList.contains('is-active') && !btn.classList.contains('active')) {
                    const txt = (btn.textContent || '').toLowerCase();
                    if (!txt.includes('pausar') && !txt.includes('pause')) {
                        btn.click();
                        break;
                    }
                }
            }

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`,
    });

    // Deixa a simulação evoluir ~1.8s para capturar um quadro vivo
    await sleep(1800);

    const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
}

async function main() {
    const cliArgs = process.argv.slice(2);
    const force = cliArgs.includes('--force');
    const includeHidden = cliArgs.includes('--include-hidden');
    const requestedSlugs = cliArgs.filter(a => !a.startsWith('--'));

    const allSims = parseSimulationsFromIndex(includeHidden || requestedSlugs.length > 0);
    const targets = requestedSlugs.length > 0
        ? allSims.filter(s => requestedSlugs.includes(s.slug))
        : allSims;

    if (targets.length === 0) {
        console.error('❌ Nenhuma simulação encontrada para os argumentos fornecidos.');
        process.exit(1);
    }

    const browserExe = findBrowserExecutable();
    if (!browserExe) {
        console.error('❌ Nenhum navegador Chromium/Edge encontrado. Defina BROWSER_PATH ou instale Edge/Chrome.');
        process.exit(1);
    }

    fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
    const { server, baseUrl } = await startStaticServer(PROJECT_ROOT);
    const { wsUrl, cleanup } = await launchBrowser(browserExe);
    const cdp = new CDPClient(wsUrl);

    let captured = 0;
    let skipped = 0;

    try {
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: VIEWPORT.width,
            height: VIEWPORT.height,
            deviceScaleFactor: 1,
            mobile: false,
        });

        console.log(`📸 Capturando previews em ${path.relative(PROJECT_ROOT, PREVIEWS_DIR)} (${VIEWPORT.width}x${VIEWPORT.height})...\n`);

        for (const sim of targets) {
            const outPath = path.join(PROJECT_ROOT, sim.previewRel);
            if (!force && fs.existsSync(outPath)) {
                console.log(`  ⏭️  ${sim.slug} (já existe — use --force para sobrescrever)`);
                skipped++;
                continue;
            }

            const url = `${baseUrl}/${sim.href}`;
            process.stdout.write(`  ⏳ ${sim.slug}... `);
            await prepareAndCapture(cdp, url, outPath);
            const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
            console.log(`✅ salvo (${kb} KB)`);
            captured++;
        }

        console.log(`\n✨ Concluído: ${captured} capturado(s), ${skipped} preservado(s).`);
        console.log('💡 Dica: você pode substituir qualquer arquivo em assets/previews/*.png pelo seu print manual preferido.');
    } finally {
        cdp.close();
        cleanup();
        server.close();
    }
}

main().catch(err => {
    console.error('🚨 Erro ao capturar previews:', err);
    process.exit(1);
});
