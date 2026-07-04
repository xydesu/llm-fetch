const cheerio = require('cheerio');
const logger = require('../logger');

module.exports = {
    match: (url) => {
        try {
            const u = new URL(url);
            return u.hostname === 'www.facebook.com' || u.hostname === 'facebook.com' || u.hostname === 'fb.com';
        } catch (e) {
            return false;
        }
    },
    parse: async (url) => {
        try {
            // Replace facebook domain with facebed.com
            const originalUrl = new URL(url);
            const facebedUrl = `https://facebed.com${originalUrl.pathname}${originalUrl.search}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            // Fetch from facebed.com
            const response = await fetch(facebedUrl, {
                signal: controller.signal,
                headers: {
                    // Using Discordbot UA as facebed is built for Discord
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const html = await response.text();
            const $ = cheerio.load(html);

            let title = $('meta[property="og:title"]').attr('content') || '';
            let description = $('meta[property="og:description"]').attr('content') || '';
            let imageUrl = $('meta[property="og:image"]').attr('content');

            // 如果 Facebed 被阻擋 (返回登入畫面)，我們直接使用 WhatsApp UA 去抓原本的 FB 網址作為 Fallback
            if (!title || title.includes('Log in or sign up') || title.includes('登入') || title.includes('Facebook')) {
                logger.info(`[Facebook] Facebed 被阻擋，嘗試使用原生 WhatsApp UA 備用方案...`);
                const nativeController = new AbortController();
                const nativeTimeoutId = setTimeout(() => nativeController.abort(), 10000);
                
                try {
                    const fallbackResponse = await fetch(url, {
                        signal: nativeController.signal,
                        headers: {
                            'User-Agent': 'WhatsApp/2.21.12.21 A'
                        }
                    });
                    
                    if (fallbackResponse.ok) {
                        const fallbackHtml = await fallbackResponse.text();
                        const fallback$ = cheerio.load(fallbackHtml);
                        
                        const fallbackTitle = fallback$('meta[property="og:title"]').attr('content');
                        if (fallbackTitle && !fallbackTitle.includes('Log in or sign up') && !fallbackTitle.includes('登入')) {
                            title = fallbackTitle;
                            description = fallback$('meta[property="og:description"]').attr('content') || '';
                            imageUrl = fallback$('meta[property="og:image"]').attr('content');
                        }
                    }
                } catch (fallbackErr) {
                    logger.warn(`[Facebook] 備用方案抓取失敗: ${fallbackErr.message}`);
                } finally {
                    clearTimeout(nativeTimeoutId);
                }
            }

            if (!title || title.includes('Log in or sign up') || title === 'Facebook') return null;

            if (description.length > 200) {
                description = description.substring(0, 200) + '...';
            }

            const resultText = [
                `[Facebook 推文 | ${title}]`,
                `${description}`
            ].join('\n');

            const images = [];
            if (imageUrl) {
                images.push(imageUrl);
            }

            return {
                text: resultText,
                images: images
            };
        } catch (err) {
            logger.warn(`Facebed 解析失敗 (${url}): ${err.message}`);
            return null;
        }
    }
};
