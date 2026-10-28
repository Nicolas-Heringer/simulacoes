// =============================================================================
// Validador de Integridade e Conformidade do Design System 2.0 (sim-ui.js)
// Executa análise estática de imports, recursos inexistentes (404) e contratos de UI
// =============================================================================

import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve('.');

// 1. Coleta todas as funções e classes exportadas pelo sim-ui.js
const simUiCode = fs.readFileSync(path.join(projectRoot, 'simulacoes/scripts/sim-ui.js'), 'utf8');
const exportMatches = [...simUiCode.matchAll(/export\s+(?:function|class|const)\s+([A-Za-z0-9_]+)/g)];
const simUiExports = new Set(exportMatches.map(m => m[1]));

// 2. Coleta todos os ícones reais existentes em assets/icons/
const existingIcons = new Set(fs.readdirSync(path.join(projectRoot, 'assets/icons')));

// 3. Coleta todos os HTMLs em simulacoes/
const htmlFiles = fs.readdirSync(path.join(projectRoot, 'simulacoes'))
    .filter(f => f.endsWith('.html') && f !== 'ui_lab.html')
    .map(f => path.join('simulacoes', f));

let totalErrors = 0;
let checkedFiles = 0;

console.log(`[VALIDADOR DS 2.0] Analisando ${htmlFiles.length} simulações contra ${simUiExports.size} exportações e ${existingIcons.size} ícones...\n`);

htmlFiles.forEach(htmlPath => {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const simBaseName = path.basename(htmlPath, '.html');
    const jsPath = path.join('simulacoes/scripts', `${simBaseName}.js`);
    
    // Lista de arquivos JS a inspecionar para esta simulação
    const jsFiles = [];
    if (fs.existsSync(jsPath)) jsFiles.push(jsPath);
    
    // Tratamento especial para matrizes/
    if (simBaseName === 'matrizes') {
        const extraDir = path.join('simulacoes/scripts/matrizes');
        if (fs.existsSync(extraDir)) {
            fs.readdirSync(extraDir).filter(f => f.endsWith('.js')).forEach(f => {
                jsFiles.push(path.join(extraDir, f));
            });
        }
    }

    if (jsFiles.length === 0) return;
    checkedFiles++;

    let fileHasIssue = false;

    // A. Verifica alvos de data-tab no HTML
    const tabMatches = [...htmlContent.matchAll(/data-tab=["']([^"'\s>]+)["']/g)];
    tabMatches.forEach(m => {
        const targetId = m[1];
        if (!htmlContent.includes(`id="${targetId}"`) && !htmlContent.includes(`id='${targetId}'`)) {
            console.error(`  ❌ [${htmlPath}] data-tab="${targetId}" aponta para ID inexistente no HTML!`);
            totalErrors++;
            fileHasIssue = true;
        }
    });

    // B. Verifica se todos os ícones referenciados no HTML existem em assets/icons/
    const iconRegex = /(?:src=["']\.\.\/assets\/icons\/([^"'\s>]+)|data-icon-(?:idle|active)=["']([^"'\s>]+)|data-focus-icon=["']([^"'\s>]+))/g;
    const iconMatches = [...htmlContent.matchAll(iconRegex)];
    iconMatches.forEach(m => {
        let iconName = m[1] || m[2] || m[3];
        if (!iconName.endsWith('.svg')) iconName += '.svg';
        if (!existingIcons.has(iconName)) {
            console.error(`  ❌ [${htmlPath}] Ícone 404 inexistente: "${iconName}"`);
            totalErrors++;
            fileHasIssue = true;
        }
    });

    // C. Verifica container de Modo Foco no HTML
    if (htmlContent.includes('id="focus-context-toolbar" class="canvas-toolbar pos-bottom-center" style="display: none;"')) {
        console.error(`  ❌ [${htmlPath}] focus-context-toolbar possui style="display:none" inline (quebra o Modo Foco)`);
        totalErrors++;
        fileHasIssue = true;
    }

    // D. Inspeciona cada arquivo JS associado
    jsFiles.forEach(jsFile => {
        const jsContent = fs.readFileSync(jsFile, 'utf8');

        // Extrai nomes importados de sim-ui.js
        const importBlockMatch = jsContent.match(/import\s*\{([^}]+)\}\s*from\s*['"](?:\.\/|\.\.\/)sim-ui\.js['"]/);
        const importedSymbols = new Set();
        if (importBlockMatch) {
            importBlockMatch[1].split(',').forEach(s => {
                const clean = s.trim();
                if (clean) importedSymbols.add(clean);
            });
        }

        // Verifica se qualquer export do sim-ui é usado no código sem ter sido importado
        simUiExports.forEach(fnName => {
            const usageRegex = new RegExp('(?<![\\.\\w])' + fnName + '\\b', 'g');
            const matches = [...jsContent.matchAll(usageRegex)];
            if (matches.length > 0) {
                if (!importedSymbols.has(fnName)) {
                    const localDef = new RegExp('(?:function|class|const|let|var)\\s+' + fnName + '\\b').test(jsContent);
                    if (!localDef) {
                        console.error(`  ❌ [${jsFile}] Função "${fnName}" é chamada no código mas NÃO está na lista de importação!`);
                        totalErrors++;
                        fileHasIssue = true;
                    }
                }
            }
        });

        // Verifica ícones embutidos em JS
        const jsIconMatches = [...jsContent.matchAll(/assets\/icons\/([^"'\s>]+)/g)];
        jsIconMatches.forEach(m => {
            let iconName = m[1];
            if (!iconName.endsWith('.svg')) iconName += '.svg';
            if (!existingIcons.has(iconName)) {
                console.error(`  ❌ [${jsFile}] Ícone 404 no JS: "${iconName}"`);
                totalErrors++;
                fileHasIssue = true;
            }
        });
    });
});

console.log('\n-------------------------------------------------------------');
if (totalErrors === 0) {
    console.log(`✅ SUCESSO: Nenhum erro de importação, 404 de ícones ou alvos de abas quebrado.`);
} else {
    console.error(`🚨 FALHA: Foram encontrados ${totalErrors} erros críticos de integridade.`);
    process.exit(1);
}
