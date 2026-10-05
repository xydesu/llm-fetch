const URL = require('url');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

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
            const text = (data.status.text || '').trim();
            const reposts = data.status.reposts || 0;
            const likes = data.status.likes || 0;
            
            // 媒體內容判斷與縮圖提取
            let mediaInfo = [];
            let images = [];
            
            if (data.status.media) {
                if (data.status.media.photos && Array.isArray(data.status.media.photos) && data.status.media.photos.length > 0) {
                    mediaInfo.push(promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_media_photo_count', { count: data.status.media.photos.length }));
                    for (const p of data.status.media.photos) {
                        if (p.url && !images.includes(p.url)) {
                            images.push(p.url);
                        }
                    }
                }
                if (data.status.media.video || data.status.media.videos) {
                    const videoList = Array.isArray(data.status.media.videos) 
                        ? data.status.media.videos 
                        : (data.status.media.video ? [data.status.media.video] : []);
                    mediaInfo.push(videoList.length > 0
                        ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_media_video_count', { count: videoList.length })
                        : promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_media_video_only'));
                    for (const v of videoList) {
                        if (v.thumbnail_url && !images.includes(v.thumbnail_url)) {
                            images.push(v.thumbnail_url);
                        }
                    }
                }
                // 備用遍歷 media.all 補全可能遺漏的縮圖
                if (Array.isArray(data.status.media.all)) {
                    for (const item of data.status.media.all) {
                        const thumb = item.thumbnail_url || (item.type === 'photo' ? item.url : null);
                        if (thumb && !images.includes(thumb)) {
                            images.push(thumb);
                        }
                    }
                }
            }
            const mediaText = mediaInfo.length > 0
                ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_media_note', { media_items: mediaInfo.join(', ') })
                : '';

            // 確保無文字時明確標示，避免大腦誤將作者暱稱當作推文主題
            const contentText = text || (images.length > 0
                ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_media_only_text')
                : promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_no_text'));

            const resultText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'twitter_post', {
                author: author,
                reposts: reposts,
                likes: likes,
                media_text: mediaText,
                content_text: contentText
            });

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
