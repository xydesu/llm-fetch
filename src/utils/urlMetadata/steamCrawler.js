const logger = require('../logger');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
};

/**
 * 從 Steam 官方商店 API 抓取即時特價與特惠遊戲
 * @param {number} limit 取得筆數
 * @returns {Promise<Array>}
 */
async function fetchSteamSpecials(limit = 15) {
    try {
        const url = 'https://store.steampowered.com/api/featuredcategories/?cc=tw&l=tchinese';
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

        const data = await res.json();
        const specials = (data.specials?.items || []).map(item => {
            const rawDiscount = item.discount_percent || 0;
            const finalPriceNum = item.final_price ? Math.round(item.final_price / 100) : 0;
            const origPriceNum = item.original_price ? Math.round(item.original_price / 100) : 0;

            return {
                id: String(item.id),
                name: item.name,
                discount: rawDiscount > 0 ? `-${rawDiscount}%` : '特惠',
                price: finalPriceNum > 0 ? `NT$ ${finalPriceNum}` : '免費遊玩',
                originalPrice: origPriceNum > 0 ? `NT$ ${origPriceNum}` : '',
                cover: item.large_capsule_image || item.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`,
                tag: rawDiscount >= 50 ? 'Steam 骨折特惠' : 'Steam 熱門特價',
                category: 'Steam 特價特惠',
                url: `https://store.steampowered.com/app/${item.id}`
            };
        });

        logger.info(`[SteamCrawler] 成功取得 Steam 官方即時特惠遊戲 ${specials.length} 款`);
        return specials.slice(0, limit);
    } catch (err) {
        logger.error('[SteamCrawler] 抓取 Steam 特價遊戲失敗:', err.message);
        return [];
    }
}

/**
 * 抓取 Steam 熱門暢銷排行 (Top Sellers)
 */
async function fetchSteamTopSellers(limit = 10) {
    try {
        const url = 'https://store.steampowered.com/api/featuredcategories/?cc=tw&l=tchinese';
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);

        const data = await res.json();
        const topSellers = (data.top_sellers?.items || []).map(item => ({
            id: String(item.id),
            name: item.name,
            discount: item.discount_percent ? `-${item.discount_percent}%` : '原價',
            price: item.final_price ? `NT$ ${Math.round(item.final_price / 100)}` : '免費',
            cover: item.large_capsule_image || item.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`,
            tag: 'Steam 暢銷榜首',
            category: 'Steam 熱銷排行',
            url: `https://store.steampowered.com/app/${item.id}`
        }));

        return topSellers.slice(0, limit);
    } catch (err) {
        logger.error('[SteamCrawler] 抓取 Steam 暢銷榜失敗:', err.message);
        return [];
    }
}

module.exports = {
    fetchSteamSpecials,
    fetchSteamTopSellers
};
