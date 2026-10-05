const crypto = require('crypto');
const logger = require('../logger');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
};

// Wbi 簽名金鑰快取 (每日有效)
let wbiKeysCache = { img_key: null, sub_key: null, timestamp: 0 };
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];

const getMixinKey = (orig) => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);

function encWbi(params, img_key, sub_key) {
    const mixin_key = getMixinKey(img_key + sub_key);
    const curr_time = Math.round(Date.now() / 1000);
    const chr_filter = /[!'()*]/g;

    Object.assign(params, { wts: curr_time });
    const query = Object
        .keys(params)
        .sort()
        .map(key => {
            const value = params[key].toString().replace(chr_filter, '');
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join('&');

    const wbi_sign = crypto.createHash('md5').update(query + mixin_key).digest('hex');
    return query + '&w_rid=' + wbi_sign;
}

async function getWbiKeys() {
    const now = Date.now();
    if (wbiKeysCache.img_key && wbiKeysCache.sub_key && now - wbiKeysCache.timestamp < 6 * 60 * 60 * 1000) {
        return wbiKeysCache;
    }

    try {
        const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();
        const { img_url, sub_url } = json.data.wbi_img;

        wbiKeysCache = {
            img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
            sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.')),
            timestamp: now
        };
        return wbiKeysCache;
    } catch (err) {
        logger.warn(`[BilibiliCrawler] 取得 Wbi Keys 失敗: ${err.message}`);
        return null;
    }
}

// 分區名稱與 Bilibili RID 對照表
const CATEGORY_RID_MAP = {
    'gaming': 17,    // 單機遊戲
    'anime': 1,      // 動畫主區
    'vtuber': 230,   // VTuber / 虛擬主播
    'kichiku': 22    // 鬼畜
};

/**
 * 抓取 Bilibili 首頁動態推薦流 (網頁版首頁「換一換」推薦)
 * @param {number} ps 數量
 * @returns {Promise<Array>} 影片列表
 */
async function fetchHomepageRcmd(ps = 20) {
    try {
        const keys = await getWbiKeys();
        if (!keys) return [];

        const query = encWbi({ ps, fresh_type: 3 }, keys.img_key, keys.sub_key);
        const url = `https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?${query}`;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code !== 0 || !json.data || !Array.isArray(json.data.item)) {
            logger.warn(`[BilibiliCrawler] 抓取 B 站首頁推薦流失敗: ${json.message || '無內容'}`);
            return [];
        }

        return json.data.item.map(formatVideoItem);
    } catch (err) {
        logger.error(`[BilibiliCrawler] 抓取 B 站首頁推薦流時發生網路錯誤: ${err.message}`);
        return [];
    }
}

/**
 * 抓取 Bilibili 全站熱門影片列表
 * @param {number} page 頁數
 * @param {number} pageSize 每頁數量
 * @returns {Promise<Array>} 影片列表
 */
async function fetchPopularVideos(page = 1, pageSize = 20) {
    try {
        const url = `https://api.bilibili.com/x/web-interface/popular?pn=${page}&ps=${pageSize}`;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code !== 0 || !json.data || !json.data.list) {
            logger.warn(`[BilibiliCrawler] 抓取熱門影片失敗: ${json.message || '格式不符'}`);
            return [];
        }

        return json.data.list.map(formatVideoItem);
    } catch (err) {
        logger.error(`[BilibiliCrawler] 抓取全站熱門影片時發生網路錯誤: ${err.message}`);
        return [];
    }
}

/**
 * 抓取 Bilibili 全站熱搜榜關鍵字與熱點話題
 * @param {number} limit 數量上限
 * @returns {Promise<Array<string>>} 關鍵字列表
 */
async function fetchHotKeywords(limit = 10) {
    try {
        const url = 'https://api.bilibili.com/x/web-interface/search/square?limit=' + limit;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code !== 0 || !json.data || !json.data.trending || !json.data.trending.list) {
            logger.warn(`[BilibiliCrawler] 抓取熱搜關鍵字失敗: ${json.message || '無熱搜數據'}`);
            return [];
        }

        return json.data.trending.list
            .slice(0, limit)
            .map(item => item.keyword || item.show_name)
            .filter(Boolean);
    } catch (err) {
        logger.error(`[BilibiliCrawler] 抓取熱搜關鍵字時發生網路錯誤: ${err.message}`);
        return [];
    }
}

/**
 * 抓取特定分區排行榜熱門影片 (如單機遊戲、動漫、VTuber)
 * @param {string|number} categoryOrRid 分區代碼 ('gaming', 'anime', 'vtuber') 或 RID
 * @returns {Promise<Array>} 影片列表
 */
