const cheerio = require('cheerio');
const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

// 禁止作為公開網頁爬取與截圖的內部或受保護域名清單
const RESTRICTED_DOMAINS = [
    'discord.com',
    'discordapp.com',
    'canary.discord.com',
    'ptb.discord.com'
];

/**
 * 檢查網址是否屬於禁止通用爬取與截圖的內部域名
 * @param {string} urlString 
 * @returns {boolean}
 */
function isRestrictedDomain(urlString) {
    try {
        const u = new URL(urlString);
        return RESTRICTED_DOMAINS.some(domain => u.hostname === domain || u.hostname.endsWith('.' + domain));
    } catch (e) {
        return false;
    }
}

async function fetchUrlMetadata(url) {
    try {
        if (isRestrictedDomain(url)) {
            return { isRestricted: true };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4秒超時
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                // 偽裝成瀏覽器，避免被一般網站直接阻擋
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        // 遭遇權限受限或未授權時，直接標記為受限內容，避免錯誤爬取
        if (response.status === 401 || response.status === 403) {
            return { isRestricted: true };
        }

        if (!response.ok) return null;
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) return null;

        const text = await response.text();
        const $ = cheerio.load(text);
        
        let title = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').trim();
        let description = ($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '').trim();
        let ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || null;
        if (ogImage) ogImage = ogImage.trim();
        
        if (!title && !description) return null;

        // 登入頁、無實質內容的社群首頁佔位符或宣傳首頁過濾
        const isLoginOrGeneric = /^(threads|instagram|twitter|x|facebook|discord)?\s*[•·-]?\s*(log\s*in|sign\s*in|登入|登錄|註冊|請先登入)$/i.test(title) ||
                                 (!description && /^(threads|instagram|twitter|facebook|discord)$/i.test(title)) ||
                                 /join threads to share ideas|log in with your instagram|discord is great for playing games/i.test(description) ||
                                 /discord - group chat that[’']s all fun & games/i.test(title) ||
                                 /^(403\s*forbidden|401\s*unauthorized|access\s*denied|just\s*a\s*moment)/i.test(title);

        if (isLoginOrGeneric) {
            return { isRestricted: true };
        }

        return { 
            title: title, 
            description: description,
            ogImage: ogImage
        };
    } catch (err) {
        logger.warn(`抓取網址 metadata 失敗 (${url}): ${err.message}`);
        return null;
    }
}

async function fetchWebpageScreenshot(url) {
    try {
        if (isRestrictedDomain(url)) {
            return null;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒截圖超時

        const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`;
        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const json = await response.json();
        if (json && json.status === 'success' && json.data && json.data.screenshot && json.data.screenshot.url) {
            return json.data.screenshot.url;
        }
        return null;
    } catch (err) {
        logger.warn(`生成網頁畫面截圖失敗 (${url}): ${err.message}`);
        return null;
    }
}

module.exports = {
    match: () => true, // 預設解析器匹配所有無法被其他專用解析器處理的網址
    parse: async (url) => {
        // 先針對受限制的內部域名進行快速攔截，嚴禁發起爬蟲或截圖
        if (isRestrictedDomain(url)) {
            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_restricted_internal'),
                images: []
            };
        }

        // 先抓取 HTML Metadata 以便確認是否為受限頁面或登入牆
        const metadata = await fetchUrlMetadata(url);

        // 若確認為登入頁、權限受限或無權限，直接回傳看不到內容，禁止截圖與宣傳圖
        if (metadata && metadata.isRestricted) {
            return {
                text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_restricted_login'),
                images: []
            };
        }

        if (!metadata || !metadata.title) return null;

        // 若不是受限頁面，才嘗試非同步獲取網頁即時截圖
        let screenshotUrl = null;
        try {
            screenshotUrl = await fetchWebpageScreenshot(url);
        } catch (screenshotErr) {
            // 忽略截圖失敗
        }

        const title = metadata.title;
        const description = metadata.description || '';

        const images = [];
        if (metadata && metadata.ogImage) {
            // 排除常見的官方預設 Logo、icon 或品牌圖標
            const isDefaultLogo = /rsrc\.php|favicon|apple-touch-icon|site-logo|threads_icon|discordapp\.net\/assets/i.test(metadata.ogImage);
            if (!isDefaultLogo) {
                images.push(metadata.ogImage);
            }
        }
        if (screenshotUrl && !images.includes(screenshotUrl)) {
            images.push(screenshotUrl);
        }

        const mediaCountText = images.length > 0
            ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_media_count', { count: images.length })
            : '';

        return {
            text: promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'webpage_link', {
                title: title,
                description: description,
                media_text: mediaCountText
            }),
            images: images
        };
    }
};
