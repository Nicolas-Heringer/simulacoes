// =============================================================================
// Validador de Integridade e Conformidade do Design System 2.0 (sim-ui.js)
// Executa análise estática de imports, recursos (404), contratos de tema/mobile/
// modo foco/onboarding, paridade com ui_lab, integridade do plugin e CSS.
//
// Uso:
//   node simulacoes/scripts/validate-ds.js          # Gate CI (ERROR falha; WARN lista baseline Fase 2)
//   node simulacoes/scripts/validate-ds.js --strict # Promove WARNs da Fase 2 para falha (auditoria estrita)
// =============================================================================

import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve('.');
const isStrict = process.argv.includes('--strict');

let totalErrors = 0;
let totalWarnings = 0;

function reportError(file, message) {
    console.error(`  ❌ [ERROR] [${file}] ${message}`);
    totalErrors++;
}

function reportWarn(file, message) {
    if (isStrict) {
        console.error(`  ❌ [STRICT] [${file}] ${message}`);
        totalErrors++;
    } else {
        console.warn(`  ⚠️ [WARN]  [${file}] ${message}`);
        totalWarnings++;
    }
}

function reportByScope(isStrictTarget, file, message) {
    if (isStrictTarget) {
        reportError(file, message);
    } else {
        reportWarn(file, message);
    }
}

function stripJsComments(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function stripCssComments(code) {
    return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
}

function stripHtmlComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
}

function walkFiles(dir, extFilter) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkFiles(full, extFilter));
        } else if (!extFilter || entry.name.endsWith(extFilter)) {
            out.push(full);
        }
    }
    return out;
}

// =============================================================================
// 1. COLETA DE FONTES CANÔNICAS (sim-ui.js, assets/icons/, ui_lab.js, plugin)
// =============================================================================
const simUiRelPath = 'simulacoes/scripts/sim-ui.js';
const simUiCode = fs.readFileSync(path.join(projectRoot, simUiRelPath), 'utf8');

// Regex inclui `export async function` (captura 100% das exportações)
const exportMatches = [...simUiCode.matchAll(/export\s+(?:async\s+)?(?:function|class|const)\s+([A-Za-z0-9_]+)/g)];
const simUiExports = new Set(exportMatches.map(m => m[1]));

