const defaultParser = require('./defaultParser');
const bilibiliParser = require('./bilibiliParser');
const twitterParser = require('./twitterParser');

// 解析器清單，優先順序由上到下
const parsers = [
    twitterParser,
    bilibiliParser,
    defaultParser
];

async function parseUrl(url) {
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
