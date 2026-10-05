const cheerio = require('cheerio');
const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

module.exports = {
    match: (url) => {
        try {
            const u = new URL(url);
            return u.hostname === 'www.threads.net' || u.hostname === 'threads.net' || 
                   u.hostname === 'www.threads.com' || u.hostname === 'threads.com';
        } catch (e) {
            return false;
        }
    },
    parse: async (url) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            // 帶上常用社群爬蟲 UA，以利獲取公開 OpenGraph 標籤
            const response = await fetch(url, {
                signal: controller.signal,
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            // 檢查最終轉址網址，若被重導向至無效貼文或登入頁則判定失效
            const finalUrl = response.url || '';
            if (finalUrl.includes('error=invalid_post') || finalUrl.includes('/login')) {
                logger.debug(`[Threads] 貼文已失效或為私人貼文 (${url} -> ${finalUrl})`);
                return null;
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            const title = ($('meta[property="og:title"]').attr('content') || '').trim();
            let description = ($('meta[property="og:description"]').attr('content') || '').trim();
            const imageUrl = ($('meta[property="og:image"]').attr('content') || '').trim();

            if (!title) return null;

            // 檢查是否為登入頁/註冊牆佔位內容
            const isLoginPage = /^(threads\s*[•·-]?\s*)?(log\s*in|sign\s*in|登入|登錄)/i.test(title) ||
                                /join threads to share ideas/i.test(description) ||
                                /log in with your instagram/i.test(description);
            if (isLoginPage) {
                logger.debug(`[Threads] 網址為登入頁佔位內容，略過解析: ${title}`);
                return null;
            }

            if (description.length > 200) {
                description = description.substring(0, 200) + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis');
            }

            const images = [];
            // 擷取所有圖片（支援多圖輪播）
            $('meta[property="og:image"]').each((_, el) => {
                const img = ($(el).attr('content') || '').trim();
                if (img && !images.includes(img)) {
                    // 排除 Meta 官方靜態 Logo / 圖示資源
                    const isOfficialLogo = img.includes('static.cdninstagram.com') ||
                                           img.includes('rsrc.php') ||
                                           img.includes('threads_icon') ||
                                           img.includes('favicon');
                    if (!isOfficialLogo) {
                        images.push(img);
                    }
                }
            });

            if (images.length === 0 && imageUrl) {
                const isOfficialLogo = imageUrl.includes('static.cdninstagram.com') ||
                                       imageUrl.includes('rsrc.php') ||
                                       imageUrl.includes('threads_icon') ||
                                       imageUrl.includes('favicon');
                if (!isOfficialLogo) {
                    images.push(imageUrl);
                }
            }

            const contentText = description || (images.length > 0
                ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'threads_media_only_text')
                : promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'threads_no_text'));
            const mediaCountText = images.length > 0
                ? ' ' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'threads_media_count', { count: images.length })
                : '';

            const resultText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'threads_post', {
                author: title,
                media_text: mediaCountText,
                content_text: contentText
            });

            return {
                text: resultText,
                images: images
            };
        } catch (err) {
            logger.warn(`Threads 解析失敗 (${url}): ${err.message}`);
            return null;
        }
    }
};
