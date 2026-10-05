const crypto = require('crypto');
const cheerio = require('cheerio');
const logger = require('../logger');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

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

            let title = '';
            let upName = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_unknown_up');
            let desc = '';
            let picUrl = '';
            let cid = null;
            let up_mid = null;

            // 1. 優先嘗試 API 讀取
            try {
                const keys = await getWbiKeys();
                let apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
                if (keys) {
                    const query = encWbi({ bvid }, keys.img_key, keys.sub_key);
                    apiUrl = `https://api.bilibili.com/x/web-interface/wbi/view?${query}`;
                }

                const viewRes = await fetch(apiUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    signal: AbortSignal.timeout(6000)
                });
                const text = await viewRes.text();
                if (text.startsWith('{')) {
                    const viewJson = JSON.parse(text);
                    if (viewJson.code === 0 && viewJson.data) {
                        const videoData = viewJson.data;
                        title = videoData.title || '';
                        upName = videoData.owner?.name || promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_unknown_up');
                        desc = videoData.desc || '';
                        picUrl = (videoData.pic || '').trim();
                        cid = videoData.cid;
                        up_mid = videoData.owner?.mid;
                    }
                }
            } catch (apiErr) {
                logger.debug(`[Bilibili] API 解析失敗，啟動網頁 HTML 備援: ${apiErr.message}`);
            }

            // 2. 若 API 遭風控或失敗，使用原生 HTML OpenGraph 進行備援解析
            if (!title) {
                try {
                    const pageRes = await fetch(`https://www.bilibili.com/video/${bvid}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7'
                        },
                        signal: AbortSignal.timeout(6000)
                    });
                    if (pageRes.ok) {
                        const html = await pageRes.text();
                        const $ = cheerio.load(html);
                        title = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/_哔哩哔哩_bilibili$/i, '').trim();
                        desc = ($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '').trim();
                        picUrl = ($('meta[property="og:image"]').attr('content') || '').trim();
                        upName = ($('meta[name="author"]').attr('content') || '').trim() || promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_up_fallback');
                    }
                } catch (htmlErr) {
                    logger.warn(`[Bilibili] HTML 備援解析失敗: ${htmlErr.message}`);
                }
            }

            if (!title) return null;

            let images = [];
            if (picUrl) {
                if (picUrl.startsWith('//')) {
                    picUrl = 'https:' + picUrl;
                }
                images.push(picUrl);
            }

            const descriptionText = desc.slice(0, 100) + (desc.length > 100 ? promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'description_ellipsis') : '');
            let resultText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_video', {
                title: title,
                up_name: upName,
                description: descriptionText
            });

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
                            resultText += '\n' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_ai_summary', { summary: summary });
                        }

                        // 加入提綱
                        if (modelResult.outline && modelResult.outline.length > 0) {
                            let outlineTexts = [];
                            for (const part of modelResult.outline) {
                                if (part.title) outlineTexts.push(promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_outline_item', { title: part.title }));
                            }
                            if (outlineTexts.length > 0) {
                                resultText += '\n' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_outline', { outline: outlineTexts.join('\n') });
                            }
                        }
                    } else if (conclusionJson.code === -101) {
                        logger.warn(`Bilibili AI 總結失敗: 帳號未登入 (SESSDATA 可能過期)`);
                        resultText += '\n' + promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'bilibili_sessdata_invalid');
                    }
                }
            }

            return {
                text: resultText,
                images: images
            };
        } catch (err) {
            logger.warn(`Bilibili 網址處理失敗 (${url}): ${err.message}`);
            return null;
        }
    }
};