async function fetchCategoryRanking(categoryOrRid = 'gaming') {
    try {
        let rid = typeof categoryOrRid === 'number' ? categoryOrRid : CATEGORY_RID_MAP[categoryOrRid];
        if (!rid) rid = 17;

        const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code === 0 && json.data && Array.isArray(json.data.list) && json.data.list.length > 0) {
            return json.data.list.map(formatVideoItem);
        }

        // 降級備用方案：抓取全站熱門影片並依分類過濾
        logger.info(`[BilibiliCrawler] 分區 (RID: ${rid}) 榜單未回傳資料，轉為使用全站熱門過濾...`);
        const popularList = await fetchPopularVideos(1, 50);
        
        const categoryKeywords = {
            'gaming': ['遊戲', '单机', '手游', 'MC', 'Steam', '主机'],
            'anime': ['動畫', '国创', '番剧', '二次元', 'MAD'],
            'vtuber': ['VTuber', '虛擬', 'V圈', '歌回'],
            'kichiku': ['鬼畜', '鬼畜调教', '音MAD']
        };

        const keywords = categoryKeywords[categoryOrRid] || [];
        if (keywords.length === 0) return popularList;

        const filtered = popularList.filter(v => 
            keywords.some(kw => v.tname.includes(kw) || v.title.includes(kw) || v.desc.includes(kw))
        );

        return filtered.length > 0 ? filtered : popularList;
    } catch (err) {
        logger.error(`[BilibiliCrawler] 抓取分區熱門榜時發生錯誤: ${err.message}`);
        return await fetchPopularVideos(1, 20);
    }
}

/**
 * 抓取 Bilibili 入站必刷 / 寶藏優質影片列表 (首頁推薦精選)
 * @returns {Promise<Array>} 影片列表
 */
async function fetchPreciousVideos() {
    try {
        const url = 'https://api.bilibili.com/x/web-interface/popular/precious?page_size=100&page=1';
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code !== 0 || !json.data || !Array.isArray(json.data.list)) {
            logger.warn(`[BilibiliCrawler] 抓取寶藏精選失敗: ${json.message || '格式不符'}`);
            return [];
        }

        return json.data.list.map(formatVideoItem);
    } catch (err) {
        logger.error(`[BilibiliCrawler] 抓取寶藏精選影片時發生錯誤: ${err.message}`);
        return [];
    }
}

/**
 * 抓取單一影片的相關推薦影片 (模擬 B 站首頁/側邊欄聯想推薦)
 * @param {string} bvid 目標影片 BVID
 * @returns {Promise<Array>} 相關推薦影片列表
 */
async function fetchRelatedVideos(bvid) {
    try {
        if (!bvid) return [];
        const url = `https://api.bilibili.com/x/web-interface/archive/related?bvid=${bvid}`;
        const res = await fetch(url, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP 狀態碼異常: ${res.status}`);
        const json = await res.json();

        if (json.code !== 0 || !Array.isArray(json.data)) {
            return [];
        }

        return json.data.map(formatVideoItem);
    } catch (err) {
        logger.warn(`[BilibiliCrawler] 抓取關聯推薦影片 (${bvid}) 失敗: ${err.message}`);
        return [];
    }
}

/**
 * 格式化單一影片資料項並計算多維品質指標
 */
function formatVideoItem(item) {
    const stat = item.stat || {};
    const view = stat.view || item.view || 0;
    const like = stat.like || item.like || 0;
    const coin = stat.coin || item.coin || 0;
    const favorite = stat.favorite || item.favorite || 0;
    const danmaku = stat.danmaku || item.danmaku || 0;

    // 計算多維品質指標
    const coinToLike = like > 0 ? (coin / like) : 0;
    const likeToView = view > 0 ? (like / view) : 0;

    // 品質評等：
    // 深度良心神作 (High Effort): 投幣點讚比 >= 0.12 或 高收藏率
    // 高口碑好片 (High Rep): 點讚播放比 >= 0.04
    // 疑似低質營銷號/標題黨 (Potential Clickbait): 播放量高但點讚比 < 0.008 且 投幣極低
    let qualityTag = '日常內容';
    if (coinToLike >= 0.12 || (like >= 8000 && coinToLike >= 0.08)) {
        qualityTag = '🔥 深度優質/良心神作 (高幣讚比)';
    } else if (likeToView >= 0.04) {
        qualityTag = '⭐ 高口碑熱門 (高點讚率)';
    } else if (view > 30000 && likeToView < 0.008 && coinToLike < 0.02) {
        qualityTag = '⚠️ 疑似低質營銷號/標題黨 (低幣讚率)';
    }

    let pic = item.pic || item.cover || '';
    if (pic.startsWith('http://')) pic = pic.replace('http://', 'https://');

    return {
        bvid: item.bvid || '',
        title: (item.title || '').replace(/<[^>]+>/g, '').trim(),
        desc: item.desc || '',
        upName: item.owner ? item.owner.name : (item.author || item.up_name || ''),
        tname: item.tname || item.typename || '',
        pic: pic,
        cover_url: pic,
        view: view,
        like: like,
        coin: coin,
        favorite: favorite,
        danmaku: danmaku,
        coin_to_like_ratio: coinToLike,
        like_to_view_ratio: likeToView,
        quality_tag: qualityTag,
        rcmdReason: item.rcmd_reason ? item.rcmd_reason.content : '',
        url: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : ''
    };
}

module.exports = {
    fetchHomepageRcmd,
    fetchPopularVideos,
    fetchHotKeywords,
    fetchCategoryRanking,
    fetchPreciousVideos,
    fetchRelatedVideos,
    CATEGORY_RID_MAP
};
