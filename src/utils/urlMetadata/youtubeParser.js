const URL = require('url');
const promptLoader = require('../promptLoader');

const URL_CONTEXT_PROMPT_FILE = 'url_context_rules.md';

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be'];

/**
 * 檢查是否為 YouTube 網址，並提取 video id
 */
function extractVideoId(urlString) {
    try {
        const parsed = new URL.URL(urlString);
        const hostname = parsed.hostname.replace(/^www\./, '');
        
        if (!YOUTUBE_DOMAINS.includes(hostname)) {
            return null;
        }

        // 處理 youtu.be/VIDEO_ID
        if (hostname === 'youtu.be') {
            return parsed.pathname.substring(1);
        }

        // 處理 youtube.com/watch?v=VIDEO_ID
        if (parsed.pathname === '/watch') {
            return parsed.searchParams.get('v');
        }

        // 處理 youtube.com/shorts/VIDEO_ID 或 youtube.com/embed/VIDEO_ID
        if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) {
            const parts = parsed.pathname.split('/');
            return parts[2];
        }

        return null;
    } catch (e) {
        return null;
    }
}

function match(urlString) {
    return extractVideoId(urlString) !== null;
}

/**
 * 格式化數字 (例如 1000000 -> 1,000,000)
 */
function formatNumber(numStr) {
    if (!numStr) return '0';
    return Number(numStr).toLocaleString();
}

/**
 * 解析 YouTube 網址並使用 Data API 提取內容
 */
async function parse(urlString) {
    const videoId = extractVideoId(urlString);
    if (!videoId) return null;

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        console.warn('[YouTube 解析] 未設定 YOUTUBE_API_KEY 環境變數，跳過解析。');
        return null;
    }

    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.error(`[YouTube API 錯誤] HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return null;
        }

        const video = data.items[0];
        const snippet = video.snippet || {};
        const statistics = video.statistics || {};

        const channelTitle = snippet.channelTitle || 'Unknown';
        const title = snippet.title || 'Unknown';
        const viewCount = formatNumber(statistics.viewCount);
        
        // 擷取前 200 個字的描述
        let description = snippet.description || '';
        if (description.length > 200) {
            description = description.substring(0, 200) + '...';
        }

        // 提取影片縮圖
        const thumbnails = snippet.thumbnails || {};
        const thumbUrl = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const images = thumbUrl ? [thumbUrl] : [];

        const resultText = promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'youtube_video', {
            channel_title: channelTitle,
            view_count: viewCount,
            title: title,
            description: description || promptLoader.renderPromptSection(URL_CONTEXT_PROMPT_FILE, 'youtube_no_description')
        });

        return {
            text: resultText,
            images: images
        };
    } catch (e) {
        console.error(`[YouTube 網址解析失敗] ${e.message}`);
    }

    return null;
}

module.exports = {
    match,
    parse
};
