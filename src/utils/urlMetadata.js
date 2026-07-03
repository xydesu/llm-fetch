const { parseUrl } = require('./urlMetadata/index');

async function extractUrlsMetadata(text) {
    if (!text) return [];
    
    // 簡單提取 URL 的 regex
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    
    // 移除重複並限制最多處理 2 個 URL，避免過度延遲
    const uniqueUrls = [...new Set(urls)].slice(0, 2);
    const results = [];
    const images = [];
    
    for (const url of uniqueUrls) {
        const metadata = await parseUrl(url);
        if (metadata) {
            if (metadata.text) {
                results.push(metadata.text);
            }
            if (metadata.images && metadata.images.length > 0) {
                images.push(...metadata.images);
            }
        }
    }
    
    return { texts: results, images: images };
}

module.exports = { extractUrlsMetadata };
