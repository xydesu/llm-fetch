const logger = require('../logger');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
};

/**
 * 安全解析 HTML 中的 ytInitialData JSON 物件
 * 使用字串索引與深度終止條件，避免跨行大正則引發災難性回溯 (ReDoS)
 * @param {string} html 網頁原始碼
 * @returns {object|null}
 */
function extractYtInitialData(html) {
    if (!html || typeof html !== 'string') return null;

    const pattern = 'ytInitialData';
    const idx = html.indexOf(pattern);
    if (idx === -1) return null;

    const equalIdx = html.indexOf('=', idx + pattern.length);
    if (equalIdx === -1) return null;

    const startIdx = html.indexOf('{', equalIdx);
    if (startIdx === -1) return null;

    const scriptEndIdx = html.indexOf('</script>', startIdx);
    if (scriptEndIdx !== -1) {
        let endIdx = html.lastIndexOf(';', scriptEndIdx);
        if (endIdx === -1 || endIdx < startIdx) {
            endIdx = scriptEndIdx;
        }
        const candidate = html.substring(startIdx, endIdx).trim();
        try {
            return JSON.parse(candidate);
        } catch {
            // 若快速擷取失敗，改用深度終止掃描
        }
    }

    // 帶深度終止條件的括號計數掃描，上限 2MB 避免無限遍歷
    let depth = 0;
    let inString = false;
    let escape = false;
    let quoteChar = '';
    const maxScanLength = Math.min(html.length, startIdx + 2 * 1024 * 1024);

    for (let i = startIdx; i < maxScanLength; i++) {
        const char = html[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (char === '\\') {
            escape = true;
            continue;
        }
        if (inString) {
            if (char === quoteChar) {
                inString = false;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            inString = true;
            quoteChar = char;
            continue;
        }
        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.substring(startIdx, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
}

/**
 * 從 YouTube 關鍵字搜尋即時真實影片列表 (免 API Key，直接解析首頁資料)
 * @param {string} keyword 搜尋關鍵字 (例如: 'VTuber 歌回', '新番 點評', '艾爾登法環 速通')
 * @param {number} limit 最大取得筆數
 * @returns {Promise<Array>}
 */
async function fetchYouTubeVideos(keyword = 'VTuber 歌回', limit = 10) {
    try {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAI%253D`;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

        const html = await res.text();
        const data = extractYtInitialData(html);
        if (!data) {
            logger.warn(`[YouTubeCrawler] 未能解析【${keyword}】之 ytInitialData`);
            return [];
        }

        const videos = [];

        const extract = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.videoRenderer) {
                const vr = obj.videoRenderer;
                const videoId = vr.videoId;
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                const author = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '';
                const views = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || '';
                const thumbnails = vr.thumbnail?.thumbnails || [];
                const cover = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                if (videoId && title && !title.includes('YouTube Shorts')) {
                    videos.push({
                        id: videoId,
                        title: title.trim(),
                        author: author || 'YouTube 創作者',
                        views: views || '',
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        cover,
                        tag: keyword,
                        category: keyword.includes('歌回') || keyword.includes('VTuber') ? 'VTuber 歌回與精華'
                            : keyword.includes('新番') ? '新番點評推薦'
                            : keyword.includes('速通') || keyword.includes('法環') ? '遊戲極限精華'
                            : 'YouTube 即時精選'
                    });
                }
            }
            for (const key of Object.keys(obj)) {
                extract(obj[key]);
            }
        };

        extract(data);
        const results = videos.slice(0, limit);
        logger.info(`[YouTubeCrawler] 搜尋【${keyword}】成功取得 ${results.length} 部真實即時影片`);
        return results;
    } catch (err) {
        logger.error(`[YouTubeCrawler] 搜尋【${keyword}】失敗:`, err.message);
        return [];
    }
}

/**
 * 抓取 YouTube 即時發燒 / Trending 影片
 */
async function fetchYouTubeTrending(limit = 10) {
    try {
        const url = 'https://www.youtube.com/feed/trending';
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

        const html = await res.text();
        const data = extractYtInitialData(html);
        if (!data) return [];

        const videos = [];

        const extract = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.videoRenderer) {
                const vr = obj.videoRenderer;
                const videoId = vr.videoId;
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                const author = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '';
                const views = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || '';
                const thumbnails = vr.thumbnail?.thumbnails || [];
                const cover = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                if (videoId && title) {
                    videos.push({
                        id: videoId,
                        title: title.trim(),
                        author: author || 'YouTube 創作者',
                        views: views || '',
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        cover,
                        tag: 'YouTube 發燒熱門',
                        category: '熱門發燒'
                    });
                }
            }
            for (const key of Object.keys(obj)) {
                extract(obj[key]);
            }
        };

        extract(data);
        return videos.slice(0, limit);
    } catch (err) {
        logger.error('[YouTubeCrawler] 抓取 Trending 失敗:', err.message);
        return [];
    }
}

module.exports = {
    fetchYouTubeVideos,
    fetchYouTubeTrending
};
