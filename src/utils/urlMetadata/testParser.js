require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const bilibiliParser = require('./bilibiliParser');

async function runTest() {
    const bvidUrl = "https://www.bilibili.com/video/BV11W4y1k7cR"; // just a random valid video
    console.log(`Testing URL: ${bvidUrl}`);
    const result = await bilibiliParser.parse(bvidUrl);
    console.log("Result:\n" + result);
}

runTest();
