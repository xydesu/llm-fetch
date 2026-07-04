const cheerio = require('cheerio');
const logger = require('../logger');

module.exports = {
    match: (url) => {
        try {
            const u = new URL(url);
            return u.hostname === 'www.threads.net' || u.hostname === 'threads.net' || u.hostname === 'www.threads.com' || u.hostname === 'threads.com';
        } catch (e) {
            return false;
        }
    },
    parse: async (url) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            // Fetch directly from Threads using native node fetch
            const response = await fetch(url, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const html = await response.text();
            const $ = cheerio.load(html);

            const title = $('meta[property="og:title"]').attr('content') || '';
            let description = $('meta[property="og:description"]').attr('content') || '';
            const imageUrl = $('meta[property="og:image"]').attr('content');

            if (!title) return null;

            if (description.length > 200) {
                description = description.substring(0, 200) + '...';
            }

            const resultText = [
                `[Threads 推文 | ${title}]`,
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
            logger.warn(`Threads 解析失敗 (${url}): ${err.message}`);
            return null;
        }
    }
};
