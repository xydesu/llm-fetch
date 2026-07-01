const fs = require('fs');
const path = require('path');
const util = require('util');

// 確保 logs 資料夾存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function getLogDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimestamp() {
    const d = new Date();
    // 使用 toLocaleString 以確保時區正確，sv-SE 會產生 YYYY-MM-DD HH:mm:ss 格式
    return d.toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' });
}

function formatMessage(level, args) {
    // util.format 會像 console.log 一樣自動展開物件與處理多個參數
    const msg = util.format(...args);
    return `[${getTimestamp()}] [${level}] ${msg}\n`;
}

function writeToFile(logStr) {
    const logFile = path.join(logDir, `bot-${getLogDate()}.log`);
    // 非同步寫入，不阻塞主執行緒
    fs.appendFile(logFile, logStr, (err) => {
        if (err) process.stderr.write(`[Log Error] 無法寫入日誌檔: ${err}\n`);
    });
}

const COLORS = {
    INFO: '\x1b[36m',   // 青色
    WARN: '\x1b[33m',   // 黃色
    ERROR: '\x1b[31m',  // 紅色
    DEBUG: '\x1b[90m',  // 灰色
    RESET: '\x1b[0m'    // 重置
};

const logger = {
    info: (...args) => {
        const str = formatMessage('INFO', args);
        
        // 判斷是否為自訂的 Debug 標籤
        const isDebug = typeof args[0] === 'string' && args[0].startsWith('[Debug]');
        const color = isDebug ? COLORS.DEBUG : COLORS.INFO;
        const label = isDebug ? 'DEBUG' : 'INFO';
        const cleanMsg = util.formatWithOptions({ depth: null, colors: false }, ...args).replace('[Debug] ', '');
        
        const consoleStr = `${color}[${label}]${COLORS.RESET} [${getTimestamp()}] ${cleanMsg}\n`;
        process.stdout.write(consoleStr);
        writeToFile(str);
    },
    error: (...args) => {
        const str = formatMessage('ERROR', args);
        const consoleStr = `${COLORS.ERROR}[ERROR]${COLORS.RESET} [${getTimestamp()}] ${util.formatWithOptions({ depth: null, colors: false }, ...args)}\n`;
        process.stderr.write(consoleStr);
        writeToFile(str);
    },
    warn: (...args) => {
        const str = formatMessage('WARN', args);
        const consoleStr = `${COLORS.WARN}[WARN]${COLORS.RESET} [${getTimestamp()}] ${util.formatWithOptions({ depth: null, colors: false }, ...args)}\n`;
        process.stdout.write(consoleStr);
        writeToFile(str);
    },
    debug: (...args) => {
        const str = formatMessage('DEBUG', args);
        const consoleStr = `${COLORS.DEBUG}[DEBUG]${COLORS.RESET} [${getTimestamp()}] ${util.formatWithOptions({ depth: null, colors: false }, ...args)}\n`;
        process.stdout.write(consoleStr);
        writeToFile(str);
    },
    logDir
};

module.exports = logger;
