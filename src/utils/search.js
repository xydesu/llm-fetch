const cheerio = require('cheerio');
const logger = require('./logger');

async function searchWeb(query) {
    const startTime = Date.now();
    let isCompleted = false;
    
    const progressTimer = setInterval(() => {
        if (!isCompleted) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.info(`[Search] DuckDuckGo 搜尋已等待 ${elapsed} 秒，處理中或網路回應延遲...`);
        }
    }, 3000);

    try {
        logger.info(`[Search] 開始進行 DuckDuckGo 網頁搜尋: "${query}"`);
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP 錯誤狀態碼: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];
        
        $('.result__body').each((i, el) => {
            if (i >= 5) return false;
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            if (title && snippet) {
                results.push(`【標題】${title}\n【摘要】${snippet}`);
            }
        });
        
        isCompleted = true;
        clearInterval(progressTimer);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`[Search] DuckDuckGo 搜尋成功，耗時 ${duration} 秒，找到 ${results.length} 筆結果。`);
        
        return results.join('\n\n') || '找不到相關結果。';
    } catch (err) {
        isCompleted = true;
        clearInterval(progressTimer);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error(`[Search] DuckDuckGo 搜尋在 ${elapsed} 秒後失敗。細節: ${err.message}`);
        
        if (err.message.includes('429') || err.message.includes('403')) {
            logger.warn(`[Search] 偵測為【搜尋頻率限制或 IP 封鎖 (Rate Limit/Block)】`);
        } else if (err.message.includes('timeout') || err.message.includes('fetch') || err.message.includes('connect')) {
            logger.error(`[Search] 偵測為【網路因素】(例如連線超時、DNS 解析失敗或斷線)`);
        }
        
        return '搜尋失敗，無法取得結果。';
    }
}

async function searchImages(query) {
    const startTime = Date.now();
    try {
        logger.info(`[Search] 開始進行 DuckDuckGo 圖片搜尋: "${query}"`);
        const response = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP 錯誤狀態碼: ${response.status} ${response.statusText}`);
        }
        const html = await response.text();
        const vqdMatch = html.match(/vqd=([0-9-]+)/);
        if (!vqdMatch) {
            throw new Error('無法取得 VQD token');
        }
        const vqd = vqdMatch[1];
        
        const apiUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${vqd}&o=json&l=us-en`;
        const apiResponse = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://duckduckgo.com/'
            }
        });
        if (!apiResponse.ok) {
            throw new Error(`API 錯誤狀態碼: ${apiResponse.status} ${apiResponse.statusText}`);
        }
        const data = await apiResponse.json();
        
        const results = [];
        if (data.results && data.results.length > 0) {
            const limitedResults = data.results.slice(0, 5);
            limitedResults.forEach((item, index) => {
                results.push(`【圖片 ${index + 1}】\n標題：${item.title || '無標題'}\n網址：${item.image}\n來源網頁：${item.url || ''}`);
            });
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`[Search] DuckDuckGo 圖片搜尋成功，耗時 ${duration} 秒，找到 ${results.length} 筆結果。`);
        
        return results.join('\n\n') || '找不到相關圖片結果。';
    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error(`[Search] DuckDuckGo 圖片搜尋在 ${elapsed} 秒後失敗。細節: ${err.message}`);
        return '圖片搜尋失敗，無法取得結果。';
    }
}

module.exports = {
    searchWeb,
    searchImages
};
