const defaultParser = require('./defaultParser');
const bilibiliParser = require('./bilibiliParser');
const twitterParser = require('./twitterParser');
const youtubeParser = require('./youtubeParser');
const facebookParser = require('./facebookParser');

// 解析器清單，優先順序由上到下
const parsers = [
    youtubeParser,
    twitterParser,
    bilibiliParser,
    facebookParser,
    defaultParser
];

async function parseUrl(url) {
    // 確保網址包含 protocol，避免 new URL() 拋出錯誤
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    for (const parser of parsers) {
        if (parser.match(url)) {
            return await parser.parse(url);
        }
    }
    return null;
}

module.exports = {
    parseUrl
};
