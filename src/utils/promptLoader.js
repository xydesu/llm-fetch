const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PROMPTS_DIR = path.join(__dirname, '../../prompts');
const PERSONAS_DIR = path.join(__dirname, '../../personas');

// 確保 prompts 資料夾存在
if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
}

/**
 * 讀取指定的 Markdown 提示詞檔案
 * @param {string} filePath 絕對路徑或相對檔名
 * @returns {string}
 */
function readMarkdownFile(filePath) {
    try {
        let targetPath = filePath;
        if (!path.isAbsolute(targetPath)) {
            if (targetPath.startsWith('personas/')) {
                targetPath = path.join(__dirname, '../../', targetPath);
            } else {
                targetPath = path.join(PROMPTS_DIR, targetPath);
            }
        }
        if (fs.existsSync(targetPath)) {
            return fs.readFileSync(targetPath, 'utf8');
        }
    } catch (e) {
        logger.error(`[PromptLoader] 讀取 Markdown 檔案失敗 (${filePath}):`, e.message);
    }
    return '';
}

/**
 * 寫入 Markdown 檔案
 * @param {string} filePath 
 * @param {string} content 
 */
function writeMarkdownFile(filePath, content) {
    try {
        let targetPath = filePath;
        if (!path.isAbsolute(targetPath)) {
            if (targetPath.startsWith('personas/')) {
                targetPath = path.join(__dirname, '../../', targetPath);
            } else {
                targetPath = path.join(PROMPTS_DIR, targetPath);
            }
        }
        fs.writeFileSync(targetPath, content, 'utf8');
        logger.info(`[PromptLoader] 成功更新與持久化 Markdown 檔案 (${path.basename(targetPath)})`);
        return true;
    } catch (e) {
        logger.error(`[PromptLoader] 寫入 Markdown 檔案失敗 (${filePath}):`, e.message);
        return false;
    }
}

/**
 * 解析 Markdown 檔案中的「不可變核心」與「自我進化區塊」
 * @param {string} markdownContent 
 * @returns {Object} { immutableBlock, evolvableBlock }
 */
function parseBlocks(markdownContent) {
    let immutableBlock = '';
    let evolvableBlock = '';

    const immutableMatch = markdownContent.match(/===\s*核心不可變區塊開始\s*===([\s\S]*?)===\s*核心不可變區塊結束\s*===/i);
    if (immutableMatch) {
        immutableBlock = immutableMatch[1].trim();
    }

    const evolvableMatch = markdownContent.match(/===\s*(?:自)?自我進化區塊開始\s*===([\s\S]*?)===\s*(?:自)?自我進化區塊結束\s*===/i);
    if (evolvableMatch) {
        evolvableBlock = evolvableMatch[1].trim();
    }

    return { immutableBlock, evolvableBlock };
}

/**
 * 獲取主對話規則提示詞 (prompts/rules.md)
 */
function getRulesPrompt() {
    const raw = readMarkdownFile('rules.md');
    const { immutableBlock, evolvableBlock } = parseBlocks(raw);
    return `${immutableBlock}\n\n${evolvableBlock}`.trim();
}

/**
 * 獲取知識學習規則提示詞 (prompts/learning_rules.md)
 */
function getLearningPrompt() {
    const raw = readMarkdownFile('learning_rules.md');
    const { immutableBlock, evolvableBlock } = parseBlocks(raw);
    return `${immutableBlock}\n\n${evolvableBlock}`.trim();
}

/**
 * 獲取 Presence 動態規則提示詞 (prompts/presence_rules.md)
 */
function getPresencePrompt() {
    const raw = readMarkdownFile('presence_rules.md');
    const { immutableBlock, evolvableBlock } = parseBlocks(raw);
    return `${immutableBlock}\n\n${evolvableBlock}`.trim();
}

/**
 * 獲取反思規則提示詞 (prompts/reflection_rules.md)
 */
function getReflectionPrompt() {
    const raw = readMarkdownFile('reflection_rules.md');
    const { immutableBlock, evolvableBlock } = parseBlocks(raw);
    return `${immutableBlock}\n\n${evolvableBlock}`.trim();
}

/**
 * 獲取小雪核心人設 (personas/xiaoxue.md)
 */
function getPersonaPrompt() {
    return readMarkdownFile('personas/xiaoxue.md');
}

/**
 * 更新指定 Markdown 檔案中的「自我進化區塊」，保持「核心不可變區塊」受保護不被篡改
 * @param {string} fileName 例如 'rules.md' 或 'personas/xiaoxue.md'
 * @param {string} newEvolvableContent 新的可進化內容
 */
function updateEvolvableSection(fileName, newEvolvableContent, reason = '小雪自我進化修訂') {
    const currentContent = readMarkdownFile(fileName);
    if (!currentContent) return false;

    const { evolvableBlock: oldEvolvableContent } = parseBlocks(currentContent);
    let success = false;

    // 檢查是否有自我進化區塊 (支援自自我錯字相容)
    if (/===\s*(?:自)?自我進化區塊開始\s*===/i.test(currentContent)) {
        const updated = currentContent.replace(
            /===\s*(?:自)?自我進化區塊開始\s*===[\s\S]*?===\s*(?:自)?自我進化區塊結束\s*===/i,
            `=== 自我進化區塊開始 ===\n${newEvolvableContent.trim()}\n=== 自我進化區塊結束 ===`
        );
        success = writeMarkdownFile(fileName, updated);
    } else {
        // 若檔案尚無進化區塊標籤，追加在檔尾
        const updated = `${currentContent.trim()}\n\n=== 自我進化區塊開始 ===\n${newEvolvableContent.trim()}\n=== 自我進化區塊結束 ===\n`;
        success = writeMarkdownFile(fileName, updated);
    }

    if (success) {
        try {
            const sqlite = require('../db/sqlite');
            sqlite.addPromptEvolutionLog(fileName, oldEvolvableContent || '', newEvolvableContent.trim(), reason);
        } catch (err) {
            logger.warn('[PromptLoader] 記錄提示詞進化 DB Log 失敗:', err.message);
        }
    }

    return success;
}

