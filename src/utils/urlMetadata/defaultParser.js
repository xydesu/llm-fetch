const cheerio = require('cheerio');
const logger = require('../logger');

async function fetchUrlMetadata(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4秒超時
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                // 偽裝成瀏覽器，否則有些網站會阻擋
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return null;
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) return null;

        const text = await response.text();
        const $ = cheerio.load(text);
        
        let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
        let description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
        
        if (!title && !description) return null;

        return { title: title.trim(), description: description.trim() };
    } catch (err) {
        logger.warn(`抓取網址失敗 (${url}): ${err.message}`);
        return null;
    }
}

module.exports = {
    match: () => true, // 預設解析器匹配所有無法被其他解析器處理的網址
    parse: async (url) => {
        const metadata = await fetchUrlMetadata(url);
        if (!metadata) return null;
        return `[網頁連結: ${metadata.title} | ${metadata.description}]`;
    }
};
