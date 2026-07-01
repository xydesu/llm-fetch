const { parseUrl } = require('./urlMetadata/index');

async function extractUrlsMetadata(text) {
    if (!text) return [];
    
    // 簡單提取 URL 的 regex
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    
    // 移除重複並限制最多處理 2 個 URL，避免過度延遲
    const uniqueUrls = [...new Set(urls)].slice(0, 2);
    const results = [];
    
    for (const url of uniqueUrls) {
        const metadataString = await parseUrl(url);
        if (metadataString) {
            results.push(metadataString);
        }
    }
    
    return results; // 這裡回傳的已經是格式化好的字串陣列
}

module.exports = { extractUrlsMetadata };