// Todos os ícones SVG reais em assets/icons/
const iconsDir = path.join(projectRoot, 'assets/icons');
const existingIcons = new Set(fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg')));

// Todas as páginas HTML em simulacoes/
const allSimHtmlNames = fs.readdirSync(path.join(projectRoot, 'simulacoes'))
    .filter(f => f.endsWith('.html'))
    .sort();
const simulationHtmlPaths = allSimHtmlNames
    .filter(f => f !== 'ui_lab.html')
    .map(f => path.join('simulacoes', f));

const pluginRoot = path.join('.agents', 'plugins', 'simulacoes-lab');
const templateHtmlPath = path.join(pluginRoot, 'skills', 'desenvolver-simulacao', 'templates', 'simulacao-template.html');
const templateJsPath = path.join(pluginRoot, 'skills', 'desenvolver-simulacao', 'templates', 'simulacao-template.js');
const iconCatalogPath = path.join(pluginRoot, 'skills', 'desenvolver-simulacao', 'references', 'icon-catalog.md');
const dsGuidePath = path.join(pluginRoot, 'skills', 'desenvolver-simulacao', 'references', 'design-system-guide.md');

console.log(
    `[VALIDADOR DS 2.0${isStrict ? ' · STRICT' : ''}] Analisando ${simulationHtmlPaths.length} simulações + ui_lab + templates + plugin contra ${simUiExports.size} exportações e ${existingIcons.size} ícones...\n`
);

// =============================================================================
// 2. PARIDADE GLOBAL (ui_lab.js, KNOWN_SIMULATIONS, icon-catalog.md, plugin)
// =============================================================================

// 2.1 Paridade de exportações: 100% de sim-ui.js re-exportado por ui_lab.js
const uiLabJsRelPath = 'simulacoes/scripts/ui_lab.js';
const uiLabJsCode = fs.readFileSync(path.join(projectRoot, uiLabJsRelPath), 'utf8');
const uiLabJsClean = stripJsComments(uiLabJsCode);
const uiLabReexports = new Set();
for (const m of uiLabJsClean.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    m[1].split(',').forEach(part => {
        const sym = part.trim().split(/\s+as\s+/)[0].trim();
        if (sym) uiLabReexports.add(sym);
    });
}
for (const sym of simUiExports) {
    if (!uiLabReexports.has(sym)) {
        reportError(uiLabJsRelPath, `Símbolo "${sym}" exportado por sim-ui.js não está re-exportado em ui_lab.js.`);
    }
}

// 2.2 Paridade de ícones: assets/icons/*.svg == ICONS_LIST em ui_lab.js
const iconsListMatch = uiLabJsCode.match(/const\s+ICONS_LIST\s*=\s*\[([\s\S]*?)\];/);
if (!iconsListMatch) {
    reportError(uiLabJsRelPath, 'ICONS_LIST não encontrado em ui_lab.js.');
} else {
    const uiLabIcons = new Set(
        [...iconsListMatch[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map(m => `${m[1]}.svg`)
    );
    for (const icon of existingIcons) {
        if (!uiLabIcons.has(icon)) {
            reportError(uiLabJsRelPath, `Ícone "${icon}" existe em assets/icons/ mas falta em ICONS_LIST.`);
        }
    }
    for (const icon of uiLabIcons) {
        if (!existingIcons.has(icon)) {
            reportError(uiLabJsRelPath, `Ícone "${icon}" listado em ICONS_LIST não existe em assets/icons/.`);
        }
    }
}

// 2.3 Paridade de ícones: assets/icons/*.svg == references/icon-catalog.md
if (fs.existsSync(path.join(projectRoot, iconCatalogPath))) {
    const catalogContent = fs.readFileSync(path.join(projectRoot, iconCatalogPath), 'utf8');
    const catalogIcons = new Set(
        [...catalogContent.matchAll(/\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+\.svg)`\s*\|/g)].map(m => m[2])
    );
    for (const icon of existingIcons) {
        if (!catalogIcons.has(icon)) {
            reportError(iconCatalogPath, `Ícone "${icon}" existe em assets/icons/ mas não está documentado em icon-catalog.md.`);
        }
    }
    for (const icon of catalogIcons) {
        if (!existingIcons.has(icon)) {
            reportError(iconCatalogPath, `Ícone "${icon}" documentado em icon-catalog.md não existe em assets/icons/.`);
        }
    }
}

// 2.4 Paridade de URLs canônicas: 100% de simulacoes/*.html em KNOWN_SIMULATIONS
const knownMatch = simUiCode.match(/const\s+KNOWN_SIMULATIONS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\);/);
if (!knownMatch) {
    reportError(simUiRelPath, 'Catálogo KNOWN_SIMULATIONS não encontrado em getCanonicalSimulationUrl().');
} else {
    const knownSet = new Set([...knownMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]));
    for (const htmlName of allSimHtmlNames) {
        if (!knownSet.has(htmlName)) {
            reportError(simUiRelPath, `Página "simulacoes/${htmlName}" não está registrada em KNOWN_SIMULATIONS.`);
        }
    }
    for (const knownName of knownSet) {
        if (!allSimHtmlNames.includes(knownName)) {
            reportError(simUiRelPath, `Entrada "${knownName}" em KNOWN_SIMULATIONS não corresponde a nenhum arquivo em simulacoes/.`);
        }
    }
}

// 2.5 Integridade do Plugin: links Markdown, ícones nos guias e cobertura de API no guia
const pluginMdFiles = walkFiles(path.join(projectRoot, pluginRoot), '.md');
for (const absMd of pluginMdFiles) {
    const relMd = path.relative(projectRoot, absMd);
    const mdContent = fs.readFileSync(absMd, 'utf8');

    // Links Markdown relativos
    const linkMatches = [...mdContent.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)];
    for (const m of linkMatches) {
        const rawHref = m[1];
        if (/^(?:https?:|mailto:|#)/i.test(rawHref)) continue;
        const cleanPath = rawHref.split('#')[0].split('?')[0];
        if (!cleanPath) continue;
        const resolved = path.resolve(path.dirname(absMd), cleanPath);
        if (!fs.existsSync(resolved)) {
            reportError(relMd, `Link Markdown quebrado: "${rawHref}" (resolve para ${path.relative(projectRoot, resolved)}).`);
        }
    }

    // Referências literais de ícones em exemplos/documentação do plugin
    const mdIconPaths = [...mdContent.matchAll(/assets\/icons\/([a-z0-9-]+\.svg)/g)];
    for (const m of mdIconPaths) {
        if (!existingIcons.has(m[1])) {
            reportError(relMd, `Exemplo/guia referencia ícone 404 inexistente: "${m[1]}".`);
        }
    }

    const mdSetIconCalls = [...mdContent.matchAll(/(?:setElementIcon|getSVGContent)\s*\([^)]*?['"]([a-z0-9._-]+)['"]\s*\)/g)];
    for (const m of mdSetIconCalls) {
        const arg = m[1];
        const fileName = arg.endsWith('.svg') ? arg : `${arg}.svg`;
        if (!existingIcons.has(fileName)) {
            reportError(relMd, `Exemplo de API referencia ícone inexistente: "${arg}".`);
        }
    }
}

// Verifica se todas as 36 exportações de sim-ui.js constam no design-system-guide.md
if (fs.existsSync(path.join(projectRoot, dsGuidePath))) {
    const guideContent = fs.readFileSync(path.join(projectRoot, dsGuidePath), 'utf8');
    for (const sym of simUiExports) {
        if (!new RegExp(`\\b${sym}\\b`).test(guideContent)) {
            reportError(dsGuidePath, `Exportação real "${sym}" de sim-ui.js não está documentada em design-system-guide.md.`);
        }
    }
}

// =============================================================================
// 3. VALIDAÇÃO DE CSS (Proibição de `vh` puro e detecção de hex hardcoded)
// =============================================================================
const dsCssRelPath = 'simulacoes/css/design-system.css';
const cssFiles = [
    dsCssRelPath,
    ...fs.readdirSync(path.join(projectRoot, 'simulacoes/css'))
        .filter(f => f.endsWith('.css') && f !== 'design-system.css')
        .map(f => path.join('simulacoes/css', f))
];

for (const cssRel of cssFiles) {
    const cssContent = fs.readFileSync(path.join(projectRoot, cssRel), 'utf8');
    const isCoreDs = cssRel === dsCssRelPath;
    const rawLines = cssContent.split('\n');
    const cleanLines = stripCssComments(cssContent).split('\n');

    cleanLines.forEach((lineNoComment, idx) => {
        const lineNo = idx + 1;
        const rawLine = rawLines[idx] || '';

        // Proibição de unidade vh pura (exceto fallback `--app-height: 100vh;` em design-system.css)
        if (/\b\d+(?:\.\d+)?vh\b/.test(lineNoComment)) {
            const isAllowedFallback = isCoreDs && /--app-height\s*:\s*100vh\s*;/.test(lineNoComment);
            if (!isAllowedFallback) {
                reportByScope(isCoreDs, `${cssRel}:${lineNo}`, `Uso proibido de unidade "vh" pura (${lineNoComment.trim()}). Utilize var(--app-height).`);
            }
        }

        // Hex hardcoded em CSS específicos de simulação (exclui design-system.css, seletores #id e linhas com `/* stage-color */`)
        if (!isCoreDs && lineNoComment.includes(':') && !/\/\*\s*stage-color\s*\*\//.test(rawLine)) {
            const valuePart = lineNoComment.slice(lineNoComment.indexOf(':') + 1).replace(/url\([^)]*\)/g, '');
            const hexMatches = [...valuePart.matchAll(/(?:^|[\s,:(\/])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3}))(?![0-9a-fA-F_-])/g)];
            if (hexMatches.length > 0) {
                reportWarn(
                    `${cssRel}:${lineNo}`,
                    `Cor hexadecimal hardcoded (${hexMatches.map(m => m[1]).join(', ')}) em CSS de simulação — prefira tokens de :root ou --stage-*.`
                );
            }
        }
    });
}

// =============================================================================
// 4. VALIDAÇÃO DE PÁGINAS HTML + JS (ui_lab, template e 14 simulações)
// =============================================================================
function validateJsFile(jsFile, isStrictTarget) {
    const jsContent = fs.readFileSync(path.join(projectRoot, jsFile), 'utf8');
    const codeNoComments = stripJsComments(jsContent);

    // 4.1 Múltiplos imports de sim-ui.js + suporte a `as` + verificação de existência no sim-ui.js
    const importRegex = /import\s*\{([^}]*)\}\s*from\s*['"](?:(?:\.\.\/)+|\.\/)sim-ui\.js['"]/g;
    const importedLocalNames = new Set();

    for (const match of codeNoComments.matchAll(importRegex)) {
        match[1].split(',').forEach(part => {
            const clean = part.trim();
            if (!clean) return;
            const aliasParts = clean.split(/\s+as\s+/);
            const originalName = aliasParts[0].trim();
            const localName = (aliasParts[1] || aliasParts[0]).trim();

            if (!simUiExports.has(originalName)) {
                reportError(jsFile, `Importa símbolo inexistente "${originalName}" de sim-ui.js!`);
            }
            importedLocalNames.add(localName);
        });
    }

    // 4.2 Verifica uso de exportações de sim-ui.js sem importação
    for (const fnName of simUiExports) {
        const usageRegex = new RegExp('(?<![.\\w$])' + fnName + '\\b', 'g');
        const matches = [...codeNoComments.matchAll(usageRegex)];
        if (matches.length > 0 && !importedLocalNames.has(fnName)) {
            const localDef = new RegExp(`(?:function|class|const|let|var)\\s+${fnName}\\b`).test(codeNoComments);
            if (!localDef) {
                reportError(jsFile, `Função/classe "${fnName}" é usada no código mas NÃO está importada de sim-ui.js!`);
            }
        }
    }

    // 4.3 Verifica referências literais de ícones no JS (caminhos e setElementIcon/getSVGContent)
    for (const m of codeNoComments.matchAll(/assets\/icons\/([^"'\s>`$]+)/g)) {
        let iconName = m[1];
        if (!iconName.endsWith('.svg')) iconName += '.svg';
        if (!existingIcons.has(iconName)) {
            reportError(jsFile, `Ícone 404 no JS: "${iconName}"`);
        }
    }

    for (const m of codeNoComments.matchAll(/(?:setElementIcon|getSVGContent)\s*\(\s*(?:[^,]+,\s*)?['"]([a-z0-9._-]+)['"]\s*\)/g)) {
        const arg = m[1];
        const iconFile = arg.endsWith('.svg') ? arg : `${arg}.svg`;
        if (!existingIcons.has(iconFile)) {
            reportError(jsFile, `Chamada a setElementIcon/getSVGContent referencia ícone 404: "${arg}"`);
        }
    }

    // 4.4 Alerta de playControl.setState(0) sem triggerCallback=true nem isRunning=false adjacente
    const jsLines = codeNoComments.split('\n');
    jsLines.forEach((line, idx) => {
        if (/\.setState\(\s*0\s*\)/.test(line)) {
            const windowText = jsLines.slice(Math.max(0, idx - 1), Math.min(jsLines.length, idx + 3)).join('\n');
            if (!/(?:isRunning|isSimRunning|isPlaying|running)\s*=\s*false/.test(windowText)) {
                reportByScope(
                    isStrictTarget,
                    `${jsFile}:${idx + 1}`,
                    `Chamada ".setState(0)" sem triggerCallback=true nem atribuição explícita de pausa (isRunning = false). Use ".setState(0, true)".`
                );
            }
        }
    });

    return {
        hasInitBottomSheet: /\binitBottomSheet\s*\(/.test(codeNoComments)
    };
}

function validatePage({ htmlPath, jsFiles, isStrictTarget, isTemplate = false }) {
    const rawHtmlContent = fs.readFileSync(path.join(projectRoot, htmlPath), 'utf8');
    const htmlContent = stripHtmlComments(rawHtmlContent);

    // A. Alvos de data-tab no HTML
    for (const m of htmlContent.matchAll(/data-tab=["']([^"'\s>]+)["']/g)) {
        const targetId = m[1];
        if (!htmlContent.includes(`id="${targetId}"`) && !htmlContent.includes(`id='${targetId}'`)) {
            reportError(htmlPath, `data-tab="${targetId}" aponta para ID inexistente no HTML!`);
        }
    }

    // B. Ícones referenciados no HTML
    const iconRegex = /(?:src=["']\.\.\/assets\/icons\/([^"'\s>]+)|data-icon-(?:idle|active)=["']([^"'\s>]+)|data-focus-icon=["']([^"'\s>]+))/g;
    for (const m of htmlContent.matchAll(iconRegex)) {
        let iconName = m[1] || m[2] || m[3];
        if (iconName.includes('{{')) continue;
        if (!iconName.endsWith('.svg')) iconName += '.svg';
        if (!existingIcons.has(iconName)) {
            reportError(htmlPath, `Ícone 404 inexistente: "${iconName}"`);
        }
    }

    // C. Contrato de Modo Foco: focus-context-toolbar sem style="display:none" inline (regex robusta)
    const focusToolbarTag = htmlContent.match(/<[^>]*\bid=["']focus-context-toolbar["'][^>]*>/i);
    if (focusToolbarTag && /style=["'][^"']*display\s*:\s*none/i.test(focusToolbarTag[0])) {
        reportError(htmlPath, `focus-context-toolbar possui style="display: none" inline (quebra o Modo Foco).`);
    }

    // C2. Contrato de Modo Foco: data-focus-control="slider" deve estar apenas em <input type="range">
    for (const m of htmlContent.matchAll(/<([a-zA-Z0-9-]+)\b([^>]*\bdata-focus-control=["']slider["'][^>]*)>/gi)) {
        const tagName = m[1].toLowerCase();
        const attrs = m[2];
        const isRangeInput = tagName === 'input' && /\btype=["']range["']/i.test(attrs);
        if (!isRangeInput) {
            reportByScope(
                isStrictTarget,
                htmlPath,
                `data-focus-control="slider" aplicado em <${tagName}> em vez de <input type="range">.`
            );
        }
    }

    // D. Contrato de Tema: theme-init.js antes de design-system.css, #btn-theme-toggle e theme-color="#1c1917"
    const themeInitIdx = htmlContent.search(/<script\b[^>]*src=["']\.\.\/theme-init\.js["'][^>]*>/i);
    const dsCssIdx = htmlContent.search(/<link\b[^>]*href=["']css\/design-system\.css["'][^>]*>/i);
    if (themeInitIdx === -1) {
        reportByScope(isStrictTarget, htmlPath, 'Ausência de <script src="../theme-init.js"></script> (risco de FOUC no tema claro).');
    } else if (dsCssIdx !== -1 && themeInitIdx > dsCssIdx) {
        reportByScope(isStrictTarget, htmlPath, '<script src="../theme-init.js"> deve aparecer ANTES de css/design-system.css.');
    }

    if (!/\bid=["']btn-theme-toggle["']/.test(htmlContent)) {
        reportByScope(isStrictTarget, htmlPath, 'Botão #btn-theme-toggle ausente no cabeçalho.');
    }

    const themeColorMeta = htmlContent.match(/<meta\b[^>]*name=["']theme-color["'][^>]*>/i);
    const themeColorVal = themeColorMeta ? (themeColorMeta[0].match(/content=["']([^"']+)["']/i)?.[1] || '') : '';
    if (themeColorVal.toLowerCase() !== '#1c1917') {
        reportByScope(
            isStrictTarget,
            htmlPath,
            `meta[name="theme-color"] está "${themeColorVal || 'ausente'}" — esperado "#1c1917" (Superfície Papel).`
        );
    }

    // E. Contrato Mobile / Viewport: viewport-fit=cover, interactive-widget=resizes-content, #btn-mobile-settings
    const viewportMeta = htmlContent.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i);
    const viewportContent = viewportMeta ? (viewportMeta[0].match(/content=["']([^"']+)["']/i)?.[1] || '') : '';
    if (!viewportContent.includes('viewport-fit=cover') || !viewportContent.includes('interactive-widget=resizes-content')) {
        reportByScope(
            isStrictTarget,
            htmlPath,
            'meta[name="viewport"] deve incluir "viewport-fit=cover" e "interactive-widget=resizes-content".'
        );
    }

    if (!/\bid=["']btn-mobile-settings["']/.test(htmlContent)) {
        reportByScope(isStrictTarget, htmlPath, 'Botão mobile #btn-mobile-settings (.canvas-btn-settings) ausente no HTML.');
    }

    // F. Contrato de Onboarding: #modal-onboarding, #onboarding-qr-panel, #btn-toggle-onboarding-qr e sem ícones em .onboarding-card-title
    if (!/\bid=["']modal-onboarding["']/.test(htmlContent)) {
        reportByScope(isStrictTarget, htmlPath, 'Modal #modal-onboarding ausente.');
    } else {
        if (!/\bid=["']onboarding-qr-panel["']/.test(htmlContent)) {
            reportByScope(isStrictTarget, htmlPath, 'Painel #onboarding-qr-panel ausente em #modal-onboarding.');
        }
        if (!/\bid=["']btn-toggle-onboarding-qr["']/.test(htmlContent)) {
            reportByScope(isStrictTarget, htmlPath, 'Botão #btn-toggle-onboarding-qr ausente em #modal-onboarding.');
        }
        for (const m of htmlContent.matchAll(/<div\b[^>]*class=["'][^"']*\bonboarding-card-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
            if (/<(?:img|svg)\b/i.test(m[1])) {
                reportByScope(isStrictTarget, htmlPath, 'Ícone <img>/<svg> encontrado dentro de .onboarding-card-title (onboarding deve ser limpo/sem ícones nos cards).');
                break;
            }
        }
    }

    // G. Detecção de classes legadas proibidas
    const legacyClasses = ['sim-transport-bar', 'sheet-drag-handle', 'sim-modal-content', 'sim-modal-close-btn'];
    for (const legacyCls of legacyClasses) {
        if (new RegExp(`class=["'][^"']*\\b${legacyCls}\\b`).test(htmlContent)) {
            reportByScope(isStrictTarget, htmlPath, `Uso de classe legada ".${legacyCls}" detectado no HTML.`);
        }
    }

    // H. IDs duplicados no mesmo HTML
    const seenIds = new Set();
    const dupIds = new Set();
    for (const m of htmlContent.matchAll(/\bid=["']([^"']+)["']/g)) {
        if (seenIds.has(m[1])) dupIds.add(m[1]);
        seenIds.add(m[1]);
    }
    for (const id of dupIds) {
        reportByScope(isStrictTarget, htmlPath, `ID duplicado no HTML: "#${id}".`);
    }

    // I. Verificação de 404 em <link> e <script> locais
    if (!isTemplate) {
        const htmlDir = path.dirname(path.join(projectRoot, htmlPath));
        for (const m of htmlContent.matchAll(/<(?:link\b[^>]*href|script\b[^>]*src)=["']([^"']+)["']/gi)) {
            const ref = m[1];
            if (/^(?:https?:|\/\/|data:|#)/i.test(ref) || ref.includes('{{')) continue;
            const cleanRef = ref.split(/[?#]/)[0];
            if (!cleanRef) continue;
            const resolved = path.resolve(htmlDir, cleanRef);
            if (!fs.existsSync(resolved)) {
                reportError(htmlPath, `Recurso local inexistente (404): "${ref}".`);
            }
        }
    }

    // J. Validação dos arquivos JS associados
    if (jsFiles.length === 0) {
        reportByScope(isStrictTarget, htmlPath, 'Nenhum arquivo JS associado encontrado para esta página.');
        return;
    }

    let anyBottomSheet = false;
    for (const jsFile of jsFiles) {
        const res = validateJsFile(jsFile, isStrictTarget);
        if (res.hasInitBottomSheet) anyBottomSheet = true;
    }

    if (!anyBottomSheet) {
        reportByScope(isStrictTarget, htmlPath, 'initBottomSheet() não é chamado nos scripts da simulação (painel mobile inacessível).');
    }
}

// 4.A Vitrine Canônica (ui_lab) — Gate Estrito (ERROR)
validatePage({
    htmlPath: path.join('simulacoes', 'ui_lab.html'),
    jsFiles: [uiLabJsRelPath],
    isStrictTarget: true
});

// 4.B Template Oficial do Plugin — Gate Estrito (ERROR)
if (fs.existsSync(path.join(projectRoot, templateHtmlPath))) {
    validatePage({
        htmlPath: templateHtmlPath,
        jsFiles: fs.existsSync(path.join(projectRoot, templateJsPath)) ? [templateJsPath] : [],
        isStrictTarget: true,
        isTemplate: true
    });
}

// 4.C As 14 Simulações da Plataforma
for (const htmlPath of simulationHtmlPaths) {
    const simBaseName = path.basename(htmlPath, '.html');
    const jsPath = path.join('simulacoes/scripts', `${simBaseName}.js`);
    const jsFiles = [];
    if (fs.existsSync(path.join(projectRoot, jsPath))) {
        jsFiles.push(jsPath);
    }

    if (simBaseName === 'matrizes') {
        const extraDir = path.join(projectRoot, 'simulacoes/scripts/matrizes');
        if (fs.existsSync(extraDir)) {
            fs.readdirSync(extraDir)
                .filter(f => f.endsWith('.js'))
                .sort()
                .forEach(f => jsFiles.push(path.join('simulacoes/scripts/matrizes', f)));
        }
    }

    validatePage({
        htmlPath,
        jsFiles,
        isStrictTarget: false
    });
}

// =============================================================================
// 5. SUMÁRIO FINAL
// =============================================================================
console.log('\n-------------------------------------------------------------');
if (totalErrors === 0) {
    if (totalWarnings === 0) {
        console.log('✅ SUCESSO TOTAL: 0 erros e 0 avisos em toda a plataforma.');
    } else {
        console.log(`✅ SUCESSO (Gate Fase 1): 0 erros críticos. (${totalWarnings} avisos de baseline para a Fase 2 — use --strict para modo bloqueante).`);
    }
} else {
    console.error(`🚨 FALHA${isStrict ? ' (MODO STRICT)' : ''}: Foram encontrados ${totalErrors} erro(s)${totalWarnings ? ` e ${totalWarnings} aviso(s)` : ''}.`);
    process.exit(1);
}
