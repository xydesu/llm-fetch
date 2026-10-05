const cheerio = require('cheerio');
const logger = require('../logger');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
};

/**
 * 抓取 Twitter / X 即時趨勢話題 (支援 Japan 與 Global)
 * @param {string} region 'japan' 或 'global'
 * @param {number} limit 取得筆數
 * @returns {Promise<Array>}
 */
async function fetchTwitterTrends(region = 'japan', limit = 15) {
    try {
        const targetUrl = region === 'global' ? 'https://trends24.in/' : `https://trends24.in/${region}/`;
        const res = await fetch(targetUrl, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

        const html = await res.text();
        const $ = cheerio.load(html);
        const trends = [];

        $('.trend-card__list').first().find('li').each((i, el) => {
            if (trends.length >= limit) return;
            const topic = $(el).find('a').first().text().trim();
            const tweetCount = $(el).find('.tweet-count').text().trim();
            if (topic) {
                trends.push({
                    topic,
                    tweetCount: tweetCount || null,
                    tag: topic.startsWith('#') ? 'Twitter 熱門標籤' : 'ACG 與社群流行趨勢',
                    category: topic.startsWith('#') ? '推特熱搜' : '社群熱門趨勢',
                    desc: tweetCount ? `Twitter 即時熱門話題，累計約 ${tweetCount} 則推文` : 'Twitter 即時熱榜話題',
                    url: `https://twitter.com/search?q=${encodeURIComponent(topic)}`
                });
            }
        });

        logger.info(`[TwitterCrawler] 成功取得 Twitter (${region}) ${trends.length} 則即時真實趨勢`);
        return trends;
    } catch (err) {
        logger.error(`[TwitterCrawler] 取得 Twitter (${region}) 趨勢失敗:`, err.message);
        return [];
    }
}

module.exports = {
    fetchTwitterTrends
};
