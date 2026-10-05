const cheerio = require('cheerio');
const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

module.exports = {
    match: (url) => {
        try {
            const u = new URL(url);
            return u.hostname === 'www.instagram.com' || 
                   u.hostname === 'instagram.com' || 
                   u.hostname === 'www.instagr.am' || 
                   u.hostname === 'instagr.am';
        } catch (e) {
            return false;
        }
    },
    parse: async (url) => {
        try {
            const originalUrl = new URL(url);
            // 轉換為 ddinstagram.com 代理網址
            const proxyUrl = `https://ddinstagram.com${originalUrl.pathname}${originalUrl.search}`;

            let html = null;
            let isProxySuccess = false;

            // 1. 優先從 ddinstagram 代理讀取
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(proxyUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                    }
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    html = await response.text();
                    isProxySuccess = true;
                }
            } catch (proxyErr) {
                logger.warn(`[Instagram] ddinstagram 代理請求失敗 (${url}): ${proxyErr.message}`);
            }

            // 2. 如果代理失敗，使用原生 WhatsApp UA 作為 Fallback 備援
            if (!html) {
                logger.info(`[Instagram] 啟動原生 WhatsApp UA 備援抓取 (${url})...`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                try {
                    const fallbackResponse = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'WhatsApp/2.21.12.21 A'
                        }
                    });
                    clearTimeout(timeoutId);

                    if (fallbackResponse.ok) {
                        html = await fallbackResponse.text();
                    }
                } catch (fallbackErr) {
                    logger.warn(`[Instagram] 原生抓取失敗 (${url}): ${fallbackErr.message}`);
                    clearTimeout(timeoutId);
                }
            }

            if (!html) return null;

            const $ = cheerio.load(html);

            let title = $('meta[property="og:title"]').attr('content') || 
                        $('meta[name="twitter:title"]').attr('content') || '';
            let description = $('meta[property="og:description"]').attr('content') || 
                              $('meta[name="twitter:description"]').attr('content') || '';

            // 擷取所有圖片網址（包含輪播圖 多重 og:image）
            const images = [];
            $('meta[property="og:image"]').each((_, el) => {
                const img = $(el).attr('content');
                if (img && !images.includes(img)) {
                    images.push(img);
                }
            });
            if (images.length === 0) {
                const twImg = $('meta[name="twitter:image"]').attr('content');
                if (twImg) images.push(twImg);
            }

            // 過濾無效標題或登入提示
            if (!title || title.includes('Log in') || title.includes('登入') || title === 'Instagram') {
                if (description || images.length > 0) {
                    title = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_default_title');
                } else {
                    return null;
                }
            }

            if (description.length > 250) {
                description = description.substring(0, 250) + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis');
            }

            const contentText = description || (images.length > 0
                ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_media_only_text')
                : promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_no_text'));
            const mediaCountText = images.length > 0
                ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_media_count', { count: images.length })
                : '';

            const resultText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'instagram_post', {
                author: title,
                media_text: mediaCountText,
                content_text: contentText
            });

            return {
                text: resultText,
                images: images
            };
        } catch (err) {
            logger.warn(`[Instagram 解析失敗] (${url}): ${err.message}`);
            return null;
        }
    }
};
