const defaultParser = require('./defaultParser');
const bilibiliParser = require('./bilibiliParser');
const twitterParser = require('./twitterParser');
const youtubeParser = require('./youtubeParser');
const facebookParser = require('./facebookParser');
const threadsParser = require('./threadsParser');
const instagramParser = require('./instagramParser');
const discordParser = require('./discordParser');
const googleMapsParser = require('./googleMapsParser');

// 專用解析器清單，優先順序由上到下
const dedicatedParsers = [
    discordParser, // Discord 內部連結優先處理，避免被通用爬蟲誤爬
    googleMapsParser, // Google Maps 連結優先處理，避免回退通用爬蟲誤抓 staticmap
    youtubeParser,
    twitterParser,
    bilibiliParser,
    facebookParser,
    threadsParser,
    instagramParser
];

/**
 * 驗證解析結果是否包含有效的 metadata（包含文字或圖片）
 * @param {Object} metadata 
 * @returns {boolean}
 */
function isValidMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return false;
    }
    const hasText = typeof metadata.text === 'string' && metadata.text.trim().length > 0;
    const hasImages = Array.isArray(metadata.images) && metadata.images.length > 0;
    return Boolean(hasText || hasImages);
}

/**
 * 解析網址並擷取 metadata
 * @param {string} url 
 * @param {Object} context 上下文參數，包含 { client, currentGuildId }
 * @returns {Promise<{text?: string, images?: string[]}|null>}
 */
async function parseUrl(url, context = {}) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    // 確保網址包含 protocol，避免 new URL() 拋出錯誤
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // 依序檢查專用解析器
    for (const parser of dedicatedParsers) {
        try {
            if (parser.match(url)) {
                const metadata = await parser.parse(url, context);
                if (isValidMetadata(metadata)) {
                    return metadata;
                }
                // 專用解析器匹配但明確未取得有效內容（例如已判定看不到內容或受限），直接結束，絕不回退至 defaultParser
                return null;
            }
        } catch (err) {
            // 專用解析器執行異常，直接結束，避免回退造成宣傳圖誤爬
            return null;
        }
    }

    // 當無專用解析器匹配時，回退使用通用解析器
    try {
        const fallbackMetadata = await defaultParser.parse(url);
        return isValidMetadata(fallbackMetadata) ? fallbackMetadata : null;
    } catch (err) {
        return null;
    }
}

module.exports = {
    parseUrl
};
