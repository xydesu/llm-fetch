const crypto = require('crypto');
const logger = require('../logger');

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
    // 快取 6 小時
    if (wbiKeysCache.img_key && wbiKeysCache.sub_key && now - wbiKeysCache.timestamp < 6 * 60 * 60 * 1000) {
        return wbiKeysCache;
    }

    try {
        const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const json = await res.json();
        const { img_url, sub_url } = json.data.wbi_img;

        wbiKeysCache = {
            img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
            sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.')),
            timestamp: now
        };
        return wbiKeysCache;
    } catch (err) {
        logger.warn(`取得 Bilibili Wbi Keys 失敗: ${err.message}`);
        return null;
    }
}

async function resolveB23Tv(url) {
    try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
            return res.headers.get('location');
        }
    } catch (e) {
        // do nothing
    }
    return url;
}

module.exports = {
    match: (url) => {
        return /bilibili\.com\/video\/[BbaA][Vv]/i.test(url) || /b23\.tv\//i.test(url);
    },
    parse: async (url) => {
        try {
            // 解析短網址
            if (url.includes('b23.tv')) {
                url = await resolveB23Tv(url);
            }

            // 提取 bvid
            const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
            if (!bvidMatch) return null;
            const bvid = bvidMatch[1];

            // 1. 取得影片基本資訊 (無須登入)
            const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const viewJson = await viewRes.json();
            
            if (viewJson.code !== 0) {
                logger.warn(`Bilibili 影片解析失敗 (${bvid}): ${viewJson.message}`);
                return null;
            }

            const videoData = viewJson.data;
            const title = videoData.title;
            const upName = videoData.owner.name;
            const desc = videoData.desc || '';
            const cid = videoData.cid;
            const up_mid = videoData.owner.mid;

            let resultText = `[Bilibili 影片: ${title} | UP主: ${upName} | 描述: ${desc.slice(0, 100)}${desc.length > 100 ? '...' : ''}]`;

            // 2. 取得 AI 總結 (需要 SESSDATA)
            const sessdata = process.env.BILIBILI_SESSDATA;
            if (sessdata) {
                const keys = await getWbiKeys();
                if (keys) {
                    const params = { bvid, cid, up_mid };
                    const query = encWbi(params, keys.img_key, keys.sub_key);

                    const conclusionRes = await fetch(`https://api.bilibili.com/x/web-interface/view/conclusion/get?${query}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Cookie': `SESSDATA=${sessdata}`
                        }
                    });
                    const conclusionJson = await conclusionRes.json();
                    logger.debug(`Conclusion JSON: ${JSON.stringify(conclusionJson)}`);

                    if (conclusionJson.code === 0 && conclusionJson.data && conclusionJson.data.model_result) {
                        const modelResult = conclusionJson.data.model_result;
                        let summary = modelResult.summary || '';
                        
                        if (summary) {
                            resultText += `\n[AI 總結: ${summary}]`;
                        }

                        // 加入提綱
                        if (modelResult.outline && modelResult.outline.length > 0) {
                            let outlineTexts = [];
                            for (const part of modelResult.outline) {
                                if (part.title) outlineTexts.push(`- ${part.title}`);
                            }
                            if (outlineTexts.length > 0) {
                                resultText += `\n[影片提綱:\n${outlineTexts.join('\n')}]`;
                            }
                        }
                    } else if (conclusionJson.code === -101) {
                        logger.warn(`Bilibili AI 總結失敗: 帳號未登入 (SESSDATA 可能過期)`);
                        resultText += `\n[系統提示: Bilibili SESSDATA 已失效，無法取得 AI 總結]`;
                    }
                }
            }

            return {
                text: resultText,
                images: []
            };
        } catch (err) {
            logger.warn(`Bilibili 網址處理失敗 (${url}): ${err.message}`);
            return null;
        }
    }
};
