const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

// Google 網域匹配規則（包含 google.com、google.co.*、google.com.* 等常見國家代碼域名）
const GOOGLE_DOMAIN_REGEX = /(?:^|\.)google\.(?:com|co\.[a-z]{2,}|com\.[a-z]{2,})$/i;

/**
 * 清理並解碼 URL 參數或路徑名稱
 * 將加號轉換為空格並處理 URL 編碼字元
 * @param {string} raw 
 * @returns {string}
 */
function cleanText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
    } catch (e) {
        return raw.replace(/\+/g, ' ').trim();
    }
}

/**
 * 檢查是否為 Google Maps 短網址
 * @param {URL} parsedUrl 
 * @returns {boolean}
 */
function isShortLink(parsedUrl) {
    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;
    if (host === 'maps.app.goo.gl') return true;
    if ((host === 'goo.gl' || host.endsWith('.goo.gl')) && (pathname === '/maps' || pathname.startsWith('/maps/'))) {
        return true;
    }
    return false;
}

/**
 * 檢查是否為 Google Maps 網址
 * @param {string} urlString 
 * @returns {boolean}
 */
function match(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    try {
        let normalized = urlString.trim();
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'https://' + normalized;
        }
        const parsed = new URL(normalized);
        const host = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname;

        // 短網址域名：maps.app.goo.gl、goo.gl 且路徑以 /maps 開頭
        if (host === 'maps.app.goo.gl') return true;
        if ((host === 'goo.gl' || host.endsWith('.goo.gl')) && (pathname === '/maps' || pathname.startsWith('/maps/'))) {
            return true;
        }

        // 域名為 maps.google.com
        if (host === 'maps.google.com') return true;

        // 域名包含 google.com 或 google.co.* 或 google.com.* 且路徑為 /maps 或 /search
        if (GOOGLE_DOMAIN_REGEX.test(host)) {
            if (pathname === '/maps' || pathname.startsWith('/maps/') || pathname === '/search' || pathname.startsWith('/search/')) {
                return true;
            }
        }

        return false;
    } catch (e) {
        return false;
    }
}

/**
 * 檢查圖片 URL 是否為 Google 靜態街道地圖縮圖
 * 用於過濾街道縮圖，避免 Vision 視覺模型解析道路標籤產生幻覺
 * @param {string} url 
 * @returns {boolean}
 */
function isStaticMapImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /(?:maps\.google\.com\/maps\/api\/staticmap|maps\.googleapis\.com\/maps\/api\/staticmap|staticmap\?|\/staticmap)/i.test(url);
}

/**
 * 解析 Google Maps 網址並提取地點、座標、搜尋或路線資訊
 * 支援保留店家照片並過濾掉靜態街道地圖縮圖
 * @param {string} urlString 
 * @returns {Promise<{text: string, images: Array}>}
 */
async function parse(urlString) {
    try {
        if (!urlString || typeof urlString !== 'string') {
            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                images: []
            };
        }

        let currentUrl = urlString.trim();
        if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
            currentUrl = 'https://' + currentUrl;
        }

        const initialParsed = new URL(currentUrl);
        let candidateImageUrl = null;

        // 短網址轉址追蹤
        if (isShortLink(initialParsed)) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            try {
                const response = await fetch(currentUrl, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                    }
                });
                clearTimeout(timeoutId);
                if (response && response.url) {
                    currentUrl = response.url;
                }
                const html = await response.text();
                const ogMatch = html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i) || 
                                html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
                if (ogMatch && ogMatch[1]) {
                    const candidate = ogMatch[1].replace(/&amp;/g, '&');
                    if (!isStaticMapImageUrl(candidate)) {
                        candidateImageUrl = candidate;
                    }
                }
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                logger.warn(`[GoogleMapsParser] 短網址轉址失敗 (${urlString}): ${fetchErr.message}`);
                return {
                    text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                    images: []
                };
            }
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(currentUrl);
        } catch (e) {
            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
                images: []
            };
        }

        // 提取經緯度座標（支援 @lat,lng、ll=lat,lng 或 q 參數內座標）
        let coords = null;
        const atMatch = currentUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
        if (atMatch) {
            coords = `${atMatch[1]}, ${atMatch[2]}`;
        } else {
            const llMatch = currentUrl.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
            if (llMatch) {
                coords = `${llMatch[1]}, ${llMatch[2]}`;
            } else {
                const qCoordsMatch = currentUrl.match(/[?&]q=(?:loc:)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
                if (qCoordsMatch) {
                    coords = `${qCoordsMatch[1]}, ${qCoordsMatch[2]}`;
                }
            }
        }

        const images = candidateImageUrl ? [candidateImageUrl] : [];

        // 1. 路線規劃：/maps/dir/起點/終點
        const dirMatch = currentUrl.match(/\/maps\/dir\/([^/]+)\/([^/@?]+)/);
        if (dirMatch) {
            const origin = cleanText(dirMatch[1]);
            const destination = cleanText(dirMatch[2]);
            if (origin && destination) {
                const text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_directions', {
                    origin,
                    destination
                });
                return { text, images };
            }
        }

        // 2. 地點標記：/maps/place/地點名稱
        const placeMatch = currentUrl.match(/\/maps\/place\/([^/@?]+)/);
        if (placeMatch) {
            const placeName = cleanText(placeMatch[1]);
            if (placeName) {
                let extraInfo = '';
                if (coords) {
                    const coordsSuffix = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_suffix', { coords });
                    extraInfo = coordsSuffix ? ` ${coordsSuffix}` : '';
                }
                const text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_place', {
                    place_name: placeName,
                    extra_info: extraInfo
                });
                return { text, images };
            }
        }

        // 3. 搜尋標記：/maps/search/搜尋關鍵字 或 ?query=關鍵字 或 ?q=關鍵字
        let query = null;
        const searchMatch = currentUrl.match(/\/maps\/search\/([^/@?]+)/);
        if (searchMatch && searchMatch[1].trim() !== '') {
            query = cleanText(searchMatch[1]);
        } else if (parsedUrl.searchParams.has('query')) {
            query = cleanText(parsedUrl.searchParams.get('query'));
        } else if (parsedUrl.searchParams.has('q')) {
            query = cleanText(parsedUrl.searchParams.get('q'));
        }

        if (query) {
            let extraInfo = '';
            if (coords) {
                const coordsSuffix = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_suffix', { coords });
                extraInfo = coordsSuffix ? ` ${coordsSuffix}` : '';
            }
            const text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_search', {
                query,
                extra_info: extraInfo
            });
            return { text, images };
        }

        // 4. 純座標位置
        if (coords) {
            const text = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_coords_only', { coords });
            return { text, images };
        }

        // 5. 無法辨識具體資訊時回傳預設 fallback 區塊
        const fallbackText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback');
        return { text: fallbackText, images };
    } catch (err) {
        logger.warn(`[GoogleMapsParser] 解析 Google Maps 網址失敗 (${urlString}): ${err.message}`);
        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'google_maps_fallback'),
            images: []
        };
    }
}

module.exports = {
    match,
    parse,
    isStaticMapImageUrl
};