/**
 * 取得所有提示詞與人設檔案列表及解析後的區塊
 */
function getAllPromptFiles() {
    const results = [];
    if (fs.existsSync(PROMPTS_DIR)) {
        const files = fs.readdirSync(PROMPTS_DIR);
        files.forEach(f => {
            if (f.endsWith('.md')) {
                const raw = readMarkdownFile(f);
                const { immutableBlock, evolvableBlock } = parseBlocks(raw);
                results.push({
                    fileName: f,
                    path: `prompts/${f}`,
                    rawContent: raw,
                    immutableBlock,
                    evolvableBlock
                });
            }
        });
    }
    // 加入 personas/xiaoxue.md
    const personaRaw = readMarkdownFile('personas/xiaoxue.md');
    if (personaRaw) {
        const { immutableBlock, evolvableBlock } = parseBlocks(personaRaw);
        results.push({
            fileName: 'personas/xiaoxue.md',
            path: 'personas/xiaoxue.md',
            rawContent: personaRaw,
            immutableBlock,
            evolvableBlock
        });
    }
    return results;
}

/**
 * 更新 personas/xiaoxue.md 中的人名穩定區塊
 * @param {string} newPersonBlockContent 
 */
function updatePersonBlock(newPersonBlockContent) {
    const filePath = 'personas/xiaoxue.md';
    const currentContent = readMarkdownFile(filePath);
    if (!currentContent) return false;

    const updated = currentContent.replace(
        /===\s*人名穩定區塊開始\s*===[\s\S]*?===\s*人名穩定區塊結束\s*===/i,
        `=== 人名穩定區塊開始 ===\n${newPersonBlockContent.trim()}\n=== 人名穩定區塊結束 ===`
    );
    return writeMarkdownFile(filePath, updated);
}

/**
 * 將 {{named_placeholders}} 以執行期資料插值 (僅代換資料，不含任何指令文字)
 * @param {string} template
 * @param {Object} variables
 * @returns {string}
 */
function renderTemplate(template, variables = {}) {
    return String(template || '').replace(/{{([A-Za-z0-9_]+)}}/g, (match, key) => {
        const value = variables[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

/**
 * 解析 Markdown 檔案中以 '## 名稱' 分段的多段式提示詞
 * @param {string} markdownContent
 * @returns {Object<string, string>} 區塊名稱 -> 區塊內容 (已去除首尾空白)
 */
function parseNamedSections(markdownContent) {
    const sections = {};
    const lines = String(markdownContent || '').split(/\r?\n/);
    let currentName = null;
    let buffer = [];

    const flush = () => {
        if (currentName) sections[currentName] = buffer.join('\n').trim();
    };

    for (const line of lines) {
        const match = line.match(/^##\s+([A-Za-z0-9_.\-]+)\s*$/);
        if (match) {
            flush();
            currentName = match[1];
            buffer = [];
        } else if (currentName) {
            buffer.push(line);
        }
    }
    flush();
    return sections;
}

/**
 * 取得 Markdown 檔案中指定具名區塊的原始內容
 * @param {string} fileName
 * @param {string} sectionName
 * @returns {string}
 */
function getPromptSection(fileName, sectionName) {
    const sections = parseNamedSections(readMarkdownFile(fileName));
    return sections[sectionName] === undefined ? '' : sections[sectionName];
}

/**
 * 取得 Markdown 檔案中指定具名區塊並完成 {{placeholder}} 插值
 * @param {string} fileName
 * @param {string} sectionName
 * @param {Object} variables
 * @returns {string}
 */
function renderPromptSection(fileName, sectionName, variables = {}) {
    return renderTemplate(getPromptSection(fileName, sectionName), variables);
}

/**
 * 通用提示詞載入函式：傳入檔名 (如 'fact_extraction_rules.md')，回傳組合後的完整提示詞
 * @param {string} fileName 
 * @returns {string}
 */
function getPrompt(fileName) {
    const raw = readMarkdownFile(fileName);
    const { immutableBlock, evolvableBlock } = parseBlocks(raw);
    if (immutableBlock || evolvableBlock) {
        return `${immutableBlock}\n\n${evolvableBlock}`.trim();
    }
    return raw.trim();
}

/**
 * Loads a Markdown prompt template and replaces {{named_placeholders}} with
 * runtime context. Prompt instructions belong in Markdown; callers supply data only.
 */
function renderPrompt(fileName, variables = {}) {
    return renderTemplate(getPrompt(fileName), variables);
}

module.exports = {
    readMarkdownFile,
    writeMarkdownFile,
    parseBlocks,
    parseNamedSections,
    getPrompt,
    getPromptSection,
    renderTemplate,
    renderPrompt,
    renderPromptSection,
    getRulesPrompt,
    getLearningPrompt,
    getPresencePrompt,
    getReflectionPrompt,
    getPersonaPrompt,
    updateEvolvableSection,
    updatePersonBlock,
    getAllPromptFiles
};
