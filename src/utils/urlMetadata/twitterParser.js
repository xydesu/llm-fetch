const URL = require('url');

const TWITTER_DOMAINS = ['twitter.com', 'x.com', 'fxtwitter.com', 'fixupx.com', 'vxtwitter.com'];

/**
 * 檢查是否為 Twitter/X 相關網址
 */
function match(urlString) {
    try {
        const parsed = new URL.URL(urlString);
        return TWITTER_DOMAINS.includes(parsed.hostname) || TWITTER_DOMAINS.some(d => parsed.hostname.endsWith('.' + d));
    } catch (e) {
        return false;
    }
}

/**
 * 解析 Twitter/X 網址並提取內容
 */
async function parse(urlString) {
    try {
        const parsed = new URL.URL(urlString);
        // 匹配推文 ID： /status/:id 或 /statuses/:id
        const matchResult = parsed.pathname.match(/\/status(?:es)?\/(\d+)/);
        if (!matchResult) return null;
        
        const id = matchResult[1];
        const apiUrl = `https://api.fxtwitter.com/2/status/${id}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.code === 200 && data.status) {
            const author = data.status.author ? data.status.author.name : 'Unknown';
            const text = data.status.text || '';
            const reposts = data.status.reposts || 0;
            const likes = data.status.likes || 0;
            
            // 媒體內容判斷
            let mediaInfo = [];
            let images = [];
            
            if (data.status.media) {
                if (data.status.media.photos && Array.isArray(data.status.media.photos) && data.status.media.photos.length > 0) {
                    mediaInfo.push(`${data.status.media.photos.length} 張圖片`);
                    images = data.status.media.photos.map(p => p.url).filter(Boolean);
                }
                if (data.status.media.video || data.status.media.videos) {
                    mediaInfo.push(`包含影片`);
                }
            }
            const mediaText = mediaInfo.length > 0 ? ` [附帶: ${mediaInfo.join(', ')}]` : '';

            const resultText = [
                `[Twitter 推文 | 作者: ${author} | 轉推: ${reposts} 喜歡: ${likes}${mediaText}]`,
                `${text}`
            ].join('\n');

            return {
                text: resultText,
                images: images
            };
        }
    } catch (e) {
        console.error(`[Twitter 網址解析失敗] ${e.message}`);
    }
    
    // 如果解析失敗但仍是 Twitter 網址，回傳 null 讓其他 parser 接手
    return null;
}

module.exports = {
    match,
    parse
};
